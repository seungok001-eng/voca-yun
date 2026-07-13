import { db } from "@/lib/db";
import { requireStaff, accessibleClassIds, errorResponse } from "@/lib/auth";
import { resolveSettings } from "@/lib/settings";
import { loadScheduleContext, isStudyDay, addDays } from "@/lib/schedule";
import { computeBehind } from "@/lib/progress";
import { todayStr } from "@/lib/srs";

// 주간 요약: 반별 학생들의 이번주 학습일/통과일/포인트/뱃지/스트릭/밀림
export async function GET(req: Request) {
  try {
    const s = await requireStaff();
    const url = new URL(req.url);
    const classIdParam = url.searchParams.get("classId");
    // 주 시작일 (월요일, YYYY-MM-DD). 없으면 이번주 월요일.
    const start = url.searchParams.get("start") || mondayOf(todayStr());
    const end = addDays(start, 6);
    const today = todayStr();

    const allowed = await accessibleClassIds(s);
    let classFilter: number[] | null = allowed;
    if (classIdParam) {
      const cid = Number(classIdParam);
      if (allowed !== null && !allowed.includes(cid)) {
        return Response.json({ error: "권한이 없는 반입니다." }, { status: 403 });
      }
      classFilter = [cid];
    }

    const students = await db.user.findMany({
      where: {
        role: "STUDENT",
        status: "APPROVED",
        ...(classFilter === null ? { classId: { not: null } } : { classId: { in: classFilter } }),
      },
      select: { id: true, name: true, streak: true, class: { select: { id: true, name: true } } },
      orderBy: [{ classId: "asc" }, { name: "asc" }],
    });
    const ids = students.map((u) => u.id);
    if (ids.length === 0) return Response.json({ start, end, rows: [] });

    // 주간 범위 (KST 자정 기준)
    const gte = new Date(Date.parse(`${start}T00:00:00+09:00`));
    const lt = new Date(Date.parse(`${addDays(end, 1)}T00:00:00+09:00`));

    const [sessions, pointGrouped, badgeGrouped] = await Promise.all([
      // 이번주 통과한 진도 시험 (일일/재시험)
      db.testSession.findMany({
        where: {
          studentId: { in: ids },
          status: "PASSED",
          kind: { in: ["DAILY", "RETEST"] },
          finishedAt: { gte, lt },
        },
        select: { studentId: true, finishedAt: true },
      }),
      db.pointLog.groupBy({
        by: ["studentId"],
        where: { studentId: { in: ids }, createdAt: { gte, lt } },
        _sum: { points: true },
      }),
      db.badgeLog.groupBy({
        by: ["studentId"],
        where: { studentId: { in: ids }, date: { gte: start, lte: end } },
        _count: { _all: true },
      }),
    ]);

    const passDatesById = new Map<number, Set<string>>();
    for (const sess of sessions) {
      if (!sess.finishedAt) continue;
      const d = todayStr(sess.finishedAt);
      if (!passDatesById.has(sess.studentId)) passDatesById.set(sess.studentId, new Set());
      passDatesById.get(sess.studentId)!.add(d);
    }
    const pointsById = new Map(pointGrouped.map((g) => [g.studentId, g._sum.points ?? 0]));
    const badgesById = new Map(badgeGrouped.map((g) => [g.studentId, g._count._all]));

    const rows = await Promise.all(
      students.map(async (u) => {
        const settings = await resolveSettings(u.id);
        const ctx = await loadScheduleContext(u.id, settings.studyDays);
        // 이번주 학습일 중 오늘까지 지난 날짜들
        const dueDates: string[] = [];
        for (let d = start; d <= end && d <= today; d = addDays(d, 1)) {
          if (isStudyDay(d, ctx)) dueDates.push(d);
        }
        const passed = passDatesById.get(u.id) ?? new Set<string>();
        const passedDays = dueDates.filter((d) => passed.has(d)).length;
        const behind = await computeBehind(u.id);
        return {
          id: u.id,
          name: u.name,
          className: u.class?.name ?? "-",
          dueDays: dueDates.length, // 이번주 지금까지의 학습일 수
          passedDays, // 그중 통과한 날 수
          weekPoints: pointsById.get(u.id) ?? 0,
          weekBadges: badgesById.get(u.id) ?? 0,
          streak: u.streak,
          behindDays: behind.behindDays,
        };
      })
    );

    return Response.json({ start, end, today, rows });
  } catch (e) {
    return errorResponse(e);
  }
}

// 해당 날짜가 속한 주의 월요일 (KST 날짜 문자열 기준)
function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=일
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}
