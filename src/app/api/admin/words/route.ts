import { db } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

// 단어 검색 (레벨/단어장/텍스트 필터 + 페이지네이션)
export async function GET(req: Request) {
  try {
    await requireSuperAdmin();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const levelId = url.searchParams.get("levelId");
    const wordbookId = url.searchParams.get("wordbookId");
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = 30;

    const where: Prisma.WordWhereInput = {};
    if (levelId) where.levelId = Number(levelId);
    if (wordbookId) where.wordbookId = Number(wordbookId);
    if (q) where.text = { contains: q.toLowerCase() };

    const [total, words] = await Promise.all([
      db.word.count({ where }),
      db.word.findMany({
        where,
        orderBy: [{ levelId: "asc" }, { day: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { aliases: true, level: { select: { order: true, nameKo: true } } },
      }),
    ]);

    // 레벨/단어장 내 단어 번호 계산 (학습 순서 = id 오름차순)
    const levelIds = [...new Set(words.map((w) => w.levelId).filter((v): v is number => v !== null))];
    const wordbookIds = [...new Set(words.map((w) => w.wordbookId).filter((v): v is number => v !== null))];
    const numberByWordId = new Map<number, number>();
    await Promise.all([
      ...levelIds.map(async (lid) => {
        const ids = await db.word.findMany({ where: { levelId: lid }, select: { id: true }, orderBy: { id: "asc" } });
        ids.forEach((r, i) => numberByWordId.set(r.id, i + 1));
      }),
      ...wordbookIds.map(async (wid) => {
        const ids = await db.word.findMany({ where: { wordbookId: wid }, select: { id: true }, orderBy: { id: "asc" } });
        ids.forEach((r, i) => numberByWordId.set(r.id, i + 1));
      }),
    ]);

    return Response.json({
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
      words: words.map((w) => ({
        id: w.id,
        no: numberByWordId.get(w.id) ?? null, // 레벨(단어장) 내 번호
        text: w.text,
        pos: w.pos,
        meanings: JSON.parse(w.meaningsJson),
        example: w.example,
        exampleKo: w.exampleKo,
        emoji: w.emoji,
        day: w.day,
        levelOrder: w.level?.order ?? null,
        levelName: w.level?.nameKo ?? null,
        aliases: w.aliases.map((a) => ({ id: a.id, text: a.text })),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// 단어 추가 (레벨 또는 단어장에)
export async function POST(req: Request) {
  try {
    await requireSuperAdmin();
    const b = await req.json();
    if (!b.text?.trim() || !Array.isArray(b.meanings) || b.meanings.length === 0) {
      return Response.json({ error: "단어와 뜻은 필수입니다." }, { status: 400 });
    }
    if (!b.levelId && !b.wordbookId) {
      return Response.json({ error: "레벨 또는 단어장을 지정하세요." }, { status: 400 });
    }
    const where = b.levelId ? { levelId: Number(b.levelId) } : { wordbookId: Number(b.wordbookId) };
    const count = await db.word.count({ where });
    const word = await db.word.create({
      data: {
        levelId: b.levelId ? Number(b.levelId) : null,
        wordbookId: b.wordbookId ? Number(b.wordbookId) : null,
        day: Math.floor(count / 30) + 1,
        text: String(b.text).trim(),
        pos: b.pos || "n",
        meaningsJson: JSON.stringify(b.meanings.map((m: string) => String(m).trim()).filter(Boolean)),
        example: b.example?.trim() || null,
        exampleKo: b.exampleKo?.trim() || null,
        emoji: b.emoji?.trim() || null,
      },
    });
    return Response.json({ id: word.id });
  } catch (e) {
    return errorResponse(e);
  }
}
