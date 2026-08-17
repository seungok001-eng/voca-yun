import { requireStudent, errorResponse } from "@/lib/auth";
import { startLessonWords } from "@/lib/textbook-student";

// 이 레슨의 단어를 학습 대상으로 걸어준다 → 이후 기존 단어 학습·시험 화면을 그대로 사용
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStudent();
    const b = await req.json().catch(() => ({}));
    // 시험은 레슨 단어 전체를 대상으로 하므로 진도를 처음으로 되돌린다
    const assignmentId = await startLessonWords(s.uid, Number((await ctx.params).id), b?.mode === "test");
    return Response.json({ ok: true, assignmentId });
  } catch (e) {
    return errorResponse(e);
  }
}
