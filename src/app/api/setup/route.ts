import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";

// 배포 후 최초 1회만 실행하는 초기 설정 — DB에 레벨/단어/데모계정을 채운다.
// 보안: 환경변수 SETUP_KEY 와 ?key=... 가 일치해야 실행됨. 이미 채워져 있으면 스킵.
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (!process.env.SETUP_KEY || key !== process.env.SETUP_KEY) {
    return Response.json({ error: "설정 키가 올바르지 않습니다." }, { status: 403 });
  }

  const existing = await db.word.count();
  if (existing > 0) {
    return Response.json({ ok: true, alreadySetup: true, words: existing });
  }

  // 시드 데이터 로드 (배포 번들에 포함)
  const file = path.join(process.cwd(), "data", "seed-words.json");
  const seed = JSON.parse(fs.readFileSync(file, "utf-8")) as {
    levels: { order: number; name: string; nameKo: string; groupName: string; groupKo: string; description: string | null }[];
    words: { levelOrder: number; day: number; text: string; pos: string; meaningsJson: string; example: string | null; exampleKo: string | null; emoji: string | null }[];
  };

  // 1) 레벨
  for (const l of seed.levels) {
    await db.level.upsert({ where: { order: l.order }, update: {}, create: l });
  }
  const levels = await db.level.findMany();
  const levelIdByOrder = new Map(levels.map((l) => [l.order, l.id]));

  // 2) 단어 (대량 삽입)
  const CHUNK = 2000;
  for (let i = 0; i < seed.words.length; i += CHUNK) {
    const batch = seed.words.slice(i, i + CHUNK).map((w) => ({
      levelId: levelIdByOrder.get(w.levelOrder)!,
      day: w.day, text: w.text, pos: w.pos, meaningsJson: w.meaningsJson,
      example: w.example, exampleKo: w.exampleKo, emoji: w.emoji,
    }));
    await db.word.createMany({ data: batch });
  }

  // 3) 정철어학원 본원 + 데모 계정
  const org = await db.organization.create({
    data: {
      name: "정철어학원 청당국제캠퍼스", type: "ACADEMY",
      phone: "0507-1434-5569", address: "충청남도 천안시 동남구 청당5로 36, 3층", visible: true,
    },
  });
  const pw = await bcrypt.hash("1234", 10);
  await db.user.create({ data: { username: "director", passwordHash: pw, name: "원장님", role: "SUPER_ADMIN", status: "APPROVED", organizationId: org.id } });
  const teacher = await db.user.create({ data: { username: "teacher1", passwordHash: pw, name: "김선생", role: "TEACHER", status: "APPROVED", organizationId: org.id } });
  const cls = await db.class.create({
    data: { name: "새싹반 A", organizationId: org.id, teacherId: teacher.id, setting: { create: { dailyWordCount: 20, failThreshold: 3 } } },
  });
  const level1 = await db.level.findUnique({ where: { order: 1 } });
  await db.assignment.create({ data: { classId: cls.id, sourceType: "LEVEL", levelId: level1!.id } });
  for (const [username, name] of [["student1", "이하은"], ["student2", "박도윤"], ["student3", "최서연"]] as const) {
    await db.user.create({ data: { username, passwordHash: pw, name, role: "STUDENT", status: "APPROVED", organizationId: org.id, classId: cls.id, parentPhone: "010-0000-0000" } });
  }
  await db.user.create({ data: { username: "individual1", passwordHash: pw, name: "김개인", role: "INDIVIDUAL", status: "APPROVED" } });

  const words = await db.word.count();
  return Response.json({ ok: true, setup: true, words, message: "초기 설정 완료! director/1234 로 로그인하세요." });
}
