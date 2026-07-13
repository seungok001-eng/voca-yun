import { db } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/auth";

// 추가 정답(별칭) 삭제
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id } = await ctx.params;
    await db.answerAlias.delete({ where: { id: Number(id) } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
