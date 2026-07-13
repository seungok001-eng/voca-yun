import { db } from "@/lib/db";
import { requireStaff, errorResponse } from "@/lib/auth";

export async function GET() {
  try {
    await requireStaff();
    const levels = await db.level.findMany({
      orderBy: { order: "asc" },
      include: { _count: { select: { words: true } } },
    });
    return Response.json({
      levels: levels.map((l) => ({
        id: l.id, order: l.order, name: l.name, nameKo: l.nameKo,
        groupKo: l.groupKo, description: l.description, wordCount: l._count.words,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
