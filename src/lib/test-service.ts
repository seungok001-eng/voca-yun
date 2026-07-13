import { db } from "./db";
import { shuffle } from "./grading";
import { resolveSettings } from "./settings";
import { nextDue, todayStr } from "./srs";
import { loadScheduleContext, countStudyDays } from "./schedule";

export type TestItem = { wordId: number; dir: "KO_TO_EN" | "EN_TO_KO" };

// 연속통과 뱃지: 3일 연속 통과부터 매 통과일 1개, 뱃지당 10P
export const BADGE_MIN_STREAK = 3;
export const BADGE_POINTS = 10;

export function buildItems(wordIds: number[], mode: string): TestItem[] {
  const shuffled = shuffle(wordIds);
  return shuffled.map((wordId) => ({
    wordId,
    dir:
      mode === "MIXED"
        ? Math.random() < 0.5
          ? "KO_TO_EN"
          : "EN_TO_KO"
        : (mode as TestItem["dir"]),
  }));
}

// 학생의 활성 배정 찾기 (학생 개별 배정 > 반 배정)
export async function activeAssignmentFor(studentId: number) {
  const student = await db.user.findUnique({ where: { id: studentId } });
  if (!student) return null;
  const own = await db.assignment.findFirst({
    where: { studentId, active: true },
    orderBy: { createdAt: "desc" },
  });
  if (own) return own;
  if (!student.classId) return null;
  return db.assignment.findFirst({
    where: { classId: student.classId, active: true },
    orderBy: { createdAt: "desc" },
  });
}

// 오늘의 단어: 진도 커서부터 dailyWordCount개
export async function todayWords(studentId: number) {
  const assignment = await activeAssignmentFor(studentId);
  if (!assignment) return { assignment: null, words: [], cursor: 0, total: 0, progress: null };
  const settings = await resolveSettings(studentId);
  const where =
    assignment.sourceType === "LEVEL"
      ? { levelId: assignment.levelId! }
      : { wordbookId: assignment.wordbookId! };
  const total = await db.word.count({ where });
  let progress = await db.studentProgress.findUnique({
    where: { studentId_assignmentId: { studentId, assignmentId: assignment.id } },
  });
  if (!progress) {
    progress = await db.studentProgress.create({
      data: { studentId, assignmentId: assignment.id },
    });
  }
  const words = await db.word.findMany({
    where,
    orderBy: { id: "asc" },
    skip: progress.wordCursor,
    take: settings.dailyWordCount,
  });
  return { assignment, words, cursor: progress.wordCursor, total, settings, progress };
}

