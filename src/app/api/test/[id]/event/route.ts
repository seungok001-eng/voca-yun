import { db } from "@/lib/db";
import { requireStudent, errorResponse } from "@/lib/auth";

// 부정행위 감지 이벤트 (탭 전환/화면 이탈)
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStudent();
    const { id } = await ctx.params;
    const { type } = await req.json();
    const session = await db.testSession.findUnique({ where: { id: Number(id) } });
    if (!session || session.studentId !== s.uid || session.status !== "IN_PROGRESS") {
      return Response.json({ ok: false });
    }
    await db.cheatEvent.create({ data: { sessionId: session.id, type: String(type ?? "BLUR") } });
    await db.testSession.update({ where: { id: session.id }, data: { cheatCount: { increment: 1 } } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
