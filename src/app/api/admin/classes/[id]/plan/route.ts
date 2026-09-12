import { db } from "@/lib/db";
import { requireStaff, accessibleClassIds, errorResponse, AuthError } from "@/lib/auth";
import { unitsForClass, parseUnitKey, studyDayChecker, autoFill, type PlanUnit } from "@/lib/plan";
import { addDays } from "@/lib/schedule";

// 반의 날짜별 진도 달력 — 선생님·원장·총관리자
async function guard(s: Awaited<ReturnType<typeof requireStaff>>, classId: number) {
  const ids = await accessibleClassIds(s);
  if (ids !== null && !ids.includes(classId)) throw new AuthError(403, "담당 반이 아닙니다.");
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD  → 그 기간의 진도·휴일 + 진도 단위 목록
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff();
    const classId = Number((await ctx.params).id);
    await guard(s, classId);
    const q = new URL(req.url).searchParams;
    const from = q.get("from") ?? "";
    const to = q.get("to") ?? "";
    if (!DATE.test(from) || !DATE.test(to)) return Response.json({ error: "기간을 지정하세요." }, { status: 400 });

    const [units, check, plans] = await Promise.all([
      unitsForClass(classId),
      studyDayChecker(classId),
      db.dailyPlan.findMany({ where: { classId, date: { gte: from, lte: to } }, orderBy: { date: "asc" } }),
    ]);

    // 날짜별 쉬는 이유 (공휴일 이름 / 휴무 이름 / 주말)
    const days: Record<string, { off: string | null; kr: string | null }> = {};
    for (let d = from; d <= to; d = addDays(d, 1)) {
      days[d] = { off: check.reason(d), kr: check.kr.get(d) ?? null };
    }

    return Response.json({
      units,
      days,
      studyDays: [...check.studyDays],
      plans: plans.map((p) => ({ date: p.date, kind: p.kind, label: p.label, lessonId: p.lessonId, wordFrom: p.wordFrom, wordTo: p.wordTo })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// PUT { date, unit }  → 그 날 진도 지정   /  PUT { dates: [..], unit } → 여러 날 한꺼번에
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff();
    const classId = Number((await ctx.params).id);
    await guard(s, classId);
    const b = await req.json();
    const dates: string[] = Array.isArray(b.dates) ? b.dates : b.date ? [b.date] : [];
    if (dates.length === 0 || dates.some((d) => !DATE.test(d))) return Response.json({ error: "날짜를 지정하세요." }, { status: 400 });
    if (dates.some((d) => d > "2040-12-31")) return Response.json({ error: "2040년까지만 정할 수 있습니다." }, { status: 400 });

    const { wordTotal, lessons } = await unitsForClass(classId);
    const parsed = parseUnitKey(String(b.unit ?? ""), wordTotal);
    if (!parsed) return Response.json({ error: "진도 단위가 잘못됐습니다." }, { status: 400 });
    if (parsed.kind === "LESSON") {
      const l = lessons.find((x) => x.lessonId === parsed.lessonId);
      if (!l) return Response.json({ error: "이 반 교재의 레슨이 아닙니다." }, { status: 400 });
      parsed.label = l.label;
    }

    for (const date of dates) {
      await db.dailyPlan.upsert({
        where: { classId_date: { classId, date } },
        update: { ...parsed, createdById: s.uid },
        create: { classId, date, ...parsed, createdById: s.uid },
      });
    }
    return Response.json({ ok: true, count: dates.length });
  } catch (e) {
    return errorResponse(e);
  }
}

// DELETE ?date=  또는  ?from=&to=  → 진도 지우기
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff();
    const classId = Number((await ctx.params).id);
    await guard(s, classId);
    const q = new URL(req.url).searchParams;
    const date = q.get("date"), from = q.get("from"), to = q.get("to");
    if (date && DATE.test(date)) {
      await db.dailyPlan.deleteMany({ where: { classId, date } });
    } else if (from && to && DATE.test(from) && DATE.test(to)) {
      await db.dailyPlan.deleteMany({ where: { classId, date: { gte: from, lte: to } } });
    } else {
      return Response.json({ error: "날짜를 지정하세요." }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST { startDate, fromUnit, kind: "WORDS"|"LESSON", count?, overwrite? } → 순서대로 채우기
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff();
    const classId = Number((await ctx.params).id);
    await guard(s, classId);
    const b = await req.json();
    const startDate = String(b.startDate ?? "");
    if (!DATE.test(startDate)) return Response.json({ error: "시작 날짜를 지정하세요." }, { status: 400 });

    const all = await unitsForClass(classId);
    const list: PlanUnit[] = b.kind === "LESSON" ? all.lessons : all.words;
    if (list.length === 0) return Response.json({ error: b.kind === "LESSON" ? "이 반에 배정된 교재가 없습니다." : "이 반에 배정된 VOCA 학습이 없습니다." }, { status: 400 });
    let start = list.findIndex((u) => u.key === b.fromUnit);
    if (start < 0) start = 0;
    const count = Math.max(1, Math.min(list.length - start, Number(b.count) || list.length));
    const units = list.slice(start, start + count);

    const r = await autoFill({ classId, startDate, units, overwrite: Boolean(b.overwrite), createdById: s.uid });
    return Response.json({ ok: true, ...r, requested: units.length });
  } catch (e) {
    return errorResponse(e);
  }
}
