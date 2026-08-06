import { requireStudent, errorResponse } from "@/lib/auth";
import { startLessonWords } from "@/lib/textbook-student";

// 이 레슨의 단어를 학습 대상으로 걸어준다 → 이후 기존 단어 학습·시험 화면을 그대로 사용
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStudent();
    const assignmentId = await startLessonWords(s.uid, Number((await ctx.params).id));
    return Response.json({ ok: true, assignmentId });
  } catch (e) {
    return errorResponse(e);
  }
}
