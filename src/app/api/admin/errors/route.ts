import { db } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/auth";

// 서버 오류 로그 조회 (총관리자)
export async function GET() {
  try {
    await requireSuperAdmin();
    const errors = await db.errorLog.findMany({ orderBy: { id: "desc" }, take: 200 });
    return Response.json({ errors });
  } catch (e) {
    return errorResponse(e);
  }
}

// 전체 비우기
export async function DELETE() {
  try {
    await requireSuperAdmin();
    await db.errorLog.deleteMany({});
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
