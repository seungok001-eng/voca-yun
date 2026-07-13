import { db } from "@/lib/db";
import { requireStaff, accessibleOrgId, errorResponse } from "@/lib/auth";

// 학부모 알림 메시지 1건 삭제 (본인 학원 학생의 알림만, 총관리자는 전체)
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff();
    const { id } = await ctx.params;
    const orgId = accessibleOrgId(s); // null = 총관리자(전체)
    const log = await db.notificationLog.findUnique({
      where: { id: Number(id) },
      include: { student: { select: { organizationId: true } } },
    });
    if (!log) return Response.json({ error: "알림을 찾을 수 없습니다." }, { status: 404 });
    if (orgId !== null && log.student.organizationId !== orgId) {
      return Response.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    await db.notificationLog.delete({ where: { id: log.id } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
