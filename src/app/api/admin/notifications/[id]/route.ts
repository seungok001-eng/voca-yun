import { db } from "@/lib/db";
import { requireStaff, accessibleClassIds, errorResponse } from "@/lib/auth";

// 학부모 알림 메시지 1건 삭제 (접근 가능한 반 학생의 알림만)
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff();
    const { id } = await ctx.params;
    const ids = await accessibleClassIds(s);
    const log = await db.notificationLog.findUnique({
      where: { id: Number(id) },
      include: { student: { select: { classId: true } } },
    });
    if (!log) return Response.json({ error: "알림을 찾을 수 없습니다." }, { status: 404 });
    if (ids !== null && !(log.student.classId && ids.includes(log.student.classId))) {
      return Response.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    await db.notificationLog.delete({ where: { id: log.id } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
