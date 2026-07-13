import { requireStaff, errorResponse } from "@/lib/auth";
import { behindDetail } from "@/lib/progress";

// 특정 학생의 밀린 부분 상세 (며칠차·날짜별 안 한 단어 묶음)
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireStaff();
    const { id } = await ctx.params;
    const detail = await behindDetail(Number(id));
    return Response.json(detail);
  } catch (e) {
    return errorResponse(e);
  }
}
