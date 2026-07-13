import { db } from "@/lib/db";
import { requireDirector, accessibleOrgId, errorResponse, AuthError } from "@/lib/auth";

// 휴무 기간 삭제
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireDirector();
    const { id } = await ctx.params;
    const h = await db.holiday.findUnique({ where: { id: Number(id) } });
    if (!h) return Response.json({ error: "휴무를 찾을 수 없습니다." }, { status: 404 });
    const orgId = accessibleOrgId(s);
    if (orgId !== null && h.organizationId !== orgId) throw new AuthError(403, "다른 학원의 휴무입니다.");
    await db.holiday.delete({ where: { id: h.id } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
