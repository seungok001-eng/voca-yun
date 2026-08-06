import { db } from "@/lib/db";
import { requireStaff, requireSuperAdmin, errorResponse } from "@/lib/auth";

// 교재 상세 — PART별 Toon World / Book Club 레슨 현황
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireStaff();
    const { id } = await ctx.params;
    const book = await db.textbook.findUnique({
      where: { id: Number(id) },
      include: {
        parts: {
          orderBy: { order: "asc" },
          include: {
            lessons: {
              orderBy: [{ area: "asc" }, { order: "asc" }],
              include: {
                wordbook: { select: { id: true, name: true, words: { select: { advancedOnly: true } } } },
                dialogues: { include: { lines: { select: { speaker: true, audioUrl: true } } } },
              },
            },
          },
        },
      },
    });
    if (!book) return Response.json({ error: "교재를 찾을 수 없습니다." }, { status: 404 });

    return Response.json({
      id: book.id, course: book.course, name: book.name, order: book.order,
      parts: book.parts.map((p) => ({
        id: p.id, order: p.order,
        lessons: p.lessons.map((l) => {
          const lines = l.dialogues.flatMap((d) => d.lines);
          const words = l.wordbook?.words ?? [];
          return {
            id: l.id, area: l.area, order: l.order, name: l.name,
            isReview: l.isReview, bookLabel: l.bookLabel,
            hasPassage: !!l.passage,
            wordbookId: l.wordbookId,
            basicWords: words.filter((w) => !w.advancedOnly).length,
            advancedWords: words.filter((w) => w.advancedOnly).length,
            dialogueCount: l.dialogues.length,
            lineCount: lines.length,
            aCount: lines.filter((x) => x.speaker === "A").length,
            bCount: lines.filter((x) => x.speaker === "B").length,
            audioReady: lines.length > 0 && lines.every((x) => x.audioUrl),
          };
        }),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id } = await ctx.params;
    const b = await req.json();
    const data: Record<string, unknown> = {};
    if (b.name) data.name = String(b.name).trim();
    if (b.order !== undefined) data.order = Number(b.order);
    await db.textbook.update({ where: { id: Number(id) }, data });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

// 교재 삭제 — PART·레슨·대화가 함께 삭제된다 (단어장은 남는다)
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id } = await ctx.params;
    await db.textbook.delete({ where: { id: Number(id) } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
