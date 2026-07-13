import { db } from "@/lib/db";
import { requireDirector, accessibleOrgId, errorResponse, AuthError } from "@/lib/auth";

// 가입 승인 / 거절 (학생·선생님). 학생 승인 시 반 배정 옵션. 원장급만.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireDirector();
    const { id } = await ctx.params;
    const { action, classId } = await req.json();
    const user = await db.user.findUnique({ where: { id: Number(id) } });
    if (!user || !["STUDENT", "TEACHER"].includes(user.role) || user.status !== "PENDING") {
      return Response.json({ error: "승인 대기 회원이 아닙니다." }, { status: 404 });
    }
    const orgId = accessibleOrgId(s);
    if (orgId !== null && user.organizationId !== orgId) throw new AuthError(403, "다른 학원의 회원입니다.");
    const isTeacher = user.role === "TEACHER";

    if (action === "approve") {
      await db.user.update({
        where: { id: user.id },
        // 선생님은 반 배정 없음 (담당 반은 반 관리에서 지정)
        data: { status: "APPROVED", classId: !isTeacher && classId ? Number(classId) : null },
      });
      if (!isTeacher) {
        await db.notificationLog.create({
          data: { studentId: user.id, type: "TEST_PASS", message: `[정철어학원 청당국제캠퍼스] ${user.name} 학생의 가입이 승인되었습니다.` },
        });
      }
      return Response.json({ ok: true, status: "APPROVED" });
    }
    if (action === "reject") {
      await db.user.update({ where: { id: user.id }, data: { status: "REJECTED" } });
      return Response.json({ ok: true, status: "REJECTED" });
    }
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
