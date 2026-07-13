// data/words/ 의 모든 JSON(기본 + -extra)을 읽어, DB에 없는 단어만 해당 레벨에 추가한다.
// 실행: npx tsx scripts/topup-words.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const db = new PrismaClient();

async function main() {
  const dir = path.join(__dirname, "..", "data", "words");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const existing = new Set(
    (await db.word.findMany({ select: { text: true } })).map((w) => w.text.toLowerCase().trim())
  );
  let added = 0;
  for (const file of files) {
    const json = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    const level = await db.level.findUnique({ where: { order: json.level } });
    if (!level) continue;
    const count = await db.word.count({ where: { levelId: level.id } });
    let inserted = 0;
    for (const w of json.words) {
      const key = String(w.word).toLowerCase().trim();
      if (existing.has(key)) continue;
      existing.add(key);
      const idx = count + inserted;
      await db.word.create({
        data: {
          levelId: level.id,
          day: Math.floor(idx / 30) + 1,
          text: String(w.word).trim(),
          pos: w.pos || "n",
          meaningsJson: JSON.stringify(w.meanings),
          example: w.example || null,
          exampleKo: w.exampleKo || null,
          emoji: w.emoji || null,
        },
      });
      inserted++;
      added++;
    }
    if (inserted > 0) console.log(`${file} → 레벨 ${json.level}: +${inserted}개`);
  }
  console.log(`✅ 총 ${added}개 추가`);
}

main()
  .then(() => db.$disconnect())
  .catch((e) => { console.error(e); db.$disconnect(); process.exit(1); });
