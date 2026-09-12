// 반의 날짜별 진도 (DailyPlan)
//
// 선생님이 달력에서 날짜마다 정한 학습 범위. 학생 화면·시험은 이것을 최우선으로 따른다.
//  - VOCA 과정: 단어 번호 범위 (반의 VOCA 배정 기준)
//  - 교재 과정: 레슨
// 진도 단위(unit)는 반 설정의 하루 단어 수로 잘라 만든다.

import { db } from "./db";
import { addDays, dayCodeOf, krHolidayMap } from "./schedule";
import { todayStr } from "./srs";

/** 교재 레슨 진행 순서 — 같은 파트 안에서 Toon L1 → Book L1 → Toon L2 → Book L2 … */
export function lessonOrder(a: { area: string; order: number }, b: { area: string; order: number }) {
  return a.order - b.order || (a.area === "TOON" ? -1 : 1) - (b.area === "TOON" ? -1 : 1);
}

export type PlanUnit = {
  key: string;        // "W:1:30" | "L:123"
  kind: "WORDS" | "LESSON";
  label: string;      // "1~30번" | "P1 Toon L3"
  sub?: string;       // 부제 (레슨 이름)
  wordFrom?: number; wordTo?: number; lessonId?: number;
};

export type PlanRow = {
  date: string; kind: "WORDS" | "LESSON"; label: string;
  lessonId: number | null; wordFrom: number | null; wordTo: number | null;
};

/** 반의 진도 단위 목록 — VOCA 범위와 교재 레슨을 모두 돌려준다 */
export async function unitsForClass(classId: number): Promise<{ words: PlanUnit[]; lessons: PlanUnit[]; wordTotal: number; sourceName: string; textbookName: string; perDay: number; program: string }> {
  const [cls, assignment, course] = await Promise.all([
    db.class.findUnique({ where: { id: classId }, include: { setting: true } }),
    db.assignment.findFirst({ where: { classId, active: true }, orderBy: { createdAt: "desc" }, include: { level: true, wordbook: true } }),
    db.courseAssignment.findUnique({
      where: { classId },
      include: { textbook: { include: { parts: { orderBy: { order: "asc" }, include: { lessons: { orderBy: [{ area: "asc" }, { order: "asc" }] } } } } } },
    }),
  ]);
  const perDay = cls?.setting?.dailyWordCount ?? 30;

  const words: PlanUnit[] = [];
  let wordTotal = 0;
  let sourceName = "";
  if (assignment) {
    const where = assignment.sourceType === "LEVEL" ? { levelId: assignment.levelId! } : { wordbookId: assignment.wordbookId! };
    wordTotal = await db.word.count({ where });
    sourceName = assignment.level ? `${assignment.level.nameKo} (Lv.${assignment.level.order})` : assignment.wordbook?.name ?? "";
    for (let from = 1; from <= wordTotal; from += perDay) {
      const to = Math.min(wordTotal, from + perDay - 1);
      words.push({ key: `W:${from}:${to}`, kind: "WORDS", label: `${from}~${to}번`, wordFrom: from, wordTo: to });
    }
  }

  const lessons: PlanUnit[] = [];
  const areaKo: Record<string, string> = { TOON: "Toon", READING: "Book" };
  for (const p of course?.textbook.parts ?? []) {
    for (const l of [...p.lessons].sort(lessonOrder)) {
      lessons.push({
        key: `L:${l.id}`, kind: "LESSON", lessonId: l.id,
        label: `P${p.order} ${areaKo[l.area] ?? l.area} L${l.order}`, sub: l.name,
      });
    }
  }
  return { words, lessons, wordTotal, sourceName, textbookName: course?.textbook.name ?? "", perDay, program: cls?.setting?.program ?? "VOCA" };
}

// ── 예습: 앞으로 일주일 진도 ────────────────────────────────────
export type PreviewItem = {
  date: string; kind: "WORDS" | "LESSON"; label: string; sub?: string;
  lessonId?: number; wordFrom?: number; wordTo?: number; planned: boolean;
};

