import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const db = new PrismaClient();

// 20단계 레벨: 씨앗 → 새싹 → 나무 → 숲 → 정상 (각 600단어 목표)
const GROUPS = [
  { name: "Seed", ko: "씨앗", desc: "파닉스·사이트워드·기초 생활 단어 (입문~초등)" },
  { name: "Sprout", ko: "새싹", desc: "초등 고학년~중1 교과 필수 어휘" },
  { name: "Tree", ko: "나무", desc: "중2~중3 심화 + 고입 대비 어휘" },
  { name: "Forest", ko: "숲", desc: "고교 필수 + 수능 핵심 어휘" },
  { name: "Summit", ko: "정상", desc: "수능 고난도·만점 어휘" },
];

async function main() {
  console.log("🌱 시드 시작");

  // 1) 레벨 생성
  for (let order = 1; order <= 20; order++) {
    const g = GROUPS[Math.floor((order - 1) / 4)];
    const step = ((order - 1) % 4) + 1;
    await db.level.upsert({
      where: { order },
      update: {},
      create: {
        order,
        name: `${g.name} ${step}`,
        nameKo: `${g.ko} ${step}단계`,
        groupName: g.name,
        groupKo: g.ko,
        description: g.desc,
      },
    });
  }
  console.log("✅ 레벨 20개");

  // 2) 단어 로드 (레벨 간 중복은 낮은 레벨 우선으로 제거)
  const dataDir = path.join(__dirname, "..", "data", "words");
  const seen = new Set<string>();
  let totalWords = 0;
  const existingWords = await db.word.count({ where: { levelId: { not: null } } });
  if (existingWords > 0) {
    console.log(`ℹ️ 단어 ${existingWords}개 이미 존재 — 단어 시드 스킵`);
  } else {
    for (let order = 1; order <= 20; order++) {
      const file = path.join(dataDir, `level-${String(order).padStart(2, "0")}.json`);
      if (!fs.existsSync(file)) {
        console.warn(`⚠️ ${file} 없음 — 스킵`);
        continue;
      }
      const json = JSON.parse(fs.readFileSync(file, "utf-8"));
      const level = await db.level.findUnique({ where: { order } });
      let day = 1;
      let inDay = 0;
      let count = 0;
      for (const w of json.words) {
        const key = String(w.word).toLowerCase().trim();
        if (seen.has(key)) continue; // 낮은 레벨에 이미 있으면 스킵
        seen.add(key);
        await db.word.create({
          data: {
            levelId: level!.id,
            day,
            text: String(w.word).trim(),
            pos: w.pos || "n",
            meaningsJson: JSON.stringify(w.meanings),
            example: w.example || null,
            exampleKo: w.exampleKo || null,
            emoji: w.emoji || null,
          },
        });
        count++;
        totalWords++;
        if (++inDay >= 30) {
          inDay = 0;
          day++;
        }
      }
      console.log(`  레벨 ${order}: ${count}개`);
    }
    console.log(`✅ 단어 총 ${totalWords}개`);
  }

  // 3) 정철어학원 청당국제캠퍼스 기관 + 총관리자
  let org = await db.organization.findFirst({ where: { name: "정철어학원 청당국제캠퍼스" } });
  if (!org) {
    org = await db.organization.create({
      data: {
        name: "정철어학원 청당국제캠퍼스",
        type: "ACADEMY",
        phone: "0507-1434-5569",
        address: "충청남도 천안시 동남구 청당5로 36, 3층",
        visible: true,
      },
    });
  }

  const pw = await bcrypt.hash("1234", 10);
  // 원장님 = 총관리자(SUPER_ADMIN) + 정철 기관 소속
  const director = await db.user.upsert({
    where: { username: "director" },
    update: { role: "SUPER_ADMIN", organizationId: org.id, status: "APPROVED" },
    create: { username: "director", passwordHash: pw, name: "원장님", role: "SUPER_ADMIN", organizationId: org.id, status: "APPROVED" },
  });
  const teacher = await db.user.upsert({
    where: { username: "teacher1" },
    update: { organizationId: org.id, status: "APPROVED" },
    create: { username: "teacher1", passwordHash: pw, name: "김선생", role: "TEACHER", organizationId: org.id, status: "APPROVED" },
  });

  let cls = await db.class.findFirst({ where: { name: "새싹반 A" } });
  if (!cls) {
    cls = await db.class.create({
      data: { name: "새싹반 A", organizationId: org.id, teacherId: teacher.id, setting: { create: { dailyWordCount: 20, failThreshold: 3 } } },
    });
    const level1 = await db.level.findUnique({ where: { order: 1 } });
    await db.assignment.create({
      data: { classId: cls.id, sourceType: "LEVEL", levelId: level1!.id },
    });
  }
  // 마이그레이션 전 생성된 기존 데이터 보정: 소속 없는 반/사용자를 본원에 귀속
  await db.class.updateMany({ where: { organizationId: null }, data: { organizationId: org.id } });
  await db.user.updateMany({ where: { organizationId: null, role: { in: ["DIRECTOR", "TEACHER", "STUDENT"] } }, data: { organizationId: org.id } });

  for (const [username, name] of [
    ["student1", "이하은"],
    ["student2", "박도윤"],
    ["student3", "최서연"],
  ] as const) {
    await db.user.upsert({
      where: { username },
      update: { organizationId: org.id, status: "APPROVED" },
      create: {
        username, passwordHash: pw, name, role: "STUDENT", status: "APPROVED",
        organizationId: org.id, classId: cls.id, parentPhone: "010-0000-0000",
      },
    });
  }
  // 개인 학습자 데모 계정
  await db.user.upsert({
    where: { username: "individual1" },
    update: {},
    create: { username: "individual1", passwordHash: pw, name: "김개인", role: "INDIVIDUAL", status: "APPROVED" },
  });
  console.log("✅ 데모 계정: director(총관리자)/1234, teacher1/1234, student1~3/1234, individual1(개인)/1234");
  console.log(`ℹ️ 기관: ${org.name}, 반: ${cls.name}`);
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    db.$disconnect();
    process.exit(1);
  });
