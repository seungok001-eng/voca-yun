import { db } from "@/lib/db";
import { requireStudent, errorResponse } from "@/lib/auth";

// 반 리더보드 (포인트 순)
export async function GET() {
  try {
    const s = await requireStudent();
    const me = await db.user.findUnique({ where: { id: s.uid } });
    const students = await db.user.findMany({
      where: { role: "STUDENT", ...(me?.classId ? { classId: me.classId } : {}) },
      orderBy: [{ points: "desc" }, { streak: "desc" }],
      take: 50,
      select: { id: true, name: true, points: true, streak: true },
    });
    return Response.json({
      me: s.uid,
      rows: students.map((u, i) => ({ rank: i + 1, id: u.id, name: u.name, points: u.points, streak: u.streak })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
