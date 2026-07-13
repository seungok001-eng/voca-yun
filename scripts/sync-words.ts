// data/words/*.json 의 최신 내용(품질 검수 반영)을 DB의 기존 단어에 동기화한다.
// 단어를 추가하지 않고, (레벨 + 단어 텍스트)로 매칭되는 기존 행의 pos/뜻/예문을 갱신한다.
// 실행: npx tsx scripts/sync-words.ts
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const db = new PrismaClient();

async function main() {
  const dir = path.join(__dirname, "..", "data", "words");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

  // 레벨 order → id
  const levels = await db.level.findMany();
  const levelIdByOrder = new Map(levels.map((l) => [l.order, l.id]));

  let updated = 0;
  const seenByLevel = new Map<number, Set<string>>();

  for (const file of files) {
    const json = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    const levelId = levelIdByOrder.get(json.level);
    if (!levelId) continue;
    if (!seenByLevel.has(levelId)) seenByLevel.set(levelId, new Set());
    const seen = seenByLevel.get(levelId)!;

    // 이 레벨의 DB 단어를 text 소문자 기준으로 인덱싱
    const dbWords = await db.word.findMany({ where: { levelId } });
    const byText = new Map(dbWords.map((w) => [w.text.toLowerCase().trim(), w]));

    for (const w of json.words) {
      const key = String(w.word).toLowerCase().trim();
      if (seen.has(key)) continue; // 낮은 파일이 우선(seed와 동일 규칙)
      seen.add(key);
      const row = byText.get(key);
      if (!row) continue; // DB에 없으면(중복 제거로 다른 레벨로 갔거나) 건너뜀
      const newMeanings = JSON.stringify(w.meanings);
      const newEmoji = w.emoji || null;
      const changed =
        row.pos !== (w.pos || "n") ||
        row.meaningsJson !== newMeanings ||
        (row.example || null) !== (w.example || null) ||
        (row.exampleKo || null) !== (w.exampleKo || null) ||
        (row.emoji || null) !== newEmoji;
      if (changed) {
        await db.word.update({
          where: { id: row.id },
          data: {
            pos: w.pos || "n",
            meaningsJson: newMeanings,
            example: w.example || null,
            exampleKo: w.exampleKo || null,
            emoji: newEmoji,
          },
        });
        updated++;
      }
    }
  }
  console.log(`✅ 동기화 완료 — ${updated}개 단어 갱신`);
}

main()
  .then(() => db.$disconnect())
  .catch((e) => { console.error(e); db.$disconnect(); process.exit(1); });