/**
 * 내일부터 7일 동안의 진도.
 * 선생님이 달력에 정해 둔 날은 그것을, 없는 날은 지금 방식(순서대로)으로 나갈 예정인 분량을 계산해 보여준다.
 */
export async function upcomingForStudent(studentId: number, days = 7): Promise<PreviewItem[]> {
  const { resolveSettings } = await import("./settings");
  const { loadScheduleContext, isStudyDay } = await import("./schedule");
  const me = await db.user.findUnique({ where: { id: studentId }, select: { classId: true } });
  const settings = await resolveSettings(studentId);
  const today = todayStr();
  const from = addDays(today, 1), to = addDays(today, days);

  // 1) 달력에 정해 둔 진도
  const planned = me?.classId
    ? await db.dailyPlan.findMany({ where: { classId: me.classId, date: { gte: from, lte: to } }, orderBy: { date: "asc" } })
    : [];
  const out: PreviewItem[] = [];
  const lessonNames = new Map<number, { label: string; sub: string }>();
  if (planned.some((p) => p.kind === "LESSON")) {
    const ls = await db.lesson.findMany({
      where: { id: { in: planned.filter((p) => p.lessonId).map((p) => p.lessonId!) } },
      include: { part: true },
    });
    for (const l of ls) lessonNames.set(l.id, { label: `P${l.part.order} ${l.area === "TOON" ? "Toon" : "Book"} L${l.order}`, sub: l.name });
  }
  for (const p of planned) {
    if (p.kind === "LESSON" && p.lessonId) {
      const n = lessonNames.get(p.lessonId);
      out.push({ date: p.date, kind: "LESSON", label: n?.label ?? p.label, sub: n?.sub, lessonId: p.lessonId, planned: true });
    } else if (p.wordFrom && p.wordTo) {
      out.push({ date: p.date, kind: "WORDS", label: p.label, wordFrom: p.wordFrom, wordTo: p.wordTo, planned: true });
    }
  }
  if (out.length > 0) return out;

  // 2) 정해 둔 게 없으면 순서대로 나갈 예정인 분량 — 학습일에만
  const ctx = await loadScheduleContext(studentId, settings.studyDays);
  const studyDates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isStudyDay(d, ctx)) studyDates.push(d);
  if (studyDates.length === 0) return [];

  if (settings.program === "TEXTBOOK") {
    const { textbookHome } = await import("./textbook-student");
    const home = await textbookHome(studentId);
    if (!home.textbook) return [];
    const idx = home.lessons.findIndex((l) => l.id === home.todayLessonId);
    const rest = home.lessons.slice(idx + 1).filter((l) => !l.done);
    return studyDates.slice(0, rest.length).map((date, i) => {
      const l = rest[i];
      return { date, kind: "LESSON", label: `P${l.partOrder} ${l.area === "TOON" ? "Toon" : "Book"} L${l.order}`, sub: l.name, lessonId: l.id, planned: false };
    });
  }

  // VOCA: 오늘 분량 다음부터 하루 단어 수씩
  const { activeAssignmentFor } = await import("./test-service");
  const assignment = await activeAssignmentFor(studentId);
  if (!assignment) return [];
  const where = assignment.sourceType === "LEVEL" ? { levelId: assignment.levelId! } : { wordbookId: assignment.wordbookId! };
  const total = await db.word.count({ where });
  const progress = await db.studentProgress.findUnique({ where: { studentId_assignmentId: { studentId, assignmentId: assignment.id } } });
  const daily = settings.dailyWordCount;
  let start = (progress?.wordCursor ?? 0) + daily; // 오늘 분량 다음
  for (const date of studyDates) {
    if (start >= total) break;
    const f = start + 1, t = Math.min(total, start + daily);
    out.push({ date, kind: "WORDS", label: `${f}~${t}번`, wordFrom: f, wordTo: t, planned: false });
    start += daily;
  }
  return out;
}

