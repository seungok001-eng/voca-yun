import { db } from "./db";

// ─────────────────────────────────────────────────────────────
// 한국 공휴일 자동 계산 (2026~2040)
// 고정 공휴일 + 대체공휴일 규칙은 코드로 계산, 음력 명절만 확정표 사용.
// 음력 표는 한국천문연구원 발표 기준. 2030년대 후반은 오차 가능성이 있으니
// 문제 시 관리자 휴무 기간으로 보정하면 된다.
// ─────────────────────────────────────────────────────────────

// 음력 명절 당일 (설날, 추석, 석가탄신일)
const SEOLLAL: Record<number, string> = {
  2026: "2026-02-17", 2027: "2027-02-07", 2028: "2028-01-27", 2029: "2029-02-13",
  2030: "2030-02-03", 2031: "2031-01-23", 2032: "2032-02-11", 2033: "2033-01-31",
  2034: "2034-02-19", 2035: "2035-02-08", 2036: "2036-01-28", 2037: "2037-02-15",
  2038: "2038-02-04", 2039: "2039-01-24", 2040: "2040-02-12",
};
const CHUSEOK: Record<number, string> = {
  2026: "2026-09-25", 2027: "2027-09-15", 2028: "2028-10-03", 2029: "2029-09-22",
  2030: "2030-09-12", 2031: "2031-10-01", 2032: "2032-09-19", 2033: "2033-09-08",
  2034: "2034-09-27", 2035: "2035-09-16", 2036: "2036-10-04", 2037: "2037-09-24",
  2038: "2038-09-13", 2039: "2039-10-02", 2040: "2040-09-21",
};
const BUDDHA: Record<number, string> = {
  2026: "2026-05-24", 2027: "2027-05-13", 2028: "2028-05-02", 2029: "2029-05-20",
  2030: "2030-05-09", 2031: "2031-05-28", 2032: "2032-05-16", 2033: "2033-05-06",
  2034: "2034-05-25", 2035: "2035-05-15", 2036: "2036-05-03", 2037: "2037-05-22",
  2038: "2038-05-11", 2039: "2039-04-30", 2040: "2040-05-18",
};
// 확정된 선거일 (법정 공휴일)
const ELECTIONS = ["2026-06-03"];

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

const DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
export function dayCodeOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return DAY_CODES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}
const isWeekend = (d: string) => {
  const c = dayCodeOf(d);
  return c === "SAT" || c === "SUN";
};

function buildYear(year: number, set: Set<string>) {
  const fixed = [`${year}-01-01`, `${year}-03-01`, `${year}-05-05`, `${year}-06-06`, `${year}-08-15`, `${year}-10-03`, `${year}-10-09`, `${year}-12-25`];
  const lunarTrios: string[] = [];
  if (SEOLLAL[year]) lunarTrios.push(SEOLLAL[year]);
  if (CHUSEOK[year]) lunarTrios.push(CHUSEOK[year]);

  // 1) 음력 연휴 3일 먼저 등록
  const trioDays: string[] = [];
  for (const main of lunarTrios) {
    for (const d of [addDays(main, -1), main, addDays(main, 1)]) {
      set.add(d);
      trioDays.push(d);
    }
  }
  // 2) 고정 공휴일 + 석가탄신일 등록
  for (const d of fixed) set.add(d);
  if (BUDDHA[year]) set.add(BUDDHA[year]);

  const nextFreeWeekday = (from: string): string => {
    let d = addDays(from, 1);
    while (isWeekend(d) || set.has(d)) d = addDays(d, 1);
    return d;
  };

  // 3) 대체공휴일 — 설/추석: 연휴 중 일요일이 낀 날 수만큼
  //    (다른 공휴일과 겹친 경우는 아래 4)에서 해당 공휴일 쪽 대체로 1회만 처리)
  for (const main of lunarTrios) {
    const trio = [addDays(main, -1), main, addDays(main, 1)];
    let owed = 0;
    for (const d of trio) {
      if (dayCodeOf(d) === "SUN") owed++;
    }
    let cursor = trio[2];
    for (let i = 0; i < owed; i++) {
      const sub = nextFreeWeekday(cursor);
      set.add(sub);
      cursor = sub;
    }
  }
  // 4) 대체공휴일 — 삼일절·어린이날·광복절·개천절·한글날·석탄일·성탄절: 토/일 또는 음력연휴와 겹침
  const subEligible = [`${year}-03-01`, `${year}-05-05`, `${year}-08-15`, `${year}-10-03`, `${year}-10-09`, `${year}-12-25`, BUDDHA[year]].filter(Boolean) as string[];
  for (const d of subEligible) {
    if (isWeekend(d) || trioDays.includes(d)) set.add(nextFreeWeekday(d));
  }
}