// 시험 세션 생성
export async function startSession(opts: {
  studentId: number;
  kind: "DAILY" | "RETEST" | "WRONG_NOTE" | "REVIEW";
  retestOf?: number;
}) {
  const { studentId, kind } = opts;
  const settings = await resolveSettings(studentId);

  // 진행 중 세션이 있으면 이어서
  const existing = await db.testSession.findFirst({
    where: { studentId, status: "IN_PROGRESS" },
  });
  if (existing) return existing;

  let wordIds: number[] = [];
  let assignmentId: number | null = null;
  let attemptNo = 1;
  let parentSessionId: number | null = null;
  let advanceCount = 0;

  if (kind === "DAILY") {
    const today = await todayWords(studentId);
    if (!today.assignment || today.words.length === 0) {
      throw new Error("배정된 학습이 없거나 모든 단어를 끝냈습니다.");
    }
    // 진도 상한: 밀린 분량 + 오늘 분량 + 다음 1회 분량까지만 (쉬는 날에도 동일하게 허용)
    // 기준점은 학생별 시작 지점(선생님이 재설정 가능)
    const ctx = await loadScheduleContext(studentId, settings.studyDays);
    const baseCursor = today.progress?.baseCursor ?? 0;
    const startDate = todayStr(today.progress?.startedAt ?? today.assignment.createdAt);
    const expectedThroughToday = baseCursor + settings.dailyWordCount * countStudyDays(startDate, todayStr(), ctx);
    if (today.cursor >= expectedThroughToday + settings.dailyWordCount) {
      throw new Error("여기까지 미리 다 끝냈어요! 🎉 다음 학습일에 이어서 할 수 있어요.");
    }
    assignmentId = today.assignment.id;
    wordIds = today.words.map((w) => w.id);
    advanceCount = wordIds.length;
    // 누적 복습 섞기: 복습 기한이 된 단어를 추가 출제
    if (settings.reviewMixCount > 0) {
      const due = await db.reviewItem.findMany({
        where: { studentId, dueAt: { lte: new Date() }, stage: { lt: 3 }, wordId: { notIn: wordIds } },
        take: settings.reviewMixCount,
        orderBy: { dueAt: "asc" },
      });
      wordIds = [...wordIds, ...due.map((r) => r.wordId)];
    }
  } else if (kind === "RETEST") {
    const parent = await db.testSession.findUnique({
      where: { id: opts.retestOf! },
      include: { answers: true },
    });
    if (!parent || parent.studentId !== studentId || parent.status !== "FAILED") {
      throw new Error("재시험 대상을 찾을 수 없습니다.");
    }
    parentSessionId = parent.id;
    assignmentId = parent.assignmentId;
    attemptNo = parent.attemptNo + 1;
    advanceCount = parent.advanceCount;
    const allIds = (JSON.parse(parent.itemsJson) as TestItem[]).map((i) => i.wordId);
    if (settings.retestScope === "WRONG_ONLY") {
      const wrongIds = parent.answers.filter((a) => !a.correct).map((a) => a.wordId);
      const answeredIds = new Set(parent.answers.map((a) => a.wordId));
      const unanswered = allIds.filter((id) => !answeredIds.has(id));
      wordIds = [...new Set([...wrongIds, ...unanswered])];
      advanceCount = 0; // 틀린 것만 재시험 통과 시에도 원래 세트 통과로 인정
      // 재시험이 여러 번 이어져도 진도 인정은 최초(루트) 세션 기준으로 연결
      let rootId = parent.id;
      let rootAdvance = parent.advanceCount;
      let rootParent = parent.parentSessionId;
      while (rootAdvance === 0 && rootParent) {
        const p = await db.testSession.findUnique({
          where: { id: rootParent },
          select: { id: true, advanceCount: true, parentSessionId: true },
        });
        if (!p) break;
        rootId = p.id;
        rootAdvance = p.advanceCount;
        rootParent = p.parentSessionId;
      }
      parentSessionId = rootId;
    } else {
      wordIds = allIds; // 전체 재시험 (순서는 아래에서 다시 랜덤)
    }
  } else if (kind === "WRONG_NOTE") {
    const notes = await db.wrongNote.findMany({
      where: { studentId, resolved: false },
      orderBy: { lastWrongAt: "desc" },
      take: 50,
    });
    if (notes.length === 0) throw new Error("오답노트에 단어가 없습니다.");
    wordIds = notes.map((n) => n.wordId);
  } else if (kind === "REVIEW") {
    const due = await db.reviewItem.findMany({
      where: { studentId, dueAt: { lte: new Date() }, stage: { lt: 3 } },
      take: 50,
      orderBy: { dueAt: "asc" },
    });
    if (due.length === 0) throw new Error("복습할 단어가 없습니다.");
    wordIds = due.map((r) => r.wordId);
  }

  const items = buildItems(wordIds, settings.testMode);
  return db.testSession.create({
    data: {
      studentId,
      assignmentId,
      kind,
      mode: settings.testMode,
      itemsJson: JSON.stringify(items),
      failThreshold: settings.failThreshold,
      posStrict: settings.posStrict,
      pronEnabled: settings.pronEnabled,
      pronThreshold: settings.pronThreshold,
      retestScope: settings.retestScope,
      attemptNo,
      parentSessionId,
      advanceCount,
    },
  });
}

