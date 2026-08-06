import { requireStudent, errorResponse } from "@/lib/auth";
import { gradeLine } from "@/lib/speak-service";

// 공부 모드 즉시 채점 — 세션/기록 없이 일치율과 피드백만 돌려준다
export async function POST(req: Request) {
  try {
    const s = await requireStudent();
    const b = await req.json();
    const lineId = Number(b.lineId);
    if (!lineId) return Response.json({ error: "문장을 찾을 수 없습니다." }, { status: 400 });
    return Response.json(await gradeLine(s.uid, lineId, String(b.recognized ?? "")));
  } catch (e) {
    return errorResponse(e);
  }
}
