import { db } from "@/lib/db";
import { requireStudent, errorResponse } from "@/lib/auth";
import { gradeKoToEn, gradeEnToKo } from "@/lib/grading";
import { finalizeItem, type TestItem } from "@/lib/test-service";

// 답안 제출
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStudent();
    const { id } = await ctx.params;
    const { given } = await req.json();
    const session = await db.testSession.findUnique({ where: { id: Number(id) } });
    if (!session || session.studentId !== s.uid) {
      return Response.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    }
    if (session.status !== "IN_PROGRESS") {
      return Response.json({ error: "이미 종료된 시험입니다." }, { status: 400 });
    }
    const items = JSON.parse(session.itemsJson) as TestItem[];
    const item = items[session.currentIndex];
    if (!item) return Response.json({ error: "문항이 없습니다." }, { status: 400 });

    const word = await db.word.findUnique({ where: { id: item.wordId }, include: { aliases: true } });
    if (!word) return Response.json({ error: "단어 오류" }, { status: 500 });
    const meanings = JSON.parse(word.meaningsJson) as string[];

    const textCorrect =
      item.dir === "KO_TO_EN"
        ? gradeKoToEn(String(given ?? ""), word.text)
        : gradeEnToKo(String(given ?? ""), meanings, word.aliases.map((a) => a.text), session.posStrict);

    const reveal = { word: word.text, meanings, pos: word.pos, emoji: word.emoji };

    if (textCorrect && session.pronEnabled) {
      // 발음 단계로: 답안은 보류 상태로 저장
      await db.testAnswer.create({
        data: {
          sessionId: session.id, wordId: word.id, direction: item.dir,
          given: String(given ?? ""), textCorrect: true, correct: false,
        },
      });
      return Response.json({ textCorrect: true, needPron: true, pronTarget: word.text, reveal });
    }

    await db.testAnswer.create({
      data: {
        sessionId: session.id, wordId: word.id, direction: item.dir,
        given: String(given ?? ""), textCorrect, correct: textCorrect,
      },
    });
    const result = await finalizeItem(session, word.id, textCorrect);
    return Response.json({ textCorrect, needPron: false, correct: textCorrect, reveal, ...result });
  } catch (e) {
    return errorResponse(e);
  }
}
