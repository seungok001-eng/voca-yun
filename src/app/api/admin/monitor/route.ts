import { db } from "@/lib/db";
import { requireStaff, accessibleClassIds, errorResponse } from "@/lib/auth";

// 실시간 시험 모니터링: 진행 중 세션 + 최근 완료
export async function GET() {
  try {
    const s = await requireStaff();
    const ids = await accessibleClassIds(s);
    const studentWhere = ids === null ? { role: "STUDENT" } : { role: "STUDENT", classId: { in: ids } };
    const students = await db.user.findMany({ where: studentWhere, select: { id: true } });
    const studentIds = students.map((u) => u.id);

    const [active, recent, classes] = await Promise.all([
      db.testSession.findMany({
        where: { studentId: { in: studentIds }, status: "IN_PROGRESS" },
        include: { student: { select: { name: true, classId: true, class: { select: { name: true } } } } },
        orderBy: { startedAt: "desc" },
      }),
      db.testSession.findMany({
        where: { studentId: { in: studentIds }, status: { in: ["PASSED", "FAILED"] } },
        include: { student: { select: { name: true, classId: true, class: { select: { name: true } } } } },
        orderBy: { finishedAt: "desc" },
        take: 50,
      }),
      db.class.findMany({
        where: ids === null ? {} : { id: { in: ids } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const fmt = (t: (typeof active)[number]) => ({
      id: t.id,
      studentName: t.student.name,
      classId: t.student.classId,
      className: t.student.class?.name ?? "-",
      kind: t.kind,
      mode: t.mode,
      status: t.status,
      attemptNo: t.attemptNo,
      currentIndex: t.currentIndex,
      total: (JSON.parse(t.itemsJson) as unknown[]).length,
      wrongCount: t.wrongCount,
      failThreshold: t.failThreshold,
      cheatCount: t.cheatCount,
      startedAt: t.startedAt,
      finishedAt: t.finishedAt,
    });

    return Response.json({ active: active.map(fmt), recent: recent.map(fmt), classes });
  } catch (e) {
    return errorResponse(e);
  }
}
