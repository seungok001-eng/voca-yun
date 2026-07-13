import { db } from "@/lib/db";
import { requireStaff, accessibleOrgId, errorResponse } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

// 조회·삭제 범위(학원 단위) 결정.
// 원장/선생님 = 본인 학원. 총관리자 = academyId 지정 시 그 학원, 없으면 전체.
function scopeWhere(orgId: number | null, academyId: string | null): Prisma.NotificationLogWhereInput {
  if (orgId !== null) return { student: { organizationId: orgId } }; // 원장·선생님
  if (academyId) return { student: { organizationId: Number(academyId) } }; // 총관리자 + 학원 선택
  return {}; // 총관리자 전체
}

// 학부모 알림 로그 (알림톡/SMS 발송 연동 지점)
export async function GET(req: Request) {
  try {
    const s = await requireStaff();
    const academyId = new URL(req.url).searchParams.get("academyId");
    const logs = await db.notificationLog.findMany({
      where: scopeWhere(accessibleOrgId(s), academyId),
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

// 조회 범위의 학부모 알림 전체 삭제 (원장=본인 학원, 총관리자=선택 학원 또는 전체)
export async function DELETE(req: Request) {
  try {
    const s = await requireStaff();
    const academyId = new URL(req.url).searchParams.get("academyId");
    const r = await db.notificationLog.deleteMany({ where: scopeWhere(accessibleOrgId(s), academyId) });
    return Response.json({ ok: true, count: r.count });
  } catch (e) {
    return errorResponse(e);
  }
}
