import { requireStudent, errorResponse } from "@/lib/auth";
import { earnedBadges } from "@/lib/badges";

// 내 뱃지 진열장
export async function GET() {
  try {
    const s = await requireStudent();
    return Response.json(await earnedBadges(s.uid));
  } catch (e) {
    return errorResponse(e);
  }
}
