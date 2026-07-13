import { db } from "@/lib/db";
import { requireStaff, accessibleClassIds, errorResponse, AuthError } from "@/lib/auth";

// 반 전용 휴무 삭제 (선생님·원장·총관리자)
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; hid: string }> }) {
  try {
    const s = await requireStaff();
    const { id, hid } = await ctx.params;
    const classId = Number(id);
    const ids = await accessibleClassIds(s);
    if (ids !== null && !ids.includes(classId)) throw new AuthError(403, "담당 반이 아닙니다.");
    const h = await db.holiday.findUnique({ where: { id: Number(hid) } });
    if (!h || h.classId !== classId) return Response.json({ error: "휴무를 찾을 수 없습니다." }, { status: 404 });
    await db.holiday.delete({ where: { id: h.id } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
