import { db } from "./db";
import { resolveSettings } from "./settings";

// 학생 관점의 교재 과정 — 배정된 교재, 오늘의 진도, 레슨별 진행 상태

export type LessonCard = {
  id: number; partOrder: number; area: string; order: number; name: string;
  isReview: boolean; bookLabel: string | null;
  wordCount: number; hasDialogue: boolean; hasPassage: boolean;
  roles: string[]; // 이 레슨에서 말해야 하는 역할들 (A, B, N)
  passedRoles: string[]; // 그중 통과한 역할
  wordPassed: boolean;
  done: boolean; // 필요한 역할을 모두 통과
};

// 학생에게 배정된 교재 (학생 지정 > 반 지정)
export async function assignedCourse(studentId: number) {
  const own = await db.courseAssignment.findUnique({ where: { studentId } });
  if (own) return own;
  const student = await db.user.findUnique({ where: { id: studentId }, select: { classId: true } });
  if (!student?.classId) return null;
  return db.courseAssignment.findUnique({ where: { classId: student.classId } });
}

export async function textbookHome(studentId: number) {
  const settings = await resolveSettings(studentId);
  const course = await assignedCourse(studentId);
  if (!course) {
    return { program: settings.program, courseTrack: settings.courseTrack, textbook: null, lessons: [], todayLessonId: null };
  }

  const textbook = await db.textbook.findUnique({
    where: { id: course.textbookId },
    include: {
      parts: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: [{ area: "asc" }, { order: "asc" }],
            include: {
              wordbook: { select: { id: true, words: { select: { advancedOnly: true } } } },
              dialogues: { select: { kind: true, lines: { select: { speaker: true } } } },
            },
          },
        },
      },
    },
  });
  if (!textbook) {
    return { program: settings.program, courseTrack: settings.courseTrack, textbook: null, lessons: [], todayLessonId: null };
  }

  const all = textbook.parts.flatMap((p) => p.lessons.map((l) => ({ ...l, partOrder: p.order })));
  const passedSessions = await db.speakSession.findMany({
    where: { studentId, lessonId: { in: all.map((l) => l.id) }, kind: "TEST", status: "PASSED" },
    select: { lessonId: true, role: true },
  });
  const passedByLesson = new Map<number, Set<string>>();
  for (const s of passedSessions) {
    if (!passedByLesson.has(s.lessonId)) passedByLesson.set(s.lessonId, new Set());
    passedByLesson.get(s.lessonId)!.add(s.role);
  }

  // 레슨 단어 시험 통과 여부 — 레슨 단어장 배정의 커서가 끝까지 갔는지로 판단
  const wordbookIds = all.map((l) => l.wordbookId).filter((x): x is number => !!x);
  const wordAssignments = wordbookIds.length
    ? await db.assignment.findMany({
        where: { studentId, sourceType: "WORDBOOK", wordbookId: { in: wordbookIds } },
        include: { progress: { where: { studentId }, select: { wordCursor: true } } },
      })
    : [];
  const cursorByWordbook = new Map(wordAssignments.map((a) => [a.wordbookId!, a.progress[0]?.wordCursor ?? 0]));

  const lessons: LessonCard[] = all.map((l) => {
    const words = l.wordbook?.words ?? [];
    // 기본반은 기본 단어만, 심화반은 전체
    const wordCount = settings.courseTrack === "ADVANCED" ? words.length : words.filter((w) => !w.advancedOnly).length;
    const speakers = new Set(l.dialogues.flatMap((d) => d.lines.map((x) => x.speaker)));
    const roles = ["A", "B", "N"].filter((r) => speakers.has(r));
    const passed = passedByLesson.get(l.id) ?? new Set<string>();
    const wordPassed = wordCount > 0 && (cursorByWordbook.get(l.wordbookId ?? -1) ?? 0) >= wordCount;
    return {
      id: l.id, partOrder: l.partOrder, area: l.area, order: l.order, name: l.name,
      isReview: l.isReview, bookLabel: l.bookLabel,
      wordCount,
      hasDialogue: l.dialogues.some((d) => d.kind === "DIALOGUE"),
      hasPassage: l.dialogues.some((d) => d.kind === "PASSAGE"),
      roles,
      passedRoles: [...passed],
      wordPassed,
      done: roles.length > 0 && roles.every((r) => passed.has(r)) && (wordCount === 0 || wordPassed),
    };
  });

  // 오늘의 진도: 선생님 지정이 최우선, 아니면 아직 끝내지 않은 첫 레슨
  const todayLessonId =
    course.mode === "MANUAL" && course.todayLessonId
      ? course.todayLessonId
      : lessons.find((l) => !l.done)?.id ?? null;

  return {
    program: settings.program,
    courseTrack: settings.courseTrack,
    textbook: { id: textbook.id, course: textbook.course, name: textbook.name },
    mode: course.mode,
    lessons,
    todayLessonId,
  };
}

