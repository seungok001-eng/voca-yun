import { db } from "@/lib/db";
import { requireSession, errorResponse, AuthError } from "@/lib/auth";

// 시험 결과 상세 (학생 본인 또는 교직원)
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSession();
    const { id } = await ctx.params;
    const session = await db.testSession.findUnique({
      where: { id: Number(id) },
      include: { answers: { include: { word: true }, orderBy: { id: "asc" } }, student: true },
    });
    if (!session) return Response.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    if (s.role === "STUDENT" && session.studentId !== s.uid) throw new AuthError(403, "권한이 없습니다.");

    return Response.json({
      id: session.id,
      kind: session.kind,
      mode: session.mode,
      status: session.status,
      attemptNo: session.attemptNo,
      wrongCount: session.wrongCount,
      failThreshold: session.failThreshold,
      retestScope: session.retestScope,
      cheatCount: session.cheatCount,
      pronEnabled: session.pronEnabled,
      pronThreshold: session.pronThreshold,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      studentName: session.student.name,
      total: (JSON.parse(session.itemsJson) as unknown[]).length,
      answers: session.answers.map((a) => ({
        wordId: a.wordId,
        word: a.word.text,
        pos: a.word.pos,
        meanings: JSON.parse(a.word.meaningsJson),
        direction: a.direction,
        given: a.given,
        textCorrect: a.textCorrect,
        pronScore: a.pronScore,
        pronPassed: a.pronPassed,
        correct: a.correct,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
