import { db } from "@/lib/db";
import { requireSession, errorResponse, AuthError } from "@/lib/auth";

// 개인 학습자가 스스로 레벨을 선택 (개인 전용). 기존 자기 배정은 비활성화하고 새 레벨로.
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    if (s.role !== "INDIVIDUAL") throw new AuthError(403, "개인 학습자만 레벨을 직접 선택할 수 있습니다.");
    const { levelId, startNumber } = await req.json();
    const level = await db.level.findUnique({ where: { id: Number(levelId) } });
    if (!level) return Response.json({ error: "레벨을 찾을 수 없습니다." }, { status: 400 });

    const total = await db.word.count({ where: { levelId: level.id } });
    const n = startNumber ? Number(startNumber) : 1;
    if (!Number.isInteger(n) || n < 1 || n > total) {
      return Response.json({ error: `시작 번호는 1 ~ ${total} 사이여야 합니다.` }, { status: 400 });
    }
    const cursor = n - 1;

    // 이미 이 레벨로 배정돼 있으면 유지하되, 시작 번호를 지정했으면 진도 재설정
    const already = await db.assignment.findFirst({
      where: { studentId: s.uid, active: true, sourceType: "LEVEL", levelId: level.id },
    });
    const assignment = already ?? (await (async () => {
      await db.assignment.updateMany({ where: { studentId: s.uid }, data: { active: false } });
      return db.assignment.create({ data: { studentId: s.uid, sourceType: "LEVEL", levelId: level.id } });
    })());

    if (startNumber || !already) {
      await db.studentProgress.upsert({
        where: { studentId_assignmentId: { studentId: s.uid, assignmentId: assignment.id } },
        update: { wordCursor: cursor, baseCursor: cursor, startedAt: new Date() },
        create: { studentId: s.uid, assignmentId: assignment.id, wordCursor: cursor, baseCursor: cursor },
      });
    }
    return Response.json({ ok: true, assignmentId: assignment.id });
  } catch (e) {
    return errorResponse(e);
  }
}