// 레슨 하나의 학습 내용 (학생용)
export async function lessonForStudent(studentId: number, lessonId: number) {
  const settings = await resolveSettings(studentId);
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      part: { include: { textbook: true } },
      wordbook: { select: { id: true, name: true, words: { select: { id: true, advancedOnly: true } } } },
      dialogues: { orderBy: { order: "asc" }, include: { lines: { orderBy: { order: "asc" } } } },
    },
  });
  if (!lesson) return null;

  const passed = await db.speakSession.findMany({
    where: { studentId, lessonId, kind: "TEST", status: "PASSED" },
    select: { role: true },
    distinct: ["role"],
  });
  const words = lesson.wordbook?.words ?? [];
  const wordCount = settings.courseTrack === "ADVANCED" ? words.length : words.filter((w) => !w.advancedOnly).length;

  const shape = (kind: string) =>
    lesson.dialogues
      .filter((d) => d.kind === kind)
      .map((d) => ({
        id: d.id, order: d.order,
        lines: d.lines.map((l) => ({
          id: l.id, order: l.order, speaker: l.speaker,
          text: l.text, textKo: l.textKo, audioUrl: l.audioUrl,
        })),
      }));

  return {
    id: lesson.id,
    name: lesson.name,
    area: lesson.area,
    order: lesson.order,
    isReview: lesson.isReview,
    bookLabel: lesson.bookLabel,
    partOrder: lesson.part.order,
    textbookName: lesson.part.textbook.name,
    courseTrack: settings.courseTrack,
    matchRate: settings.speakMatchRate,
    passCount: settings.speakPassCount,
    wordbookId: lesson.wordbookId,
    wordCount,
    dialogues: shape("DIALOGUE"),
    passage: shape("PASSAGE")[0] ?? null,
    passedRoles: passed.map((p) => p.role),
  };
}

// 레슨 단어 학습 시작 — 레슨 단어장을 학생 개별 배정으로 걸어 기존 단어 엔진에 태운다.
// resetProgress=true (시험) 이면 커서를 0으로 되돌려 레슨 단어 전체를 다시 출제한다.
export async function startLessonWords(studentId: number, lessonId: number, resetProgress = false) {
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, select: { wordbookId: true } });
  if (!lesson?.wordbookId) throw new Error("이 레슨에는 단어가 없습니다.");

  // 학생 개별 배정은 하나만 활성 상태로 둔다 (다른 레슨 진도는 그대로 보존)
  await db.assignment.updateMany({ where: { studentId, active: true }, data: { active: false } });
  const existing = await db.assignment.findFirst({
    where: { studentId, sourceType: "WORDBOOK", wordbookId: lesson.wordbookId },
  });
  if (existing) {
    await db.assignment.update({ where: { id: existing.id }, data: { active: true } });
    if (resetProgress) {
      await db.studentProgress.updateMany({
        where: { studentId, assignmentId: existing.id },
        data: { wordCursor: 0, baseCursor: 0, startedAt: new Date() },
      });
    }
    return existing.id;
  }
  const created = await db.assignment.create({
    data: { studentId, sourceType: "WORDBOOK", wordbookId: lesson.wordbookId, active: true },
  });
  return created.id;
}