/** "W:1:30" / "L:12" → 저장할 값 */
export function parseUnitKey(key: string, wordTotal: number): Omit<PlanRow, "date"> | null {
  const w = /^W:(\d+):(\d+)$/.exec(key);
  if (w) {
    const from = Number(w[1]), to = Number(w[2]);
    if (from < 1 || to < from || (wordTotal && to > wordTotal)) return null;
    return { kind: "WORDS", label: `${from}~${to}번`, wordFrom: from, wordTo: to, lessonId: null };
  }
  const l = /^L:(\d+)$/.exec(key);
  if (l) return { kind: "LESSON", label: "", lessonId: Number(l[1]), wordFrom: null, wordTo: null };
  return null;
}

/** 이 반이 이 날 공부하는 날인지 — 요일·공휴일·학원/반 휴무 */
export async function studyDayChecker(classId: number) {
  const cls = await db.class.findUnique({
    where: { id: classId },
    include: { setting: true, organization: { select: { skipKoreanHolidays: true } } },
  });
  const studyDays = new Set((cls?.setting?.studyDays ?? "MON,TUE,WED,THU,FRI,SAT,SUN").split(",").map((x) => x.trim()));
  const ranges = cls?.organizationId
    ? await db.holiday.findMany({
        where: { organizationId: cls.organizationId, OR: [{ classId: null }, { classId }] },
        select: { startDate: true, endDate: true, name: true, classId: true },
      })
    : [];
  const skipKr = cls?.organization?.skipKoreanHolidays ?? true;
  const kr = krHolidayMap();
  return {
    studyDays, ranges, skipKr, kr,
    reason(date: string): string | null {
      const code = dayCodeOf(date);
      if (!studyDays.has(code)) return code === "SAT" || code === "SUN" ? "주말" : "학습 요일 아님";
      const h = ranges.find((r) => r.startDate <= date && date <= r.endDate);
      if (h) return h.name;
      if (skipKr && kr.has(date)) return kr.get(date)!;
      return null;
    },
  };
}

/** 오늘 이 반의 진도 (없으면 null) */
export async function todayPlanFor(classId: number | null | undefined): Promise<PlanRow | null> {
  if (!classId) return null;
  const row = await db.dailyPlan.findUnique({ where: { classId_date: { classId, date: todayStr() } } });
  return row ? { date: row.date, kind: row.kind as PlanRow["kind"], label: row.label, lessonId: row.lessonId, wordFrom: row.wordFrom, wordTo: row.wordTo } : null;
}

/**
 * 순서대로 채우기 — 시작 날짜부터 학습일에만 단위를 차례로 놓는다.
 * 이미 진도가 있는 날은 overwrite=true 일 때만 덮어쓴다.
 */
export async function autoFill(opts: {
  classId: number; startDate: string; units: PlanUnit[]; overwrite: boolean; createdById: number;
}): Promise<{ placed: number; lastDate: string | null }> {
  const check = await studyDayChecker(opts.classId);
  const existing = new Set((await db.dailyPlan.findMany({ where: { classId: opts.classId }, select: { date: true } })).map((r) => r.date));
  let date = opts.startDate;
  let i = 0, placed = 0, lastDate: string | null = null;
  let guard = 0;
  while (i < opts.units.length && guard++ < 4000) {
    if (date > "2040-12-31") break;
    const off = check.reason(date);
    if (!off) {
      if (!existing.has(date) || opts.overwrite) {
        const u = opts.units[i];
        await db.dailyPlan.upsert({
          where: { classId_date: { classId: opts.classId, date } },
          update: { kind: u.kind, label: u.sub ? `${u.label}` : u.label, lessonId: u.lessonId ?? null, wordFrom: u.wordFrom ?? null, wordTo: u.wordTo ?? null, createdById: opts.createdById },
          create: { classId: opts.classId, date, kind: u.kind, label: u.label, lessonId: u.lessonId ?? null, wordFrom: u.wordFrom ?? null, wordTo: u.wordTo ?? null, createdById: opts.createdById },
        });
        placed++; lastDate = date; i++;
      } else {
        // 이미 있는 날은 건너뛴다 (그 단위는 다음 빈 학습일에)
      }
    }
    date = addDays(date, 1);
  }
  return { placed, lastDate };
}
