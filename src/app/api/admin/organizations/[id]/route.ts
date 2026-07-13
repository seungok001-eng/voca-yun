import { db } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/auth";

// 학원 노출/상태 수정 (총관리자)
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id } = await ctx.params;
    const b = await req.json();
    const data: Record<string, unknown> = {};
    if (b.visible !== undefined) data.visible = !!b.visible;
    if (b.status) data.status = b.status;
    if (b.name) data.name = String(b.name).trim();
    if (b.phone !== undefined) data.phone = b.phone?.trim() || null;
    if (b.address !== undefined) data.address = b.address?.trim() || null;
    await db.organization.update({ where: { id: Number(id) }, data });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
