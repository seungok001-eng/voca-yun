import { db } from "@/lib/db";
import { requireStudent, errorResponse } from "@/lib/auth";
import { activeAssignmentFor } from "@/lib/test-service";

// 레벨 지도: 20단계 + 현재 진행 상황
export async function GET() {
  try {
    const s = await requireStudent();
    const isIndividual = s.role === "INDIVIDUAL";
    const levels = await db.level.findMany({
      orderBy: { order: "asc" },
      include: { _count: { select: { words: true } } },
    });
    const assignment = await activeAssignmentFor(s.uid);
    let currentLevelId: number | null = null;
    let cursor = 0;
    if (assignment?.sourceType === "LEVEL" && assignment.levelId) {
      currentLevelId = assignment.levelId;
      const progress = await db.studentProgress.findUnique({
        where: { studentId_assignmentId: { studentId: s.uid, assignmentId: assignment.id } },
      });
      cursor = progress?.wordCursor ?? 0;
    }
    return Response.json({
      currentLevelId,
      cursor,
      isIndividual,
      levels: levels.map((l) => ({
        id: l.id, order: l.order, name: l.name, nameKo: l.nameKo,
        groupName: l.groupName, groupKo: l.groupKo, description: l.description,
        wordCount: l._count.words,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
