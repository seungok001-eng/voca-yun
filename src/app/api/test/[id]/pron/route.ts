import { db } from "@/lib/db";
import { requireStudent, errorResponse } from "@/lib/auth";
import { pronunciationScore } from "@/lib/grading";
import { finalizeItem, type TestItem } from "@/lib/test-service";

// 발음 평가 제출 (Web Speech API 인식 결과 기반; Azure 연동 시 score 직접 전달)
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStudent();
    const { id } = await ctx.params;
    const { recognized, confidence, azureScore } = await req.json();
    const session = await db.testSession.findUnique({ where: { id: Number(id) } });
    if (!session || session.studentId !== s.uid) {
      return Response.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    }
    if (session.status !== "IN_PROGRESS" || !session.pronEnabled) {
      return Response.json({ error: "발음 평가 단계가 아닙니다." }, { status: 400 });
    }
    const items = JSON.parse(session.itemsJson) as TestItem[];
    const item = items[session.currentIndex];
    if (!item) return Response.json({ error: "문항이 없습니다." }, { status: 400 });

    const pending = await db.testAnswer.findFirst({
      where: { sessionId: session.id, wordId: item.wordId, textCorrect: true, pronPassed: null },
      orderBy: { id: "desc" },
    });
    if (!pending) return Response.json({ error: "발음 대기 중인 답안이 없습니다." }, { status: 400 });

    const word = await db.word.findUnique({ where: { id: item.wordId } });
    if (!word) return Response.json({ error: "단어 오류" }, { status: 500 });

    const score =
      typeof azureScore === "number"
        ? Math.round(azureScore)
        : pronunciationScore(String(recognized ?? ""), word.text, Number(confidence ?? 0.8));
    const pronPassed = score >= session.pronThreshold;

    await db.testAnswer.update({
      where: { id: pending.id },
      data: { pronScore: score, pronPassed, correct: pronPassed },
    });
    const result = await finalizeItem(session, word.id, pronPassed);
    return Response.json({
      pronScore: score,
      pronPassed,
      threshold: session.pronThreshold,
      correct: pronPassed,
      reveal: { word: word.text, meanings: JSON.parse(word.meaningsJson), pos: word.pos, emoji: word.emoji },
      ...result,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
