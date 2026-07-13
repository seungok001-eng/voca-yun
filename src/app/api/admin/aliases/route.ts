import { db } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/auth";

// 선생님이 한글 답안을 추가 정답으로 인정 → 이후 자동 정답 처리
export async function POST(req: Request) {
  try {
    await requireSuperAdmin();
    const { wordId, text } = await req.json();
    if (!wordId || !text?.trim()) return Response.json({ error: "단어와 정답 표현이 필요합니다." }, { status: 400 });
    await db.answerAlias.create({ data: { wordId: Number(wordId), text: String(text).trim() } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
