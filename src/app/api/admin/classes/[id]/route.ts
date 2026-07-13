import { db } from "@/lib/db";
import { requireStaff, accessibleClassIds, errorResponse, AuthError } from "@/lib/auth";

async function guard(sUid: { role: string; uid: number }, classId: number) {
  const ids = await accessibleClassIds(sUid as never);
  if (ids !== null && !ids.includes(classId)) throw new AuthError(403, "담당 반이 아닙니다.");
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff();
    const { id } = await ctx.params;
    const classId = Number(id);
    await guard(s, classId);
    const cls = await db.class.findUnique({
      where: { id: classId },
      include: {
        teacher: { select: { id: true, name: true } },
        setting: true,
        students: {
          include: { setting: true },
          orderBy: { name: "asc" },
        },
        assignments: { where: { active: true }, include: { level: true, wordbook: true } },
      },
    });
    if (!cls) return Response.json({ error: "반을 찾을 수 없습니다." }, { status: 404 });

    // 학생별 최근 시험 상태
    const studentIds = cls.students.map((st) => st.id);
    const lastSessions = await db.testSession.findMany({
      where: { studentId: { in: studentIds }, status: { in: ["PASSED", "FAILED"] } },
      orderBy: { finishedAt: "desc" },
      distinct: ["studentId"],
    });
    const lastByStudent = new Map(lastSessions.map((t) => [t.studentId, t]));

    return Response.json({
      id: cls.id,
      name: cls.name,
      teacher: cls.teacher,
      setting: cls.setting,
      assignment: cls.assignments[0]
        ? {
            id: cls.assignments[0].id,
            sourceType: cls.assignments[0].sourceType,
            levelId: cls.assignments[0].levelId,
            wordbookId: cls.assignments[0].wordbookId,
            name: cls.assignments[0].level?.nameKo ?? cls.assignments[0].wordbook?.name ?? "-",
          }
        : null,
      students: cls.students.map((st) => {
        const last = lastByStudent.get(st.id);
        return {
          id: st.id,
          username: st.username,
          name: st.name,
          points: st.points,
          streak: st.streak,
          parentPhone: st.parentPhone,
          hasOverride: !!st.setting && Object.entries(st.setting).some(([k, v]) => !["id", "userId"].includes(k) && v !== null),
          lastTest: last ? { id: last.id, status: last.status, kind: last.kind, attemptNo: last.attemptNo, finishedAt: last.finishedAt } : null,
        };
      }),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// 반 이름/담당/설정 수정
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff();
    const { id } = await ctx.params;
    const classId = Number(id);
    await guard(s, classId);
    const body = await req.json();
    if (body.name || body.teacherId !== undefined) {
      await db.class.update({
        where: { id: classId },
        data: { ...(body.name ? { name: body.name } : {}), ...(body.teacherId !== undefined ? { teacherId: body.teacherId } : {}) },
      });
    }
    if (body.setting) {
      const st = body.setting;
      const data = {
        testMode: st.testMode,
        dailyWordCount: st.dailyWordCount,
        failThreshold: st.failThreshold,
        retestScope: st.retestScope,
        posStrict: st.posStrict,
        pronEnabled: st.pronEnabled,
        pronThreshold: st.pronThreshold,
        reviewMixCount: st.reviewMixCount,
        ...(st.studyDays ? { studyDays: st.studyDays } : {}),
      };
      await db.classSetting.upsert({
        where: { classId },
        update: data,
        create: { classId, ...data },
      });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff();
    const { id } = await ctx.params;
    const classId = Number(id);
    await guard(s, classId);
    await db.user.updateMany({ where: { classId }, data: { classId: null } });
    await db.class.delete({ where: { id: classId } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
