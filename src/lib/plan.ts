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
export async function unitsForClass(classId: number): Promise<{ words: PlanUnit[]; lessons: PlanUnit[]; wordTotal: number; sourceName: string; textbookName: string; perDay: number }> {
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
  return { words, lessons, wordTotal, sourceName, textbookName: course?.textbook.name ?? "", perDay };
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
