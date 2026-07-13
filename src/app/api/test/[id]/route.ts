import { db } from "@/lib/db";
import { requireStudent, errorResponse } from "@/lib/auth";
import type { TestItem } from "@/lib/test-service";

// 현재 문항 조회 (정답은 절대 내려보내지 않음)
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStudent();
    const { id } = await ctx.params;
    const session = await db.testSession.findUnique({
      where: { id: Number(id) },
      include: { answers: true },
    });
    if (!session || session.studentId !== s.uid) {
      return Response.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    }
    const items = JSON.parse(session.itemsJson) as TestItem[];
    const base = {
      sessionId: session.id,
      kind: session.kind,
      mode: session.mode,
      status: session.status,
      total: items.length,
      currentIndex: session.currentIndex,
      wrongCount: session.wrongCount,
      failThreshold: session.failThreshold,
      pronEnabled: session.pronEnabled,
      pronThreshold: session.pronThreshold,
      attemptNo: session.attemptNo,
    };
    if (session.status !== "IN_PROGRESS" || session.currentIndex >= items.length) {
      return Response.json({ ...base, question: null });
    }
    const item = items[session.currentIndex];
    const word = await db.word.findUnique({ where: { id: item.wordId } });
    if (!word) return Response.json({ error: "단어를 찾을 수 없습니다." }, { status: 500 });

    // 발음 단계 대기 중인지 확인
    const pending = session.answers.find(
      (a) => a.wordId === item.wordId && a.textCorrect && a.pronPassed === null && session.pronEnabled
    );

    const question =
      item.dir === "KO_TO_EN"
        ? { dir: item.dir, prompt: (JSON.parse(word.meaningsJson) as string[]).join(", "), pos: word.pos, wordId: word.id }
        : { dir: item.dir, prompt: word.text, pos: word.pos, wordId: word.id };

    return Response.json({
      ...base,
      question,
      phase: pending ? "PRON" : "ANSWER",
      pronTarget: pending ? word.text : undefined,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
