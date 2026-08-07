import { db } from "@/lib/db";
import { requireStudent, errorResponse } from "@/lib/auth";
import { submitSpeakAnswer } from "@/lib/speak-service";

// 진행 중인 시험 상태
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStudent();
    const session = await db.speakSession.findUnique({ where: { id: Number((await ctx.params).id) } });
    if (!session || session.studentId !== s.uid) {
      return Response.json({ error: "시험을 찾을 수 없습니다." }, { status: 404 });
    }
    return Response.json({
      id: session.id,
      lessonId: session.lessonId,
      role: session.role,
      items: JSON.parse(session.itemsJson) as number[],
      index: session.currentIndex,
      total: session.totalCount,
      passedCount: session.passedCount,
      requiredCount: session.requiredCount,
      matchRate: session.matchRate,
      status: session.status,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// 답변 제출 (말한 내용) → 채점 결과와 다음 진행 상태
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStudent();
    const b = await req.json();
    const result = await submitSpeakAnswer(Number((await ctx.params).id), s.uid, String(b.recognized ?? ""));
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
