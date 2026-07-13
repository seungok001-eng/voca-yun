import { db } from "@/lib/db";
import { requireStudent, errorResponse } from "@/lib/auth";
import { todayWords } from "@/lib/test-service";
import { resolveSettings } from "@/lib/settings";
import { loadScheduleContext, isStudyDay } from "@/lib/schedule";
import { todayStr } from "@/lib/srs";

export async function GET() {
  try {
    const s = await requireStudent();
    const [user, today, settings, dueReviews, wrongNotes, activeSession, lastSession] = await Promise.all([
      db.user.findUnique({ where: { id: s.uid }, include: { class: true } }),
      todayWords(s.uid),
      resolveSettings(s.uid),
      db.reviewItem.count({ where: { studentId: s.uid, dueAt: { lte: new Date() }, stage: { lt: 3 } } }),
      db.wrongNote.count({ where: { studentId: s.uid, resolved: false } }),
      db.testSession.findFirst({ where: { studentId: s.uid, status: "IN_PROGRESS" } }),
      db.testSession.findFirst({
        where: { studentId: s.uid, status: { in: ["PASSED", "FAILED"] } },
        orderBy: { finishedAt: "desc" },
      }),
    ]);

    // 레벨 지도용: 현재 배정 정보
    let assignmentInfo = null;
    if (today.assignment) {
      if (today.assignment.sourceType === "LEVEL" && today.assignment.levelId) {
        const level = await db.level.findUnique({ where: { id: today.assignment.levelId } });
        assignmentInfo = { type: "LEVEL", name: level?.nameKo, group: level?.groupKo, order: level?.order };
      } else if (today.assignment.wordbookId) {
        const wb = await db.wordbook.findUnique({ where: { id: today.assignment.wordbookId } });
        assignmentInfo = { type: "WORDBOOK", name: wb?.name };
      }
    }

    return Response.json({
      name: user?.name,
      className: user?.class?.name ?? null,
      points: user?.points ?? 0,
      streak: user?.streak ?? 0,
      bestStreak: user?.bestStreak ?? 0,
      todayCount: today.words.length,
      todayWords: today.words.map((w) => ({
        id: w.id, text: w.text, pos: w.pos, meanings: JSON.parse(w.meaningsJson),
        example: w.example, exampleKo: w.exampleKo, emoji: w.emoji,
      })),
      cursor: today.cursor,
      total: today.total,
      assignment: assignmentInfo,
      isIndividual: s.role === "INDIVIDUAL",
      todayIsStudyDay: isStudyDay(todayStr(), await loadScheduleContext(s.uid, settings.studyDays)),
      settings,
      dueReviews,
      wrongNotes,
      activeSessionId: activeSession?.id ?? null,
      lastSession: lastSession
        ? { id: lastSession.id, status: lastSession.status, kind: lastSession.kind, attemptNo: lastSession.attemptNo }
        : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
