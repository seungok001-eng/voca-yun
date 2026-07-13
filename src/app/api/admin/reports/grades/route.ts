import { db } from "@/lib/db";
import { requireStaff, accessibleClassIds, errorResponse } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csv";

// 성적 리포트 CSV: 학생별 시험 통과/탈락/정답률
export async function GET(req: Request) {
  try {
    const s = await requireStaff();
    const url = new URL(req.url);
    const classId = url.searchParams.get("classId");
    const ids = await accessibleClassIds(s);
    let filter: number[] | null = ids;
    if (classId) {
      const cid = Number(classId);
      if (ids !== null && !ids.includes(cid)) return Response.json({ error: "권한 없음" }, { status: 403 });
      filter = [cid];
    }
    const students = await db.user.findMany({
      where: { role: "STUDENT", ...(filter === null ? {} : { classId: { in: filter } }) },
      include: { class: { select: { name: true } } },
      orderBy: [{ classId: "asc" }, { name: "asc" }],
    });

    const rows = await Promise.all(
      students.map(async (st) => {
        const [passed, failed, grouped, lastPass] = await Promise.all([
          db.testSession.count({ where: { studentId: st.id, status: "PASSED" } }),
          db.testSession.count({ where: { studentId: st.id, status: "FAILED" } }),
          db.testAnswer.groupBy({ by: ["correct"], where: { session: { studentId: st.id } }, _count: true }),
          db.testSession.findFirst({
            where: { studentId: st.id, status: "PASSED" },
            orderBy: { finishedAt: "desc" },
            select: { finishedAt: true },
          }),
        ]);
        const c = grouped.find((g) => g.correct)?._count ?? 0;
        const w = grouped.find((g) => !g.correct)?._count ?? 0;
        const acc = c + w > 0 ? Math.round((c / (c + w)) * 100) : null;
        return [
          st.class?.name ?? "-",
          st.name,
          st.username,
          passed,
          failed,
          acc === null ? "-" : `${acc}%`,
          st.points,
          st.streak,
          st.parentPhone ?? "-",
          lastPass?.finishedAt ? new Date(lastPass.finishedAt).toLocaleDateString("ko-KR") : "-",
        ];
      })
    );

    const csv = toCsv(
      ["반", "이름", "아이디", "통과", "탈락", "정답률", "포인트", "연속학습일", "학부모연락처", "최근통과일"],
      rows
    );
    return csvResponse(`성적리포트_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (e) {
    return errorResponse(e);
  }
}
