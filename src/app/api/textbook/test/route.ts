import { requireStudent, errorResponse } from "@/lib/auth";
import { startSpeakTest } from "@/lib/speak-service";

// 문장 시험 시작 (역할별). 진행 중인 세션이 있으면 이어서 본다.
export async function POST(req: Request) {
  try {
    const s = await requireStudent();
    const b = await req.json();
    const lessonId = Number(b.lessonId);
    const role = String(b.role ?? "");
    if (!lessonId) return Response.json({ error: "레슨을 찾을 수 없습니다." }, { status: 400 });
    if (!["A", "B", "N"].includes(role)) return Response.json({ error: "역할이 올바르지 않습니다." }, { status: 400 });

    const session = await startSpeakTest(s.uid, lessonId, role as "A" | "B" | "N");
    const items = JSON.parse(session.itemsJson) as number[];
    return Response.json({
      id: session.id,
      lessonId: session.lessonId,
      role: session.role,
      items,
      index: session.currentIndex,
      total: session.totalCount,
      passedCount: session.passedCount,
      requiredCount: session.requiredCount,
      matchRate: session.matchRate,
      status: session.status,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
