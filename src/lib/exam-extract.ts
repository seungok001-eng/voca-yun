// 업로드한 사진·엑셀에서 시험지 재료를 뽑아낸다.
//  - 사진(jpg/png/webp/heic): Gemini 이미지 인식
//  - 엑셀/CSV: 시트를 그대로 읽는다
//  - 텍스트 파일: 그대로 읽는다

import * as XLSX from "xlsx";
import { geminiJson, OCR, type Part } from "./gemini";
import type { WordPair } from "./exam-maker";
import { cleanWordPair } from "./word-clean";

export type Extracted = { words: WordPair[]; text: string; note?: string };

const WORDS_SCHEMA = {
  type: "OBJECT",
  properties: {
    words: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { text: { type: "STRING" }, meaning: { type: "STRING" } },
        required: ["text", "meaning"],
      },
    },
  },
  required: ["words"],
};

const TEXT_SCHEMA = {
  type: "OBJECT",
  properties: { text: { type: "STRING" } },
  required: ["text"],
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

function isExcel(name: string, type: string) {
  return /\.(xlsx|xlsm|xls|csv)$/i.test(name) || type.includes("sheet") || type.includes("excel") || type === "text/csv";
}

/** 엑셀 시트에서 '영어 / 뜻' 두 칸을 찾아 낱말 쌍으로 만든다. */
function wordsFromSheet(rows: unknown[][]): WordPair[] {
  const out: WordPair[] = [];
  const hasKo = (s: string) => /[가-힣]/.test(s);
  const hasEn = (s: string) => /[A-Za-z]/.test(s);

  for (const row of rows) {
    const cells = row.map((c) => String(c ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
    if (cells.length < 2) continue;
    // 한 줄에서 영어 칸과 한국어 칸을 각각 찾는다 (번호 칸이 앞에 있어도 상관없다)
    const en = cells.find((c) => hasEn(c) && !hasKo(c) && !/^\d+$/.test(c));
    const ko = cells.find((c) => hasKo(c));
    if (en && ko && en !== ko) out.push(cleanWordPair({ text: en, meaning: ko }));
  }
  return out;
}

function textFromSheet(rows: unknown[][]): string {
  return rows
    .map((r) => r.map((c) => String(c ?? "").trim()).filter(Boolean).join(" "))
    .filter((l) => l.trim())
    .join("\n");
}

export async function extractFromFile(file: File, want: "WORDS" | "TEXT"): Promise<Extracted> {
  const name = file.name || "";
  const type = file.type || "";

  if (isExcel(name, type)) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const rows: unknown[][] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      rows.push(...(XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][]));
    }
    if (rows.length === 0) throw new Error("엑셀에서 읽을 내용이 없습니다.");
    return want === "WORDS"
      ? { words: wordsFromSheet(rows), text: "" }
      : { words: [], text: textFromSheet(rows) };
  }

  if (/\.(txt|md|csv)$/i.test(name) || type.startsWith("text/")) {
    const text = await file.text();
    return { words: [], text: text.trim() };
  }

  const isPdf = type === "application/pdf" || /\.pdf$/i.test(name);
  if (isPdf || IMAGE_TYPES.includes(type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(name)) {
    // PDF도 사진과 같은 방식으로 Gemini가 직접 읽는다 (여러 쪽이면 모두 읽는다)
    const buf = Buffer.from(await file.arrayBuffer());
    const image: Part = {
      inlineData: { mimeType: isPdf ? "application/pdf" : (type || "image/jpeg"), data: buf.toString("base64") },
    };

    if (want === "WORDS") {
      const got = await geminiJson<{ words: WordPair[] }>(
        [image, {
          text: `사진에 있는 '영어 낱말과 우리말 뜻' 목록을 그대로 옮겨 적어라.

규칙
- 사진에 보이는 그대로 옮긴다. 없는 낱말을 지어내지 마라.
- text에는 영어 낱말(또는 숙어), meaning에는 우리말 뜻을 넣는다.
- 뜻이 여러 개면 사진에 적힌 대로 쉼표로 이어 쓴다.
- 번호, 페이지 머리글, 표 제목 같은 것은 빼고 낱말만 담는다.
- 발음기호([ˈempərər] 같은 것)는 넣지 마라.
- 시험 힌트가 되는 것은 모두 뺀다: 과거형·과거분사(went, gone), 반의어·동의어·유의어(↔ sad, = large), 복수형, 비교급, 예문.
  낱말과 우리말 뜻만 남긴다. 품사 표시(n. v. adj.)는 뜻 앞에 있으면 그대로 둔다.
- 글씨가 흐려 확실하지 않으면 그 줄은 넣지 마라.`,
        }],
        WORDS_SCHEMA,
        { model: OCR, temperature: 0.1, maxOutputTokens: 16384 }
      );
      return {
        words: (got.words ?? []).map(cleanWordPair).filter((w) => w.text && w.meaning),
        text: "",
        note: "사진에서 읽었습니다. 잘못 읽은 곳이 없는지 확인하고 고쳐 주세요.",
      };
    }

    const got = await geminiJson<{ text: string }>(
      [image, {
        text: `사진에 있는 글을 그대로 옮겨 적어라.

규칙
- 사진에 보이는 그대로 옮긴다. 고치거나 요약하지 마라.
- 문단 나눔은 그대로 살린다.
- 페이지 번호, 머리글, 문제 번호 같은 군더더기는 빼고 본문만 옮긴다.
- 영어와 한국어가 같이 있으면 둘 다 옮긴다.`,
      }],
      TEXT_SCHEMA,
      { model: OCR, temperature: 0.1, maxOutputTokens: 16384 }
    );
    return {
      words: [],
      text: (got.text ?? "").trim(),
      note: "사진에서 읽었습니다. 잘못 읽은 곳이 없는지 확인하고 고쳐 주세요.",
    };
  }

  throw new Error("사진(jpg·png), PDF, 엑셀(xlsx·csv), 텍스트 파일만 올릴 수 있습니다.");
}