// 한 문항의 최종 결과 반영: 오답 처리 → 진행 → 탈락/완료 판정
// session 객체를 넘겨받아 재조회를 없애고, 독립적인 쓰기는 병렬로 실행해 DB 왕복을 최소화.
type FinalizeSessionInput = {
  id: number; itemsJson: string; wrongCount: number; currentIndex: number;
  failThreshold: number; studentId: number;
};
export async function finalizeItem(session: FinalizeSessionInput, wordId: number, correct: boolean) {
  const items = JSON.parse(session.itemsJson) as TestItem[];
  const wrongCount = session.wrongCount + (correct ? 0 : 1);
  const nextIndex = session.currentIndex + 1;

  const writes: Promise<unknown>[] = [
    db.testSession.update({ where: { id: session.id }, data: { wrongCount, currentIndex: nextIndex } }),
  ];
  if (!correct) {
    // 오답노트 기록 + SRS 강등 — 세션 업데이트와 병렬
    writes.push(
      db.wrongNote.upsert({
        where: { studentId_wordId: { studentId: session.studentId, wordId } },
        update: { wrongCount: { increment: 1 }, lastWrongAt: new Date(), resolved: false },
        create: { studentId: session.studentId, wordId },
      }),
      db.reviewItem.updateMany({
        where: { studentId: session.studentId, wordId },
        data: { stage: 0, dueAt: nextDue(0) },
      })
    );
  }
  await Promise.all(writes);

  if (wrongCount >= session.failThreshold) {
    await finalizeSession(session.id, "FAILED");
    return { finished: true, status: "FAILED" as const };
  }
  if (nextIndex >= items.length) {
    await finalizeSession(session.id, "PASSED");
    return { finished: true, status: "PASSED" as const };
  }
  return { finished: false, status: "IN_PROGRESS" as const };
}

