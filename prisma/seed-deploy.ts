// 배포(빌드) 단계에서 실행 — 시간 제한 없이 레벨/단어/데모계정을 채운다.
// 이미 완전히 채워져 있으면 스킵. 일부만 들어간 상태면 단어를 정리 후 다시 채운다.
// build 스크립트에서: prisma db push → tsx prisma/seed-deploy.ts → next build
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

// 세션 풀러(직접 연결)로 대량 삽입 — pgbouncer 오버헤드 회피
const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

async function main() {
  const file = path.join(process.cwd(), "data", "seed-words.json");
  if (!fs.existsSync(file)) {
    console.log("⚠️ seed-words.json 없음 — 시드 스킵");
    return;
  }
  const seed = JSON.parse(fs.readFileSync(file, "utf-8")) as {
    levels: { order: number; name: string; nameKo: string; groupName: string; groupKo: string; description: string | null }[];
    words: { levelOrder: number; day: number; text: string; pos: string; meaningsJson: string; example: string | null; exampleKo: string | null; emoji: string | null }[];
  };

  // 1) 레벨 (idempotent)
  for (const l of seed.levels) {
    await db.level.upsert({ where: { order: l.order }, update: {}, create: l });
  }
  const levels = await db.level.findMany();
  const levelIdByOrder = new Map(levels.map((l) => [l.order, l.id]));

  // 2) 단어 — 완전하면 스킵, 아니면 정리 후 재삽입
  const wordCount = await db.word.count();
  if (wordCount >= seed.words.length) {
    console.log(`✅ 단어 ${wordCount}개 이미 존재 — 스킵`);
  } else {
    if (wordCount > 0) {
      console.log(`ℹ️ 단어 ${wordCount}/${seed.words.length} — 불완전, 정리 후 재삽입`);
      // 단어 참조 데이터 정리 (부분 상태 초기화)
      await db.testAnswer.deleteMany({});
      await db.wrongNote.deleteMany({});
      await db.reviewItem.deleteMany({});
      await db.answerAlias.deleteMany({});
      await db.word.deleteMany({});
    }
    const CHUNK = 1000;
    for (let i = 0; i < seed.words.length; i += CHUNK) {
      const batch = seed.words.slice(i, i + CHUNK).map((w) => ({
        levelId: levelIdByOrder.get(w.levelOrder)!,
        day: w.day, text: w.text, pos: w.pos, meaningsJson: w.meaningsJson,
        example: w.example, exampleKo: w.exampleKo, emoji: w.emoji,
      }));
      await db.word.createMany({ data: batch });
    }
    console.log(`✅ 단어 ${await db.word.count()}개 삽입`);
  }

  // 2.5) 영어 뜻풀이(defEn) 백필 — data/word-defs.json 이 있으면 비어있는 단어만 채움
  const defsFile = path.join(process.cwd(), "data", "word-defs.json");
  if (fs.existsSync(defsFile)) {
    const defs = JSON.parse(fs.readFileSync(defsFile, "utf-8")) as { levelOrder: number; text: string; defEn: string }[];
    const haveDefs = await db.word.count({ where: { defEn: { not: null } } });
    if (haveDefs >= defs.length) {
      console.log(`✅ 영어 뜻풀이 ${haveDefs}개 이미 존재 — 스킵`);
    } else {
      const byLevel = new Map<number, { text: string; defEn: string }[]>();
      for (const d of defs) {
        if (!byLevel.has(d.levelOrder)) byLevel.set(d.levelOrder, []);
        byLevel.get(d.levelOrder)!.push(d);
      }
      const esc = (s: string) => s.replace(/'/g, "''");
      for (const [order, list] of byLevel) {
        const levelId = levelIdByOrder.get(order);
        if (!levelId) continue;
        // 레벨당 1쿼리 (VALUES 조인) — 12k 개별 UPDATE 방지
        for (let i = 0; i < list.length; i += 300) {
          const chunk = list.slice(i, i + 300);
          const values = chunk.map((d) => `('${esc(d.text)}','${esc(d.defEn)}')`).join(",");
          await db.$executeRawUnsafe(
            `UPDATE voca."Word" AS w SET "defEn" = v.def FROM (VALUES ${values}) AS v(txt, def) ` +
            `WHERE w."levelId" = ${levelId} AND w."text" = v.txt AND w."defEn" IS DISTINCT FROM v.def`
          );
        }
      }
      console.log(`✅ 영어 뜻풀이 백필 완료: ${await db.word.count({ where: { defEn: { not: null } } })}개`);
    }
  }

  // 3) 정철어학원 본원 + 데모 계정 (idempotent)
  let org = await db.organization.findFirst({ where: { name: "정철어학원 청당국제캠퍼스" } });
  if (!org) {
    org = await db.organization.create({
      data: {
        name: "정철어학원 청당국제캠퍼스", type: "ACADEMY",
        phone: "0507-1434-5569", address: "충청남도 천안시 동남구 청당5로 36, 3층", visible: true,
      },
    });
  }
  const pw = await bcrypt.hash("1234", 10);
  // 총관리자 = 앱 관리 전용 (특정 학원 소속 아님). 정철 원장은 별도 계정으로 학원관리에서 생성.
  const director = await db.user.upsert({
    where: { username: "director" },
    update: { organizationId: null, role: "SUPER_ADMIN", status: "APPROVED", name: "앱 관리자" },
    create: { username: "director", passwordHash: pw, plainPassword: "1234", name: "앱 관리자", role: "SUPER_ADMIN", status: "APPROVED", organizationId: null },
  });
  const teacher = await db.user.upsert({
    where: { username: "teacher1" },
    update: { organizationId: org.id, status: "APPROVED" },
    create: { username: "teacher1", passwordHash: pw, plainPassword: "1234", name: "김선생", role: "TEACHER", status: "APPROVED", organizationId: org.id },
  });
  let cls = await db.class.findFirst({ where: { name: "새싹반 A", organizationId: org.id } });
  if (!cls) {
    cls = await db.class.create({
      data: { name: "새싹반 A", organizationId: org.id, teacherId: teacher.id, setting: { create: { dailyWordCount: 20, failThreshold: 3 } } },
    });
    const level1 = await db.level.findUnique({ where: { order: 1 } });
    if (level1) await db.assignment.create({ data: { classId: cls.id, sourceType: "LEVEL", levelId: level1.id } });
  }
  for (const [username, name, grade] of [["student1", "이하은", "중1"], ["student2", "박도윤", "중2"], ["student3", "최서연", "초6"]] as const) {
    await db.user.upsert({
      where: { username },
      update: { organizationId: org.id, status: "APPROVED" },
      create: { username, passwordHash: pw, plainPassword: "1234", name, role: "STUDENT", status: "APPROVED", organizationId: org.id, classId: cls.id, parentPhone: "010-0000-0000", school: "청당중", grade },
    });
  }
  await db.user.upsert({
    where: { username: "individual1" },
    update: {},
    create: { username: "individual1", passwordHash: pw, plainPassword: "1234", name: "김개인", role: "INDIVIDUAL", status: "APPROVED" },
  });
  // 4) 정철 교재 12권 (KEM=SKY 6권 / FEM=PLANET 6권) — idempotent
  const TEXTBOOKS: [string, string[]][] = [
    ["KEM", ["SKY 1-1", "SKY 1-2", "SKY 1-3", "SKY 2-1", "SKY 2-2", "SKY 2-3"]],
    ["FEM", ["PLANET 1-1", "PLANET 1-2", "PLANET 1-3", "PLANET 2-1", "PLANET 2-2", "PLANET 2-3"]],
  ];
  for (const [course, names] of TEXTBOOKS) {
    for (let i = 0; i < names.length; i++) {
      const book = await db.textbook.upsert({
        where: { course_name: { course, name: names[i] } },
        update: {},
        create: { course, name: names[i], order: i + 1 },
      });
      // 각 권은 PART 1·2로 구성
      for (const order of [1, 2]) {
        await db.textbookPart.upsert({
          where: { textbookId_order: { textbookId: book.id, order } },
          update: {},
          create: { textbookId: book.id, order },
        });
      }
    }
  }
  console.log(`✅ 교재 ${await db.textbook.count()}권 준비 완료`);

  // 5) 정철 교재 콘텐츠 (data/textbook-*.json) — 내용이 바뀐 교재만 다시 넣는다
  await importTextbooks();

  console.log(`✅ 계정 준비 완료 (총관리자 ${director.name}, 반 ${cls.name})`);
}

// 파일명 textbook-planet-1-1.json → "PLANET 1-1"
function textbookNameFromFile(file: string): string | null {
  const m = /^textbook-(sky|planet)-(\d)-(\d)\.json$/i.exec(file);
  return m ? `${m[1].toUpperCase()} ${m[2]}-${m[3]}` : null;
}

type TbWord = { text: string; meanings: string[]; advancedOnly?: boolean; audio?: string };
type TbLine = { speaker?: string; text: string; ko?: string; audio?: string };
type TbLesson = {
  part: number; area: "TOON" | "READING"; order: number; name?: string;
  isReview?: boolean; bookLabel?: string;
  words?: TbWord[]; dialogues?: { lines: TbLine[] }[]; passageLines?: TbLine[];
};

async function importTextbooks() {
  const dir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => textbookNameFromFile(f));

  for (const file of files) {
    const name = textbookNameFromFile(file)!;
    const book = await db.textbook.findFirst({ where: { name } });
    if (!book) { console.log(`⚠️ 교재 ${name} 없음 — 스킵`); continue; }

    const lessons = (JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")).lessons ?? []) as TbLesson[];
    const expected = lessons.reduce(
      (n, L) => n + (L.dialogues ?? []).reduce((m, d) => m + d.lines.length, 0) + (L.passageLines ?? []).length, 0);
    const current = await db.dialogueLine.count({ where: { dialogue: { lesson: { part: { textbookId: book.id } } } } });
    if (current === expected && expected > 0) {
      console.log(`✅ ${name} 이미 등록됨 (문장 ${current}개) — 스킵`);
      continue;
    }

    let words = 0, lines = 0;
    for (const L of lessons) {
      const part = await db.textbookPart.upsert({
        where: { textbookId_order: { textbookId: book.id, order: L.part } },
        update: {},
        create: { textbookId: book.id, order: L.part },
      });
      const areaKo = L.area === "TOON" ? "Toon World" : "Book Club";
      const passage = (L.passageLines ?? []).map((x) => x.text).join(" ") || null;
      const passageKo = (L.passageLines ?? []).some((x) => x.ko)
        ? (L.passageLines ?? []).map((x) => x.ko ?? "").join(" ").trim() : null;

      const existing = await db.lesson.findUnique({
        where: { partId_area_order: { partId: part.id, area: L.area, order: L.order } },
      });
      const patch = {
        name: L.name || existing?.name || `${areaKo} Lesson ${L.order}`,
        isReview: !!L.isReview,
        bookLabel: L.bookLabel ?? null,
        passage, passageKo,
      };
      const lesson = existing
        ? await db.lesson.update({ where: { id: existing.id }, data: patch })
        : await db.lesson.create({ data: { partId: part.id, area: L.area, order: L.order, ...patch } });

      // 단어 — 레슨 전용 단어장 (기본 단어 먼저, 심화 단어를 뒤에)
      if (L.words?.length) {
        const wbName = `${book.name} P${L.part} ${areaKo} L${L.order}`;
        let wordbookId = lesson.wordbookId;
        if (wordbookId) {
          await db.wordbook.update({ where: { id: wordbookId }, data: { name: wbName } });
          await db.word.deleteMany({ where: { wordbookId } });
        } else {
          const created = await db.wordbook.create({ data: { name: wbName } });
          wordbookId = created.id;
          await db.lesson.update({ where: { id: lesson.id }, data: { wordbookId } });
        }
        const ordered = [...L.words].sort((a, b) => Number(!!a.advancedOnly) - Number(!!b.advancedOnly));
        await db.word.createMany({
          data: ordered.map((w, i) => ({
            wordbookId: wordbookId!,
            day: Math.floor(i / 30) + 1,
            text: w.text,
            pos: "n",
            meaningsJson: JSON.stringify(w.meanings),
            advancedOnly: !!w.advancedOnly,
            audioUrl: w.audio ?? null,
          })),
        });
        words += ordered.length;
      }

      // 대화 + 본문 (본문은 화자 N인 PASSAGE 대화로 저장)
      await db.dialogue.deleteMany({ where: { lessonId: lesson.id } });
      let order = 1;
      for (const d of L.dialogues ?? []) {
        const created = await db.dialogue.create({ data: { lessonId: lesson.id, kind: "DIALOGUE", order: order++ } });
        await db.dialogueLine.createMany({
          data: d.lines.map((ln, i) => ({
            dialogueId: created.id, order: i + 1, speaker: ln.speaker ?? "A",
            text: ln.text, textKo: ln.ko ?? null, audioUrl: ln.audio ?? null,
          })),
        });
        lines += d.lines.length;
      }
      if (L.passageLines?.length) {
        const created = await db.dialogue.create({ data: { lessonId: lesson.id, kind: "PASSAGE", order: 1 } });
        await db.dialogueLine.createMany({
          data: L.passageLines.map((ln, i) => ({
            dialogueId: created.id, order: i + 1, speaker: "N",
            text: ln.text, textKo: ln.ko ?? null, audioUrl: ln.audio ?? null,
          })),
        });
        lines += L.passageLines.length;
      }
    }
    console.log(`✅ ${name} 등록: 레슨 ${lessons.length}개 · 단어 ${words}개 · 문장 ${lines}개`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error("시드 오류:", e);
    return db.$disconnect().finally(() => process.exit(1));
  });
