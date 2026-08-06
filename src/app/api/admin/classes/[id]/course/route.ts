import { db } from "@/lib/db";
import { requireStaff, accessibleClassIds, errorResponse, AuthError } from "@/lib/auth";

async function guard(s: Awaited<ReturnType<typeof requireStaff>>, classId: number) {
  const ids = await accessibleClassIds(s);
  if (ids !== null && !ids.includes(classId)) throw new AuthError(403, "담당 반이 아닙니다.");
}

// 반의 교재 배정 + 오늘의 진도 조회
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff();
    const classId = Number((await ctx.params).id);
    await guard(s, classId);

    const [course, textbooks] = await Promise.all([
      db.courseAssignment.findUnique({
        where: { classId },
        include: {
          textbook: {
            include: {
              parts: {
                orderBy: { order: "asc" },
                include: {
                  lessons: {
                    orderBy: [{ area: "asc" }, { order: "asc" }],
                    include: { dialogues: { include: { lines: { select: { speaker: true } } } } },
                  },
                },
              },
            },
          },
        },
      }),
      db.textbook.findMany({ orderBy: [{ course: "asc" }, { order: "asc" }], select: { id: true, course: true, name: true } }),
    ]);

    // 레슨별 문장 수 (설정 화면에서 통과 기준을 정할 때 참고)
    const lessons = course?.textbook.parts.flatMap((p) =>
      p.lessons.map((l) => {
        const lines = l.dialogues.flatMap((d) => d.lines);
        return {
          id: l.id, partOrder: p.order, area: l.area, order: l.order, name: l.name,
          isReview: l.isReview,
          a: lines.filter((x) => x.speaker === "A").length,
          b: lines.filter((x) => x.speaker === "B").length,
          n: lines.filter((x) => x.speaker === "N").length,
        };
      })
    ) ?? [];

    return Response.json({
      textbooks,
      course: course
        ? { textbookId: course.textbookId, textbookName: course.textbook.name, mode: course.mode, todayLessonId: course.todayLessonId }
        : null,
      lessons,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// 교재 배정 / 진도 모드 / 오늘의 레슨 설정
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff();
    const classId = Number((await ctx.params).id);
    await guard(s, classId);
    const b = await req.json();

    if (b.textbookId === null) {
      await db.courseAssignment.deleteMany({ where: { classId } });
      return Response.json({ ok: true, cleared: true });
    }
    const textbookId = Number(b.textbookId);
    if (!textbookId) return Response.json({ error: "교재를 선택하세요." }, { status: 400 });
    const mode = b.mode === "MANUAL" ? "MANUAL" : "AUTO";
    const todayLessonId = mode === "MANUAL" && b.todayLessonId ? Number(b.todayLessonId) : null;

    // 지정한 레슨이 그 교재의 레슨인지 확인
    if (todayLessonId) {
      const lesson = await db.lesson.findUnique({ where: { id: todayLessonId }, include: { part: true } });
      if (!lesson || lesson.part.textbookId !== textbookId) {
        return Response.json({ error: "선택한 교재의 레슨이 아닙니다." }, { status: 400 });
      }
    }

    await db.courseAssignment.upsert({
      where: { classId },
      update: { textbookId, mode, todayLessonId },
      create: { classId, textbookId, mode, todayLessonId },
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