// 세션 종료 처리 (통과/탈락 부수효과)
export async function finalizeSession(sessionId: number, status: "PASSED" | "FAILED") {
  const session = await db.testSession.update({
    where: { id: sessionId },
    data: { status, finishedAt: new Date() },
    include: { student: true, answers: true },
  });
  const items = JSON.parse(session.itemsJson) as TestItem[];
  const student = session.student;

  if (status === "PASSED") {
    // 포인트 & 스트릭
    const correctCount = session.answers.filter((a) => a.correct).length;
    const bonus = 20 + Math.max(0, 10 - (session.attemptNo - 1) * 5);
    const earned = correctCount * 2 + bonus;
    const today = todayStr();
    let streak = student.streak;
    if (student.lastPassDate !== today) {
      // 쉬는 날(비학습 요일·휴무·공휴일)은 스트릭이 끊기지 않도록 직전 '학습일'과 비교
      const { resolveSettings } = await import("./settings");
      const { loadScheduleContext, prevStudyDay } = await import("./schedule");
      const settings = await resolveSettings(student.id);
      const ctx = await loadScheduleContext(student.id, settings.studyDays);
      const prev = prevStudyDay(today, ctx);
      streak = student.lastPassDate && student.lastPassDate >= prev ? streak + 1 : 1;
    }
    await Promise.all([
      db.user.update({
        where: { id: student.id },
        data: {
          points: { increment: earned },
          streak,
          bestStreak: Math.max(student.bestStreak, streak),
          lastPassDate: today,
        },
      }),
      // 월별 랭킹 집계용 적립 기록
      db.pointLog.create({ data: { studentId: student.id, points: earned } }),
    ]);

    // 연속통과 뱃지: 진도 시험(일일/재시험) 통과 + 스트릭 3일 이상 → 하루 1개 지급 (+10P)
    if ((session.kind === "DAILY" || session.kind === "RETEST") && streak >= BADGE_MIN_STREAK) {
      const created = await db.badgeLog.createMany({
        data: [{ studentId: student.id, date: today, streak, points: BADGE_POINTS }],
        skipDuplicates: true, // 같은 날 중복 지급 방지
      });
      if (created.count > 0) {
        await Promise.all([
          db.user.update({ where: { id: student.id }, data: { points: { increment: BADGE_POINTS } } }),
          db.pointLog.create({ data: { studentId: student.id, points: BADGE_POINTS } }),
        ]);
      }
    }

    if ((session.kind === "DAILY" || session.kind === "RETEST") && session.assignmentId && session.advanceCount > 0) {
      // 진도 전진
      await db.studentProgress.upsert({
        where: { studentId_assignmentId: { studentId: student.id, assignmentId: session.assignmentId } },
        update: { wordCursor: { increment: session.advanceCount } },
        create: { studentId: student.id, assignmentId: session.assignmentId, wordCursor: session.advanceCount },
      });
    }
    if (session.kind === "RETEST" && session.retestScope === "WRONG_ONLY" && session.parentSessionId) {
      // 틀린 것만 재시험 통과 → 원래 일일시험 진도 인정
      const parent = await db.testSession.findUnique({ where: { id: session.parentSessionId } });
      if (parent?.assignmentId && parent.advanceCount > 0) {
        await db.studentProgress.upsert({
          where: { studentId_assignmentId: { studentId: student.id, assignmentId: parent.assignmentId } },
          update: { wordCursor: { increment: parent.advanceCount } },
          create: { studentId: student.id, assignmentId: parent.assignmentId, wordCursor: parent.advanceCount },
        });
      }
    }

    // SRS 스케줄: 통과한 단어 복습 큐 등록/승급 (배치로 왕복 최소화)
    const wordIds = items.map((i) => i.wordId);
    const existingReviews = await db.reviewItem.findMany({
      where: { studentId: student.id, wordId: { in: wordIds } },
    });
    const existingWordIds = new Set(existingReviews.map((r) => r.wordId));
    const srsWrites: Promise<unknown>[] = [];
    // 복습시험 통과 → 기존 항목 단계 승급
    if (session.kind === "REVIEW") {
      for (const r of existingReviews) {
        srsWrites.push(
          db.reviewItem.update({ where: { id: r.id }, data: { stage: r.stage + 1, dueAt: nextDue(r.stage + 1) } })
        );
      }
    }
    // 새 단어 → 복습 큐 신규 등록 (한 번에)
    const missing = wordIds.filter((id) => !existingWordIds.has(id));
    if (missing.length > 0) {
      srsWrites.push(
        db.reviewItem.createMany({
          data: missing.map((wordId) => ({ studentId: student.id, wordId, stage: 0, dueAt: nextDue(0) })),
          skipDuplicates: true,
        })
      );
    }
    if (srsWrites.length > 0) await Promise.all(srsWrites);

    if (session.kind === "WRONG_NOTE") {
      // 오답노트 시험 통과 → 맞힌 단어 해결 처리
      const correctIds = session.answers.filter((a) => a.correct).map((a) => a.wordId);
      await db.wrongNote.updateMany({
        where: { studentId: student.id, wordId: { in: correctIds } },
        data: { resolved: true },
      });
    }
  }

  // 학부모 알림 로그 (알림톡/SMS 연동 지점)
  const kindKo = { DAILY: "단어시험", RETEST: `재시험(${session.attemptNo}차)`, WRONG_NOTE: "오답노트 시험", REVIEW: "복습시험" }[session.kind] || "시험";
  const message =
    status === "PASSED"
      ? `[정철어학원 청당국제캠퍼스] ${student.name} 학생이 오늘의 ${kindKo}에 통과했습니다. (오답 ${session.wrongCount}개)`
      : `[정철어학원 청당국제캠퍼스] ${student.name} 학생이 ${kindKo}에서 탈락했습니다. (오답 ${session.wrongCount}개, 재시험 예정)`;
  await db.notificationLog.create({
    data: { studentId: student.id, type: status === "PASSED" ? "TEST_PASS" : "TEST_FAIL", message },
  });
  if (status === "FAILED" && session.attemptNo >= 3) {
    await db.notificationLog.create({
      data: {
        studentId: student.id,
        type: "REPEAT_FAIL",
        message: `[정철어학원 청당국제캠퍼스] ${student.name} 학생이 ${session.attemptNo}회 연속 탈락했습니다. 지도가 필요합니다.`,
      },
    });
  }

  return session;
}
