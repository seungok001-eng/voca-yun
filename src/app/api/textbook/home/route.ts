import { requireStudent, errorResponse } from "@/lib/auth";
import { textbookHome } from "@/lib/textbook-student";

// 교재 과정 홈 — 배정 교재, 오늘의 진도, 레슨 목록과 진행 상태
export async function GET() {
  try {
    const s = await requireStudent();
    return Response.json(await textbookHome(s.uid));
  } catch (e) {
    return errorResponse(e);
  }
}
