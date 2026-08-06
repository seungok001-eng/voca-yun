import { requireStudent, errorResponse } from "@/lib/auth";
import { lessonForStudent } from "@/lib/textbook-student";

// 레슨 학습 내용 (대화·본문·단어 수·통과 역할)
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStudent();
    const lesson = await lessonForStudent(s.uid, Number((await ctx.params).id));
    if (!lesson) return Response.json({ error: "레슨을 찾을 수 없습니다." }, { status: 404 });
    return Response.json(lesson);
  } catch (e) {
    return errorResponse(e);
  }
}
