import { db } from "./db";
import { resolveSettings } from "./settings";
import { todayStr } from "./srs";
import { gradeSpeech, parseAlts, type SpeakResult } from "./speak-grading";

// 말하기 학습 서비스
// - 공부 모드: 세션 없이 문장 단위로 즉시 채점 (gradeLine)
// - 시험 모드: 역할(A/B, 본문은 N)별 세션. 레슨에 있는 역할을 모두 통과해야 레슨 통과.

export const SPEAK_BADGE_MIN_STREAK = 3;
export const SPEAK_BADGE_POINTS = 10;

export type LessonLine = {
  id: number; order: number; speaker: string;
  text: string; textKo: string | null; audioUrl: string | null;
};
export type LessonDialogue = { id: number; order: number; lines: LessonLine[] };

// 레슨 전체 (공부 모드용) — 대화와 각 줄
export async function getLessonContent(lessonId: number) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      part: { include: { textbook: true } },
      wordbook: { select: { id: true, name: true } },
      dialogues: { orderBy: { order: "asc" }, include: { lines: { orderBy: { order: "asc" } } } },
    },
  });
  if (!lesson) return null;
  return lesson;
}

// 한 줄 즉시 채점 (공부 모드). 세션·기록 없이 피드백만 돌려준다.
export async function gradeLine(studentId: number, lineId: number, recognized: string): Promise<SpeakResult & { text: string }> {
  const line = await db.dialogueLine.findUnique({ where: { id: lineId } });
  if (!line) throw new Error("문장을 찾을 수 없습니다.");
  const settings = await resolveSettings(studentId);
  const result = gradeSpeech(recognized, parseAlts(line.text, line.altsJson), settings.speakMatchRate);
  return { ...result, text: line.text };
}

// 역할별로 학생이 말해야 할 줄 (대화 순서 → 줄 순서)
function linesForRole(
  dialogues: { order: number; lines: { id: number; order: number; speaker: string }[] }[],
  role: string
): number[] {
  return dialogues
    .flatMap((d) => d.lines.filter((l) => l.speaker === role).map((l) => ({ d: d.order, o: l.order, id: l.id })))
    .sort((a, b) => a.d - b.d || a.o - b.o)
    .map((x) => x.id);
}

// 시험 시작 — 이미 진행 중인 세션이 있으면 그것을 이어서 쓴다.
export async function startSpeakTest(studentId: number, lessonId: number, role: "A" | "B" | "N") {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { dialogues: { orderBy: { order: "asc" }, include: { lines: { orderBy: { order: "asc" } } } } },
  });
  if (!lesson) throw new Error("레슨을 찾을 수 없습니다.");

  const existing = await db.speakSession.findFirst({
    where: { studentId, lessonId, role, kind: "TEST", status: "IN_PROGRESS" },
  });
  if (existing) return existing;

  const ids = linesForRole(lesson.dialogues, role);
  if (ids.length === 0) throw new Error(role === "N" ? "읽을 본문이 없습니다." : `${role} 역할로 말할 문장이 없습니다.`);

  const settings = await resolveSettings(studentId);
  // 통과 문장 수: 설정값(0이면 전체). 레슨 문장 수보다 크면 전체로 맞춘다.
  const required = settings.speakPassCount > 0 ? Math.min(settings.speakPassCount, ids.length) : ids.length;

  return db.speakSession.create({
    data: {
      studentId, lessonId, role, kind: "TEST",
      itemsJson: JSON.stringify(ids),
      totalCount: ids.length,
      matchRate: settings.speakMatchRate,
      requiredCount: required,
    },
  });
}

