import { db } from "@/lib/db";
import { requireStudent, errorResponse } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const s = await requireStudent();
    const url = new URL(req.url);
    const showResolved = url.searchParams.get("all") === "1";
    const notes = await db.wrongNote.findMany({
      where: { studentId: s.uid, ...(showResolved ? {} : { resolved: false }) },
      include: { word: true },
      orderBy: [{ resolved: "asc" }, { lastWrongAt: "desc" }],
      take: 200,
    });
    return Response.json({
      notes: notes.map((n) => ({
        id: n.id,
        word: n.word.text,
        pos: n.word.pos,
        meanings: JSON.parse(n.word.meaningsJson),
        example: n.word.example,
        exampleKo: n.word.exampleKo,
        emoji: n.word.emoji,
        wrongCount: n.wrongCount,
        lastWrongAt: n.lastWrongAt,
        resolved: n.resolved,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
