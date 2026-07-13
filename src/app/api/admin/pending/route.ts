import { db } from "@/lib/db";
import { requireDirector, accessibleOrgId, errorResponse } from "@/lib/auth";

// 승인 대기 학생·선생님 목록 (자기 학원). 원장급만.
export async function GET() {
  try {
    const s = await requireDirector();
    const orgId = accessibleOrgId(s);
    const pending = await db.user.findMany({
      where: { role: { in: ["STUDENT", "TEACHER"] }, status: "PENDING", ...(orgId === null ? {} : { organizationId: orgId }) },
      orderBy: { createdAt: "asc" },
      include: { organization: { select: { name: true } } },
    });
    return Response.json({
      pending: pending.map((u) => ({
        id: u.id, name: u.name, username: u.username, role: u.role, birthdate: u.birthdate,
        gender: u.gender, school: u.school, parentPhone: u.parentPhone,
        academyName: u.organization?.name ?? "-", createdAt: u.createdAt,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
