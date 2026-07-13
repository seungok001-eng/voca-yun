import { db } from "@/lib/db";
import { requireStudent, errorResponse } from "@/lib/auth";

// 월별 랭킹: 반(class) 또는 학원 전체(academy). PointLog 월별 합산.
export async function GET(req: Request) {
  try {
    const s = await requireStudent();
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") === "academy" ? "academy" : "class";
    const month = url.searchParams.get("month") || kstMonth();

    const me = await db.user.findUnique({ where: { id: s.uid }, include: { organization: true } });
    if (!me) return Response.json({ error: "사용자 없음" }, { status: 404 });

    // 대상 학생 집합
    let studentIds: number[];
    let scopeName: string;
    if (scope === "academy") {
      if (!me.organizationId) return Response.json({ scope, month, rows: [], me: s.uid, scopeName: "학원 미소속" });
      const students = await db.user.findMany({ where: { role: "STUDENT", organizationId: me.organizationId, status: "APPROVED" }, select: { id: true } });
      studentIds = students.map((u) => u.id);
      scopeName = me.organization?.name ?? "학원 전체";
    } else {
      if (!me.classId) return Response.json({ scope, month, rows: [], me: s.uid, scopeName: "반 미배정" });
      const students = await db.user.findMany({ where: { role: "STUDENT", classId: me.classId }, select: { id: true } });
      studentIds = students.map((u) => u.id);
      const cls = await db.class.findUnique({ where: { id: me.classId } });
      scopeName = cls?.name ?? "우리 반";
    }
    if (studentIds.length === 0) return Response.json({ scope, month, rows: [], me: s.uid, scopeName });

    // 월 범위 (KST)
    const [y, m] = month.split("-").map(Number);
    const gte = new Date(Date.UTC(y, m - 1, 1) - 9 * 3600 * 1000);
    const lt = new Date(Date.UTC(y, m, 1) - 9 * 3600 * 1000);

    const [grouped, badgeGrouped] = await Promise.all([
      db.pointLog.groupBy({
        by: ["studentId"],
        where: { studentId: { in: studentIds }, createdAt: { gte, lt } },
        _sum: { points: true },
      }),
      // 이달 획득 뱃지 수 (연속통과 뱃지)
      db.badgeLog.groupBy({
        by: ["studentId"],
        where: { studentId: { in: studentIds }, createdAt: { gte, lt } },
        _count: { _all: true },
      }),
    ]);
    const pointsById = new Map(grouped.map((g) => [g.studentId, g._sum.points ?? 0]));
    const badgesById = new Map(badgeGrouped.map((g) => [g.studentId, g._count._all]));

    // 포인트 0인 학생도 포함해서 이름 조회
    const users = await db.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true } });
    let rows = users
      .map((u) => ({ id: u.id, name: u.name, points: pointsById.get(u.id) ?? 0, badges: badgesById.get(u.id) ?? 0 }))
      .sort((a, b) => b.points - a.points)
      .map((r, i) => ({ rank: i + 1, ...r }));

    // 학원 전체는 표시 순위 수(top N) 제한 — 단, 내 순위는 항상 포함
    if (scope === "academy" && me.organization) {
      const topN = me.organization.rankingTopN ?? 10;
      const meRow = rows.find((r) => r.id === s.uid);
      rows = rows.slice(0, topN);
      if (meRow && !rows.some((r) => r.id === s.uid)) rows.push(meRow);
    }

    return Response.json({ scope, month, scopeName, me: s.uid, rows });
  } catch (e) {
    return errorResponse(e);
  }
}

function kstMonth(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
}
