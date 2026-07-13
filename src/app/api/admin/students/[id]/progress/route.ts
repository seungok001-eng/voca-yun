import { db } from "@/lib/db";
import { requireStaff, errorResponse } from "@/lib/auth";
import { activeAssignmentFor } from "@/lib/test-service";

// 학생 진도(시작 번호) 설정/바로잡기
// startNumber번 단어부터 학습 시작 → 밀림 계산도 오늘·이 지점부터 리셋
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireStaff();
    const { id } = await ctx.params;
    const studentId = Number(id);
    const { startNumber } = await req.json();

    const assignment = await activeAssignmentFor(studentId);
    if (!assignment) return Response.json({ error: "배정된 학습이 없습니다. 먼저 레벨/단어장을 배정하세요." }, { status: 400 });

    const where = assignment.sourceType === "LEVEL"
      ? { levelId: assignment.levelId! }
      : { wordbookId: assignment.wordbookId! };
    const total = await db.word.count({ where });

    const n = Number(startNumber);
    if (!Number.isInteger(n) || n < 1 || n > total) {
      return Response.json({ error: `1 ~ ${total} 사이의 번호를 입력하세요.` }, { status: 400 });
    }
    const cursor = n - 1;
    await db.studentProgress.upsert({
      where: { studentId_assignmentId: { studentId, assignmentId: assignment.id } },
      update: { wordCursor: cursor, baseCursor: cursor, startedAt: new Date() },
      create: { studentId, assignmentId: assignment.id, wordCursor: cursor, baseCursor: cursor },
    });
    return Response.json({ ok: true, startNumber: n, total });
  } catch (e) {
    return errorResponse(e);
  }
}
