import { db } from "@/lib/db";
import { requireStaff, accessibleOrgId, accessibleClassIds, errorResponse } from "@/lib/auth";

// 여러 학생을 한 번에 반 이동 (또는 미배정). 접근 가능한 학원/반 범위 안에서만.
export async function PATCH(req: Request) {
  try {
    const s = await requireStaff();
    const b = await req.json();
    const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(Boolean) : [];
    if (ids.length === 0) return Response.json({ error: "선택된 학생이 없습니다." }, { status: 400 });
    const targetClassId = b.classId ? Number(b.classId) : null;

    const orgId = accessibleOrgId(s); // null = 총관리자(전체)
    const classIds = await accessibleClassIds(s); // null = 전체

    // 이동 대상 반이 지정됐다면 내 권한 범위 안의 반인지 확인
    if (targetClassId !== null) {
      const cls = await db.class.findUnique({ where: { id: targetClassId }, select: { organizationId: true } });
      if (!cls) return Response.json({ error: "반을 찾을 수 없습니다." }, { status: 404 });
      if (classIds !== null && !classIds.includes(targetClassId)) {
        return Response.json({ error: "담당 반이 아닙니다." }, { status: 403 });
      }
    }

    // 이동시킬 학생들이 내 학원 소속 학생인지 확인
    const count = await db.user.updateMany({
      where: {
        id: { in: ids },
        role: "STUDENT",
        ...(orgId === null ? {} : { organizationId: orgId }),
      },
      data: { classId: targetClassId },
    });
    return Response.json({ ok: true, count: count.count });
  } catch (e) {
    return errorResponse(e);
  }
}
