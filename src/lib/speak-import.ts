import * as XLSX from "xlsx";
import { db } from "./db";

// 교재 콘텐츠 가져오기 — 엑셀 업로드와 JSON 직접 입력이 같은 경로를 쓴다.
//
// 교재 1권 = PART 1·2, PART 하나 = Toon World 8레슨 + Book Club 8레슨.
// 엑셀 시트 (이름으로 찾음):
//   레슨 : 파트 | 영역 | 레슨 | 레슨명 | 복습 | 책            (선택 — 이름·복습·BookA/B 지정)
//   단어 : 파트 | 영역 | 레슨 | 단어 | 품사 | 뜻 | 심화       (심화 칸에 O/1이면 심화반 전용)
//   문장 : 파트 | 영역 | 레슨 | A1 | A1뜻 | B1 | B1뜻 | A2 | A2뜻 | B2 | B2뜻
//   본문 : 파트 | 영역 | 레슨 | 본문 | 해석                   (Book Club 리딩)
// 영역: T/Toon/말하기 → TOON,  B/Book/리딩 → READING

export type ImportLine = { speaker: "A" | "B"; text: string; ko?: string };
export type ImportWord = {
  text: string; pos?: string; meanings: string[];
  example?: string; exampleKo?: string; advancedOnly?: boolean;
};
export type ImportLesson = {
  part: number; // 1 | 2
  area: "TOON" | "READING";
  order: number; // 1..8
  name?: string;
  isReview?: boolean;
  bookLabel?: string; // Book A | Book B
  passage?: string;
  passageKo?: string;
  words?: ImportWord[];
  dialogues?: { lines: ImportLine[] }[];
};

const cell = (v: unknown) => String(v ?? "").trim();
const truthy = (v: string) => /^(o|y|yes|true|1|심화|복습)$/i.test(v.trim());

function areaOf(v: string): "TOON" | "READING" | null {
  const t = v.trim().toUpperCase();
  if (!t) return null;
  if (t.startsWith("T") || v.includes("툰") || v.includes("말하기") || v.includes("스피")) return "TOON";
  if (t.startsWith("B") || t.startsWith("R") || v.includes("북") || v.includes("리딩") || v.includes("읽")) return "READING";
  return null;
}

// "I'm great. | I am great" → { text, alts }
function splitAlts(raw: string): { text: string; alts: string[] } {
  const parts = raw.split("|").map((p) => p.trim()).filter(Boolean);
  return { text: parts[0] ?? "", alts: parts.slice(1) };
}

function sheetRows(wb: XLSX.WorkBook, patterns: RegExp[]): string[][] {
  for (const name of wb.SheetNames) {
    if (patterns.some((p) => p.test(name))) {
      const raw = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets[name], { header: 1, defval: "" });
      return raw.map((r) => r.map(cell));
    }
  }
  return [];
}

export function parseWorkbook(buf: Buffer): ImportLesson[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const map = new Map<string, ImportLesson>();
  const key = (p: number, a: string, o: number) => `${p}:${a}:${o}`;
  // 앞 3칸(파트·영역·레슨)이 유효한 행만 처리 → 제목 행은 자동으로 걸러진다
  const locate = (row: string[]): ImportLesson | null => {
    const part = Number(row[0]);
    const area = areaOf(row[1]);
    const order = Number(row[2]);
    if (!Number.isInteger(part) || part <= 0 || !area || !Number.isInteger(order) || order <= 0) return null;
    const k = key(part, area, order);
    if (!map.has(k)) map.set(k, { part, area, order, words: [], dialogues: [] });
    return map.get(k)!;
  };

  for (const row of sheetRows(wb, [/^레슨/, /lesson/i])) {
    const L = locate(row);
    if (!L) continue;
    if (row[3]) L.name = row[3];
    if (truthy(row[4] ?? "")) L.isReview = true;
    if (row[5]) L.bookLabel = row[5];
  }

  for (const row of sheetRows(wb, [/단어/, /word/i, /vocab/i])) {
    const L = locate(row);
    if (!L) continue;
    const [, , , text, pos, meanings, adv] = row;
    if (!text || !meanings) continue;
    L.words!.push({
      text,
      pos: pos || "n",
      meanings: meanings.split(/[,;/·]/).map((m) => m.trim()).filter(Boolean),
      advancedOnly: truthy(adv ?? ""),
    });
  }

  for (const row of sheetRows(wb, [/문장/, /대화/, /sentence/i, /dialog/i])) {
    const L = locate(row);
    if (!L) continue;
    const [, , , a1, a1ko, b1, b1ko, a2, a2ko, b2, b2ko] = row;
    const lines: ImportLine[] = [];
    const push = (speaker: "A" | "B", text: string, ko: string) => {
      if (text) lines.push({ speaker, text, ko: ko || undefined });
    };
    push("A", a1, a1ko); push("B", b1, b1ko); push("A", a2, a2ko); push("B", b2, b2ko);
    if (lines.length >= 2) L.dialogues!.push({ lines });
  }

  for (const row of sheetRows(wb, [/본문/, /passage/i, /reading/i])) {
    const L = locate(row);
    if (!L) continue;
    if (row[3]) L.passage = row[3];
    if (row[4]) L.passageKo = row[4];
  }

  return [...map.values()].sort((a, b) => a.part - b.part || a.area.localeCompare(b.area) || a.order - b.order);
}