// 시험 답변 제출 → 채점 + 진행/종료 판정
export async function submitSpeakAnswer(sessionId: number, studentId: number, recognized: string) {
  const session = await db.speakSession.findUnique({ where: { id: sessionId } });
  if (!session || session.studentId !== studentId) throw new Error("세션을 찾을 수 없습니다.");
  if (session.status !== "IN_PROGRESS") throw new Error("이미 끝난 시험입니다.");

  const ids = JSON.parse(session.itemsJson) as number[];
  const lineId = ids[session.currentIndex];
  const line = await db.dialogueLine.findUnique({ where: { id: lineId } });
  if (!line) throw new Error("문장을 찾을 수 없습니다.");

  const result = gradeSpeech(recognized, parseAlts(line.text, line.altsJson), session.matchRate);
  await db.speakAnswer.create({
    data: {
      sessionId, lineId, recognized,
      score: result.score, passed: result.passed,
      missedJson: result.missed.length ? JSON.stringify(result.missed) : null,
    },
  });

  const passedCount = session.passedCount + (result.passed ? 1 : 0);
  const nextIndex = session.currentIndex + 1;
  const remaining = ids.length - nextIndex;

  // 남은 문장을 다 맞혀도 기준에 못 미치면 그 시점에 탈락 확정
  const canStillPass = passedCount + remaining >= session.requiredCount;
  let status: "IN_PROGRESS" | "PASSED" | "FAILED" = "IN_PROGRESS";
  if (passedCount >= session.requiredCount) status = "PASSED";
  else if (!canStillPass || nextIndex >= ids.length) status = "FAILED";

  await db.speakSession.update({
    where: { id: sessionId },
    data: { currentIndex: nextIndex, passedCount, ...(status !== "IN_PROGRESS" ? { status, finishedAt: new Date() } : {}) },
  });

  let lessonPassed = false;
  if (status === "PASSED") lessonPassed = await onSessionPassed(studentId, session.lessonId, passedCount);

  return {
    ...result,
    correctText: line.text,
    index: nextIndex,
    total: ids.length,
    passedCount,
    requiredCount: session.requiredCount,
    status,
    lessonPassed,
  };
}

// 세션 통과 부수효과: 포인트 적립 + (A·B 모두 통과 시) 스트릭·뱃지
async function onSessionPassed(studentId: number, lessonId: number, passedCount: number): Promise<boolean> {
  const earned = passedCount * 3 + 15; // 문장당 3P + 통과 보너스
  await Promise.all([
    db.user.update({ where: { id: studentId }, data: { points: { increment: earned } } }),
    db.pointLog.create({ data: { studentId, points: earned } }),
  ]);

  // 두 역할 모두 통과했는지 확인 (레슨 완료)
  const passedRoles = await db.speakSession.findMany({
    where: { studentId, lessonId, kind: "TEST", status: "PASSED" },
    select: { role: true },
    distinct: ["role"],
  });
  const roles = new Set(passedRoles.map((r) => r.role));
  // 해당 레슨에 실제로 존재하는 역할만 요구 (2줄 대화만 있으면 A·B 모두 존재)
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { dialogues: { include: { lines: { select: { speaker: true } } } } },
  });
  const needed = new Set(lesson?.dialogues.flatMap((d) => d.lines.map((l) => l.speaker)) ?? []);
  const complete = [...needed].every((r) => roles.has(r));
  if (!complete) return false;

  await awardStreakAndBadge(studentId);
  return true;
}

// 레슨 완료일에 스트릭·뱃지 지급 (단어 시험과 같은 규칙)
async function awardStreakAndBadge(studentId: number) {
  const student = await db.user.findUnique({ where: { id: studentId } });
  if (!student) return;
  const today = todayStr();
  let streak = student.streak;
  if (student.lastPassDate !== today) {
    const settings = await resolveSettings(studentId);
    const { loadScheduleContext, prevStudyDay } = await import("./schedule");
    const ctx = await loadScheduleContext(studentId, settings.studyDays);
    const prev = prevStudyDay(today, ctx);
    streak = student.lastPassDate && student.lastPassDate >= prev ? streak + 1 : 1;
    await db.user.update({
      where: { id: studentId },
      data: { streak, bestStreak: Math.max(student.bestStreak, streak), lastPassDate: today },
    });
  }
  if (streak >= SPEAK_BADGE_MIN_STREAK) {
    const created = await db.badgeLog.createMany({
      data: [{ studentId, date: today, streak, points: SPEAK_BADGE_POINTS }],
      skipDuplicates: true,
    });
    if (created.count > 0) {
      await Promise.all([
        db.user.update({ where: { id: studentId }, data: { points: { increment: SPEAK_BADGE_POINTS } } }),
        db.pointLog.create({ data: { studentId, points: SPEAK_BADGE_POINTS } }),
      ]);
    }
  }
}

// 학생의 레슨별 진행 상태 (역할별 통과 여부)
export async function lessonProgress(studentId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return new Map<number, { A: boolean; B: boolean }>();
  const rows = await db.speakSession.findMany({
    where: { studentId, lessonId: { in: lessonIds }, kind: "TEST", status: "PASSED" },
    select: { lessonId: true, role: true },
  });
  const map = new Map<number, { A: boolean; B: boolean }>();
  for (const id of lessonIds) map.set(id, { A: false, B: false });
  for (const r of rows) {
    const cur = map.get(r.lessonId);
    if (cur) { if (r.role === "A") cur.A = true; else cur.B = true; }
  }
  return map;
}
