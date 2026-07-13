import { db } from "@/lib/db";
import { requireStaff, accessibleClassIds, errorResponse } from "@/lib/auth";

export async function GET() {
  try {
    const s = await requireStaff();
    const ids = await accessibleClassIds(s);
    const classes = await db.class.findMany({
      where: ids === null ? {} : { id: { in: ids } },
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
    const { name, teacherId } = await req.json();
    if (!name) return Response.json({ error: "반 이름을 입력하세요." }, { status: 400 });
    const cls = await db.class.create({
      data: {
        name,
        organizationId: s.orgId ?? null,
        teacherId: s.role === "TEACHER" ? s.uid : teacherId ?? null,
        setting: { create: {} },
      },
    });
    return Response.json({ id: cls.id });
  } catch (e) {
    return errorResponse(e);
  }
}
