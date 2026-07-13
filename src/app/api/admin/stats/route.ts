import { db } from "@/lib/db";
import { requireStaff, accessibleClassIds, accessibleOrgId, errorResponse } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

// 통계: 통과율, 자주 틀리는 단어 Top 10, 학생별 정답률
export async function GET(req: Request) {
  try {
    const s = await requireStaff();
    const url = new URL(req.url);
    const classIdParam = url.searchParams.get("classId");
    const academyIdParam = url.searchParams.get("academyId");
    const ids = await accessibleClassIds(s);
    let classFilter: number[] | null = ids;
    if (classIdParam) {
      const cid = Number(classIdParam);
      if (ids !== null && !ids.includes(cid)) return Response.json({ error: "권한 없음" }, { status: 403 });
      classFilter = [cid];
    }
    // 총관리자는 학원(academyId)으로 범위 지정 가능
    const orgId = s.role === "SUPER_ADMIN" && academyIdParam ? Number(academyIdParam) : accessibleOrgId(s);
    const studentWhere: Prisma.UserWhereInput = {
      role: "STUDENT",
      ...(classFilter === null ? {} : { classId: { in: classFilter } }),
      ...(orgId === null ? {} : { organizationId: orgId }),
    };
    const students = await db.user.findMany({ where: studentWhere, select: { id: true, name: true } });
    const studentIds = students.map((u) => u.id);

    const [sessionStats, topWrong, perStudent] = await Promise.all([
      db.testSession.groupBy({
        by: ["status"],
        where: { studentId: { in: studentIds }, status: { in: ["PASSED", "FAILED"] } },
        _count: true,
      }),
      db.wrongNote.groupBy({
        by: ["wordId"],
        where: { studentId: { in: studentIds } },
        _sum: { wrongCount: true },
        orderBy: { _sum: { wrongCount: "desc" } },
        take: 10,
      }),
      db.testAnswer.groupBy({
        by: ["correct"],
        where: { session: { studentId: { in: studentIds } } },
        _count: true,
      }),
    ]);

    const words = await db.word.findMany({ where: { id: { in: topWrong.map((w) => w.wordId) } } });
    const wordMap = new Map(words.map((w) => [w.id, w]));

    // 학생별 정답률
    const perStudentAcc = await Promise.all(
      students.map(async (st) => {
        const grouped = await db.testAnswer.groupBy({
          by: ["correct"],
          where: { session: { studentId: st.id } },
          _count: true,
        });
        const c = grouped.find((g) => g.correct)?._count ?? 0;
        const w = grouped.find((g) => !g.correct)?._count ?? 0;
        const passed = await db.testSession.count({ where: { studentId: st.id, status: "PASSED" } });
        const failed = await db.testSession.count({ where: { studentId: st.id, status: "FAILED" } });
        return {
          id: st.id, name: st.name,
          accuracy: c + w > 0 ? Math.round((c / (c + w)) * 100) : null,
          passed, failed,
        };
      })
    );

    const passed = sessionStats.find((x) => x.status === "PASSED")?._count ?? 0;
    const failed = sessionStats.find((x) => x.status === "FAILED")?._count ?? 0;
    const correctTotal = perStudent.find((x) => x.correct)?._count ?? 0;
    const wrongTotal = perStudent.find((x) => !x.correct)?._count ?? 0;

    return Response.json({
      passed,
      failed,
      passRate: passed + failed > 0 ? Math.round((passed / (passed + failed)) * 100) : null,
      accuracy: correctTotal + wrongTotal > 0 ? Math.round((correctTotal / (correctTotal + wrongTotal)) * 100) : null,
      topWrongWords: topWrong.map((t) => ({
        word: wordMap.get(t.wordId)?.text ?? "?",
        meanings: wordMap.get(t.wordId) ? JSON.parse(wordMap.get(t.wordId)!.meaningsJson) : [],
        count: t._sum.wrongCount ?? 0,
      })),
      students: perStudentAcc.sort((a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1)),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