const AREA_KO: Record<string, string> = { TOON: "Toon World", READING: "Book Club" };

// 레슨 단위 교체 저장 (같은 레슨을 다시 올리면 그 레슨 내용만 새로 덮어씀)
export async function importTextbookContent(
  textbookId: number,
  lessons: ImportLesson[],
  createdById?: number
): Promise<{ lessons: number; words: number; advancedWords: number; dialogues: number; lines: number; passages: number }> {
  const textbook = await db.textbook.findUnique({ where: { id: textbookId } });
  if (!textbook) throw new Error("교재를 찾을 수 없습니다.");

  let wordTotal = 0, advTotal = 0, dlgTotal = 0, lineTotal = 0, passageTotal = 0;

  for (const L of lessons) {
    const part = await db.textbookPart.upsert({
      where: { textbookId_order: { textbookId, order: L.part } },
      update: {},
      create: { textbookId, order: L.part },
    });

    const existing = await db.lesson.findUnique({
      where: { partId_area_order: { partId: part.id, area: L.area, order: L.order } },
    });
    const lessonName = L.name || existing?.name || `${AREA_KO[L.area]} Lesson ${L.order}`;
    const patch = {
      name: lessonName,
      ...(L.isReview !== undefined ? { isReview: L.isReview } : {}),
      ...(L.bookLabel !== undefined ? { bookLabel: L.bookLabel } : {}),
      ...(L.passage !== undefined ? { passage: L.passage } : {}),
      ...(L.passageKo !== undefined ? { passageKo: L.passageKo } : {}),
    };
    const lesson = existing
      ? await db.lesson.update({ where: { id: existing.id }, data: patch })
      : await db.lesson.create({ data: { partId: part.id, area: L.area, order: L.order, ...patch } });
    if (L.passage) passageTotal++;

    // 단어 — 레슨 전용 단어장에 담아 기존 단어 학습 엔진을 그대로 재사용
    if (L.words?.length) {
      const wbName = `${textbook.name} P${L.part} ${AREA_KO[L.area]} L${L.order}`;
      let wordbookId = lesson.wordbookId;
      if (wordbookId) {
        await db.wordbook.update({ where: { id: wordbookId }, data: { name: wbName } });
        await db.word.deleteMany({ where: { wordbookId } });
      } else {
        const created = await db.wordbook.create({ data: { name: wbName, createdById: createdById ?? null } });
        wordbookId = created.id;
        await db.lesson.update({ where: { id: lesson.id }, data: { wordbookId } });
      }
      // 기본 단어 먼저, 심화 추가 단어를 뒤에 — 기본반은 앞쪽만 학습한다
      const ordered = [...L.words].sort((a, b) => Number(a.advancedOnly ?? false) - Number(b.advancedOnly ?? false));
      await db.word.createMany({
        data: ordered.map((w, i) => ({
          wordbookId: wordbookId!,
          day: Math.floor(i / 30) + 1,
          text: w.text,
          pos: w.pos || "n",
          meaningsJson: JSON.stringify(w.meanings),
          example: w.example ?? null,
          exampleKo: w.exampleKo ?? null,
          advancedOnly: !!w.advancedOnly,
        })),
      });
      wordTotal += ordered.length;
      advTotal += ordered.filter((w) => w.advancedOnly).length;
    }

    // 문장(대화) — 레슨의 기존 대화를 지우고 새로 넣는다
    if (L.dialogues?.length) {
      await db.dialogue.deleteMany({ where: { lessonId: lesson.id } });
      let order = 1;
      for (const d of L.dialogues) {
        const created = await db.dialogue.create({ data: { lessonId: lesson.id, order: order++ } });
        await db.dialogueLine.createMany({
          data: d.lines.map((ln, i) => {
            const { text, alts } = splitAlts(ln.text);
            return {
              dialogueId: created.id,
              order: i + 1,
              speaker: ln.speaker,
              text,
              textKo: ln.ko ?? null,
              altsJson: alts.length ? JSON.stringify(alts) : null,
            };
          }),
        });
        lineTotal += d.lines.length;
      }
      dlgTotal += L.dialogues.length;
    }
  }

  return { lessons: lessons.length, words: wordTotal, advancedWords: advTotal, dialogues: dlgTotal, lines: lineTotal, passages: passageTotal };
}
