import { db } from "@/lib/db";
import { requireStudent, errorResponse } from "@/lib/auth";
import { activeAssignmentFor } from "@/lib/test-service";
import { resolveSettings } from "@/lib/settings";

// 자유 학습용 단어 조회 — chunk 단위로 무제한 미리 학습 가능 (진도와 무관)
// chunk=0: 현재(오늘) 분량, chunk=1: 다음 분량, ... chunk=-1: 직전 분량 (복습)
export async function GET(req: Request) {
  try {
    const s = await requireStudent();
    const url = new URL(req.url);
    const chunk = Number(url.searchParams.get("chunk") || 0);

    const assignment = await activeAssignmentFor(s.uid);
    if (!assignment) return Response.json({ words: [], chunk, hasPrev: false, hasNext: false });
    const settings = await resolveSettings(s.uid);
    const daily = settings.dailyWordCount;

    const where = assignment.sourceType === "LEVEL"
      ? { levelId: assignment.levelId! }
      : { wordbookId: assignment.wordbookId! };
    const total = await db.word.count({ where });
    // 미리 생성된 음성 파일 경로용 레벨 번호 (커스텀 단어장은 없음)
    let levelOrder: number | null = null;
    if (assignment.sourceType === "LEVEL" && assignment.levelId) {
      const lv = await db.level.findUnique({ where: { id: assignment.levelId }, select: { order: true } });
      levelOrder = lv?.order ?? null;
    }
    const progress = await db.studentProgress.findUnique({
      where: { studentId_assignmentId: { studentId: s.uid, assignmentId: assignment.id } },
    });
    const cursor = progress?.wordCursor ?? 0;

    const start = Math.max(0, cursor + chunk * daily);
    const words = await db.word.findMany({
      where, orderBy: { id: "asc" }, skip: start, take: daily,
    });

    return Response.json({
      chunk,
      dailyWordCount: daily,
      hasPrev: start > 0,
      hasNext: start + daily < total,
      words: words.map((w, i) => ({
        id: w.id, no: start + i + 1, levelOrder, text: w.text, pos: w.pos, meanings: JSON.parse(w.meaningsJson),
        example: w.example, exampleKo: w.exampleKo, emoji: w.emoji, defEn: w.defEn,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
