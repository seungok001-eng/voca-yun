import { db } from "@/lib/db";
import { requireDirector, accessibleOrgId, errorResponse } from "@/lib/auth";

function kstMonth(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
}

// 학원 전체 월별 랭킹 관리 — 표시 순위 수 조회/설정 + 미리보기
export async function GET(req: Request) {
  try {
    const s = await requireDirector();
    const url = new URL(req.url);
    let orgId = accessibleOrgId(s);
    if (s.role === "SUPER_ADMIN") orgId = url.searchParams.get("academyId") ? Number(url.searchParams.get("academyId")) : (s.orgId ?? null);
    if (orgId === null) return Response.json({ error: "학원을 지정하세요." }, { status: 400 });

    const month = url.searchParams.get("month") || kstMonth();
    const org = await db.organization.findUnique({ where: { id: orgId } });
    if (!org) return Response.json({ error: "학원 없음" }, { status: 404 });

    const students = await db.user.findMany({ where: { role: "STUDENT", organizationId: orgId, status: "APPROVED" }, select: { id: true, name: true, class: { select: { name: true } } } });
    const ids = students.map((u) => u.id);
    const [y, m] = month.split("-").map(Number);
    const gte = new Date(Date.UTC(y, m - 1, 1) - 9 * 3600 * 1000);
    const lt = new Date(Date.UTC(y, m, 1) - 9 * 3600 * 1000);
    const [grouped, badgeGrouped] = ids.length
      ? await Promise.all([
          db.pointLog.groupBy({ by: ["studentId"], where: { studentId: { in: ids }, createdAt: { gte, lt } }, _sum: { points: true } }),
          db.badgeLog.groupBy({ by: ["studentId"], where: { studentId: { in: ids }, createdAt: { gte, lt } }, _count: { _all: true } }),
        ])
      : [[], []];
    const pts = new Map(grouped.map((g) => [g.studentId, g._sum.points ?? 0]));
    const badges = new Map(badgeGrouped.map((g) => [g.studentId, g._count._all]));
    const rows = students
      .map((u) => ({ id: u.id, name: u.name, className: u.class?.name ?? "-", points: pts.get(u.id) ?? 0, badges: badges.get(u.id) ?? 0 }))
      .sort((a, b) => b.points - a.points)
      .map((r, i) => ({ rank: i + 1, ...r }));

    return Response.json({ academyName: org.name, rankingTopN: org.rankingTopN, month, rows });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const s = await requireDirector();
    const b = await req.json();
    let orgId = accessibleOrgId(s);
    if (s.role === "SUPER_ADMIN") orgId = b.academyId ? Number(b.academyId) : (s.orgId ?? null);
    if (orgId === null) return Response.json({ error: "학원을 지정하세요." }, { status: 400 });
    const topN = Math.max(1, Math.min(100, Number(b.rankingTopN) || 10));
    await db.organization.update({ where: { id: orgId }, data: { rankingTopN: topN } });
    return Response.json({ ok: true, rankingTopN: topN });
  } catch (e) {
    return errorResponse(e);
  }
}
