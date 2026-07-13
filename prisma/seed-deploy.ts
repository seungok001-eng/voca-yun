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
  console.log(`✅ 계정 준비 완료 (총관리자 ${director.name}, 반 ${cls.name})`);
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error("시드 오류:", e);
    return db.$disconnect().finally(() => process.exit(1));
  });