let cachedHolidays: Set<string> | null = null;
export function krHolidays(): Set<string> {
  if (cachedHolidays) return cachedHolidays;
  const set = new Set<string>(ELECTIONS);
  for (let y = 2026; y <= 2040; y++) buildYear(y, set);
  cachedHolidays = set;
  return set;
}

// ─────────────────────────────────────────────────────────────
// 학습일 판단
// ─────────────────────────────────────────────────────────────

export type ScheduleContext = {
  studyDaySet: Set<string>; // 학습 요일 (예: MON,WED,FRI)
  holidayRanges: { startDate: string; endDate: string }[]; // 휴무 기간 (방학·시험 등)
  skipKoreanHolidays: boolean;
};

// 학생의 스케줄 컨텍스트 로드 (studyDays는 resolveSettings로 해석된 값)
export async function loadScheduleContext(studentId: number, studyDays: string): Promise<ScheduleContext> {
  const student = await db.user.findUnique({
    where: { id: studentId },
    select: { classId: true, organizationId: true, organization: { select: { skipKoreanHolidays: true } } },
  });
  let holidayRanges: { startDate: string; endDate: string }[] = [];
  if (student?.organizationId) {
    holidayRanges = await db.holiday.findMany({
      where: {
        organizationId: student.organizationId,
        OR: [{ classId: null }, ...(student.classId ? [{ classId: student.classId }] : [])],
      },
      select: { startDate: true, endDate: true },
    });
  }
  return {
    studyDaySet: new Set(studyDays.split(",").map((s) => s.trim()).filter(Boolean)),
    holidayRanges,
    skipKoreanHolidays: student?.organization?.skipKoreanHolidays ?? true,
  };
}

export function isStudyDay(dateStr: string, ctx: ScheduleContext): boolean {
  if (!ctx.studyDaySet.has(dayCodeOf(dateStr))) return false;
  if (ctx.skipKoreanHolidays && krHolidays().has(dateStr)) return false;
  for (const h of ctx.holidayRanges) {
    if (dateStr >= h.startDate && dateStr <= h.endDate) return false;
  }
  return true;
}

// [start, end] 사이 학습일 수 (양끝 포함)
export function countStudyDays(start: string, end: string, ctx: ScheduleContext): number {
  if (end < start) return 0;
  let count = 0;
  let d = start;
  for (let i = 0; i < 5600 && d <= end; i++) {
    if (isStudyDay(d, ctx)) count++;
    d = addDays(d, 1);
  }
  return count;
}

// start부터 n번째(1-base) 학습일의 날짜
export function nthStudyDate(start: string, n: number, ctx: ScheduleContext): string {
  let d = start;
  let seen = 0;
  for (let i = 0; i < 5600; i++) {
    if (isStudyDay(d, ctx)) {
      seen++;
      if (seen === n) return d;
    }
    d = addDays(d, 1);
  }
  return d;
}

// 기준일 이전(미포함)의 가장 최근 학습일
export function prevStudyDay(dateStr: string, ctx: ScheduleContext): string {
  let d = addDays(dateStr, -1);
  for (let i = 0; i < 400; i++) {
    if (isStudyDay(d, ctx)) return d;
    d = addDays(d, -1);
  }
  return d;
}
