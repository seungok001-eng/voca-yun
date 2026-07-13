import { db } from "@/lib/db";
import { requireStaff, accessibleOrgId, errorResponse } from "@/lib/auth";
import { computeBehind } from "@/lib/progress";
import type { Prisma } from "@prisma/client";

const ROLE_ORDER: Record<string, number> = { SUPER_ADMIN: 0, DIRECTOR: 1, TEACHER: 2, STUDENT: 3, INDIVIDUAL: 4 };

// 학원 전체 명단 (검색·반 필터). 학생은 레벨/밀린일수까지 계산.
export async function GET(req: Request) {
  try {
    const s = await requireStaff();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    const classId = url.searchParams.get("classId");
    const academyIdParam = url.searchParams.get("academyId");

    // 대상 학원 결정: 총관리자는 academyId 지정 가능, 그 외엔 자기 학원
    let orgId = accessibleOrgId(s);
    if (s.role === "SUPER_ADMIN") orgId = academyIdParam ? Number(academyIdParam) : (s.orgId ?? null);

    const where: Prisma.UserWhereInput = {};
    if (orgId !== null) where.organizationId = orgId;
    if (q) where.name = { contains: q };
    if (classId) where.classId = Number(classId);

    const [users, classes, org] = await Promise.all([
      db.user.findMany({ where, include: { class: { select: { id: true, name: true } } } }),
      db.class.findMany({ where: orgId !== null ? { organizationId: orgId } : {}, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      orgId !== null ? db.organization.findUnique({ where: { id: orgId }, select: { name: true } }) : Promise.resolve(null),
    ]);

    users.sort((a, b) => (ROLE_ORDER[a.role] - ROLE_ORDER[b.role]) || a.name.localeCompare(b.name, "ko"));

    // 학생만 밀린 일수/레벨 계산 (병렬)
    const behinds = await Promise.all(
      users.map((u) => (u.role === "STUDENT" ? computeBehind(u.id) : Promise.resolve(null)))
    );

    const roleCounts = { director: 0, teacher: 0, student: 0, pending: 0 };
    users.forEach((u) => {
      if (u.role === "SUPER_ADMIN" || u.role === "DIRECTOR") roleCounts.director++;
      else if (u.role === "TEACHER") roleCounts.teacher++;
      else if (u.role === "STUDENT") { roleCounts.student++; if (u.status === "PENDING") roleCounts.pending++; }
    });

    return Response.json({
      academyName: org?.name ?? null,
      classes,
      roleCounts,
      total: users.length,
      members: users.map((u, i) => {
        const b = behinds[i];
        return {
          id: u.id, name: u.name, username: u.username, plainPassword: u.plainPassword ?? null,
          role: u.role, status: u.status,
          classId: u.classId, className: u.class?.name ?? null,
          school: u.school, grade: u.grade, parentPhone: u.parentPhone, birthdate: u.birthdate,
          level: b?.levelName ?? null,
          behindDays: b ? b.behindDays : null,
          cursor: b?.cursor ?? null, total: b?.total ?? null,
        };
      }),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
