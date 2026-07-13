import { db } from "@/lib/db";
import { requireStaff, accessibleClassIds, errorResponse } from "@/lib/auth";

// 학부모 알림 로그 (알림톡/SMS 발송 연동 지점)
export async function GET() {
  try {
    const s = await requireStaff();
    const ids = await accessibleClassIds(s);
    const logs = await db.notificationLog.findMany({
      where: ids === null ? {} : { student: { classId: { in: ids } } },
      include: { student: { select: { name: true, parentPhone: true, class: { select: { name: true } } } } },
      orderBy: { sentAt: "desc" },
      take: 100,
    });
    return Response.json({
      logs: logs.map((l) => ({
        id: l.id, type: l.type, message: l.message, sentAt: l.sentAt,
        studentName: l.student.name, className: l.student.class?.name ?? "-",
        parentPhone: l.student.parentPhone ?? "-",
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
