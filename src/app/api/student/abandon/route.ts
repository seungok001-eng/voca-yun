import { db } from "@/lib/db";
import { requireStudent, errorResponse } from "@/lib/auth";

// 진행 중인 시험 중단(초기화) — 학생 본인 것만.
// 점수·진도에는 영향을 주지 않고 세션만 없애서 처음부터 다시 볼 수 있게 한다.
// body: { kind: "WORD" | "SPEAK", sessionId?: number }
export async function POST(req: Request) {
  try {
    const s = await requireStudent();
    const b = await req.json().catch(() => ({}));
    const kind = b?.kind === "SPEAK" ? "SPEAK" : "WORD";
    const sessionId = b?.sessionId ? Number(b.sessionId) : null;

    if (kind === "SPEAK") {
      const where = {
        studentId: s.uid,
        kind: "TEST",
        status: "IN_PROGRESS",
        ...(sessionId ? { id: sessionId } : {}),
      };
      const targets = await db.speakSession.findMany({ where, select: { id: true } });
      const ids = targets.map((t) => t.id);
      if (ids.length === 0) return Response.json({ ok: true, count: 0 });
      // 답안까지 함께 지워 다음 응시가 깨끗하게 시작되도록 한다
      await db.speakAnswer.deleteMany({ where: { sessionId: { in: ids } } });
      await db.speakSession.deleteMany({ where: { id: { in: ids } } });
      return Response.json({ ok: true, count: ids.length });
    }

    const where = {
      studentId: s.uid,
      status: "IN_PROGRESS",
      ...(sessionId ? { id: sessionId } : {}),
    };
    const targets = await db.testSession.findMany({ where, select: { id: true } });
    const ids = targets.map((t) => t.id);
    if (ids.length === 0) return Response.json({ ok: true, count: 0 });
    await db.testAnswer.deleteMany({ where: { sessionId: { in: ids } } });
    await db.cheatEvent.deleteMany({ where: { sessionId: { in: ids } } });
    await db.testSession.deleteMany({ where: { id: { in: ids } } });
    return Response.json({ ok: true, count: ids.length });
  } catch (e) {
    return errorResponse(e);
  }
}
