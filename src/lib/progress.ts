import { db } from "./db";
import { activeAssignmentFor } from "./test-service";
import { resolveSettings } from "./settings";
import { todayStr } from "./srs";
import { loadScheduleContext, countStudyDays, nthStudyDate, addDays, isStudyDay } from "./schedule";

export type BehindSummary = {
  hasAssignment: boolean;
  levelName: string | null;
  dailyWordCount: number;
  startDate: string | null;
  elapsedDays: number; // 어제까지의 학습일 수 (휴무·비학습요일 제외)
  expected: number; // 어제까지 했어야 할 누적 단어수
  cursor: number; // 실제 통과 단어수
  baseCursor: number; // 시작 지점 (번호-1)
  total: number;
  behindWords: number;
  behindDays: number; // 밀린 학습일 수 (0이면 전날까지 모두 통과)
  assignmentId: number | null;
  todayIsStudyDay: boolean;
};

// 어제까지 밀린 정도 계산 (학습 요일·휴무 기간·공휴일 제외)
export async function computeBehind(studentId: number): Promise<BehindSummary> {
  const empty: BehindSummary = {
    hasAssignment: false, levelName: null, dailyWordCount: 0, startDate: null,
    elapsedDays: 0, expected: 0, cursor: 0, baseCursor: 0, total: 0, behindWords: 0, behindDays: 0,
    assignmentId: null, todayIsStudyDay: true,
  };
  const assignment = await activeAssignmentFor(studentId);
  if (!assignment) return empty;

  const settings = await resolveSettings(studentId);
  const ctx = await loadScheduleContext(studentId, settings.studyDays);
  const daily = settings.dailyWordCount;
  const where = assignment.sourceType === "LEVEL"
    ? { levelId: assignment.levelId! }
    : { wordbookId: assignment.wordbookId! };
  const total = await db.word.count({ where });

  const progress = await db.studentProgress.findUnique({
    where: { studentId_assignmentId: { studentId, assignmentId: assignment.id } },
  });
  const cursor = progress?.wordCursor ?? 0;
  const baseCursor = progress?.baseCursor ?? 0; // 시작 지점 (번호-1)

  let levelName: string | null = null;
  if (assignment.sourceType === "LEVEL" && assignment.levelId) {
    const lv = await db.level.findUnique({ where: { id: assignment.levelId } });
    levelName = lv ? `${lv.groupKo} ${lv.nameKo}` : null;
  } else if (assignment.wordbookId) {
    const wb = await db.wordbook.findUnique({ where: { id: assignment.wordbookId } });
    levelName = wb?.name ?? null;
  }

  const today = todayStr();
  const startDate = todayStr(progress?.startedAt ?? assignment.createdAt);
  const yesterday = addDays(today, -1);
  const elapsedDays = countStudyDays(startDate, yesterday, ctx); // 학습일만 카운트
  const expected = Math.min(total, baseCursor + daily * elapsedDays);
  const behindWords = Math.max(0, expected - cursor);
  const behindDays = daily > 0 ? Math.ceil(behindWords / daily) : 0;

  return {
    hasAssignment: true, levelName, dailyWordCount: daily, startDate,
    elapsedDays, expected, cursor, baseCursor, total, behindWords, behindDays,
    assignmentId: assignment.id, todayIsStudyDay: isStudyDay(today, ctx),
  };
}

// 밀린 부분 상세: 아직 안 한 단어들을 '몇 번째 학습일(했어야 할 날짜)' 묶음으로
export async function behindDetail(studentId: number) {
  const s = await computeBehind(studentId);
  if (!s.hasAssignment || s.behindWords <= 0) return { summary: s, chunks: [] };

  const settings = await resolveSettings(studentId);
  const ctx = await loadScheduleContext(studentId, settings.studyDays);
  const assignment = await activeAssignmentFor(studentId);
  const where = assignment!.sourceType === "LEVEL"
    ? { levelId: assignment!.levelId! }
    : { wordbookId: assignment!.wordbookId! };
  const words = await db.word.findMany({
    where, orderBy: { id: "asc" }, skip: s.cursor, take: s.expected - s.cursor,
  });

  const daily = s.dailyWordCount;
  const chunks: { studyDay: number; dueDate: string; words: { no: number; text: string; meaning: string; emoji: string | null }[] }[] = [];
  for (let i = 0; i < words.length; i += daily) {
    const globalStart = s.cursor + i;
    const studyDay = Math.floor((globalStart - s.baseCursor) / daily) + 1; // 시작 지점 기준 몇 번째 학습일 분량인지
    const dueDate = nthStudyDate(s.startDate!, studyDay, ctx); // 그 학습일의 실제 날짜
    chunks.push({
      studyDay, dueDate,
      words: words.slice(i, i + daily).map((w, j) => ({
        no: globalStart + j + 1, // 레벨 내 단어 번호
        text: w.text, meaning: JSON.parse(w.meaningsJson)[0], emoji: w.emoji,
      })),
    });
  }
  return { summary: s, chunks };
}
