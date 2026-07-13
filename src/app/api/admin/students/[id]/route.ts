import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireStaff, errorResponse } from "@/lib/auth";
import { resolveSettings } from "@/lib/settings";

// 학생 상세 (설정, 최근 시험, 오답노트, 통계)
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireStaff();
    const { id } = await ctx.params;
    const studentId = Number(id);
    const student = await db.user.findUnique({
      where: { id: studentId },
      include: { class: true, setting: true },
    });
    if (!student || student.role !== "STUDENT") {
      return Response.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
    }
    const [sessions, wrongNotes, resolved, answerStats] = await Promise.all([
      db.testSession.findMany({
        where: { studentId, status: { in: ["PASSED", "FAILED"] } },
        orderBy: { finishedAt: "desc" },
        take: 30,
        include: { _count: { select: { answers: true } } },
      }),
      db.wrongNote.findMany({
        where: { studentId, resolved: false },
        include: { word: true },
        orderBy: { wrongCount: "desc" },
        take: 100,
      }),
      db.wrongNote.count({ where: { studentId, resolved: true } }),
      db.testAnswer.groupBy({
        by: ["correct"],
        where: { session: { studentId } },
        _count: true,
      }),
    ]);
    const correctCnt = answerStats.find((a) => a.correct)?._count ?? 0;
    const wrongCnt = answerStats.find((a) => !a.correct)?._count ?? 0;

    return Response.json({
      id: student.id,
      username: student.username,
      name: student.name,
      className: student.class?.name ?? null,
      classId: student.classId,
      parentPhone: student.parentPhone,
      school: student.school,
      grade: student.grade,
      plainPassword: student.plainPassword,
      birthdate: student.birthdate,
      points: student.points,
      streak: student.streak,
      bestStreak: student.bestStreak,
      overrides: student.setting,
      effective: await resolveSettings(studentId),
      accuracy: correctCnt + wrongCnt > 0 ? Math.round((correctCnt / (correctCnt + wrongCnt)) * 100) : null,
      sessions: sessions.map((t) => ({
        id: t.id, kind: t.kind, mode: t.mode, status: t.status, attemptNo: t.attemptNo,
        wrongCount: t.wrongCount, cheatCount: t.cheatCount, answered: t._count.answers,
        finishedAt: t.finishedAt,
      })),
      wrongNotes: wrongNotes.map((n) => ({
        word: n.word.text, pos: n.word.pos, meanings: JSON.parse(n.word.meaningsJson),
        wrongCount: n.wrongCount, lastWrongAt: n.lastWrongAt,
      })),
      resolvedWrongCount: resolved,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// 학생 정보/개별 설정 수정
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireStaff();
    const { id } = await ctx.params;
    const studentId = Number(id);
    const body = await req.json();

    const data: Record<string, unknown> = {};
    if (body.name) data.name = body.name;
    if (body.classId !== undefined) data.classId = body.classId ? Number(body.classId) : null;
    if (body.parentPhone !== undefined) data.parentPhone = body.parentPhone;
    if (body.school !== undefined) data.school = body.school || null;
    if (body.grade !== undefined) data.grade = body.grade || null;
    if (body.password) {
      data.passwordHash = await bcrypt.hash(String(body.password), 10);
      data.plainPassword = String(body.password); // 교직원 확인용 사본
    }
    if (Object.keys(data).length > 0) {
      await db.user.update({ where: { id: studentId }, data });
    }

    if (body.overrides !== undefined) {
      const o = body.overrides;
      if (o === null) {
        await db.studentSetting.deleteMany({ where: { userId: studentId } });
      } else {
        const fields = {
          testMode: o.testMode ?? null,
          dailyWordCount: o.dailyWordCount ?? null,
          failThreshold: o.failThreshold ?? null,
          retestScope: o.retestScope ?? null,
          posStrict: o.posStrict ?? null,
          pronEnabled: o.pronEnabled ?? null,
          pronThreshold: o.pronThreshold ?? null,
          reviewMixCount: o.reviewMixCount ?? null,
          studyDays: o.studyDays ?? null,
        };
        await db.studentSetting.upsert({
          where: { userId: studentId },
          update: fields,
          create: { userId: studentId, ...fields },
        });
      }
    }
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireStaff();
    const { id } = await ctx.params;
    await db.user.delete({ where: { id: Number(id) } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
