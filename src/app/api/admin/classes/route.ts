import { db } from "@/lib/db";
import { requireStaff, accessibleClassIds, errorResponse } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  try {
    const s = await requireStaff();
    const academyId = new URL(req.url).searchParams.get("academyId");
    const ids = await accessibleClassIds(s);
    // 총관리자가 학원을 지정하면 그 학원의 반만
    const where: Prisma.ClassWhereInput =
      s.role === "SUPER_ADMIN" && academyId ? { organizationId: Number(academyId) }
      : ids === null ? {} : { id: { in: ids } };
    const classes = await db.class.findMany({
      where,
      include: {
        teacher: { select: { name: true } },
        setting: true,
        _count: { select: { students: true } },
        assignments: { where: { active: true }, include: { level: true, wordbook: true } },
      },
      orderBy: { id: "asc" },
    });
    return Response.json({
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        teacherName: c.teacher?.name ?? null,
        studentCount: c._count.students,
        setting: c.setting,
        assignment: c.assignments[0]
          ? { name: c.assignments[0].level?.nameKo ?? c.assignments[0].wordbook?.name ?? "-" }
          : null,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const s = await requireStaff();
    const { name, teacherId, academyId } = await req.json();
    if (!name) return Response.json({ error: "반 이름을 입력하세요." }, { status: 400 });
    // 총관리자는 지정한 학원에, 그 외엔 본인 학원에 생성
    const orgId = s.role === "SUPER_ADMIN" ? (academyId ? Number(academyId) : null) : (s.orgId ?? null);
    if (s.role === "SUPER_ADMIN" && orgId === null) {
      return Response.json({ error: "반을 만들 학원을 먼저 선택하세요." }, { status: 400 });
    }
    const cls = await db.class.create({
      data: {
        name,
        organizationId: orgId,
        teacherId: s.role === "TEACHER" ? s.uid : teacherId ?? null,
        setting: { create: {} },
      },
    });
    return Response.json({ id: cls.id });
  } catch (e) {
    return errorResponse(e);
  }
}
