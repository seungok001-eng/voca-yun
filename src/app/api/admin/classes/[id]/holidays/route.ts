import { db } from "@/lib/db";
import { requireStaff, accessibleClassIds, errorResponse, AuthError } from "@/lib/auth";

async function guardClass(s: Awaited<ReturnType<typeof requireStaff>>, classId: number) {
  const ids = await accessibleClassIds(s);
  if (ids !== null && !ids.includes(classId)) throw new AuthError(403, "담당 반이 아닙니다.");
  const cls = await db.class.findUnique({ where: { id: classId }, select: { id: true, organizationId: true } });
  if (!cls) throw new AuthError(404, "반을 찾을 수 없습니다.");
  return cls;
}

// 이 반에만 적용되는 휴무 목록 (선생님·원장·총관리자)
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff();
    const classId = Number((await ctx.params).id);
    await guardClass(s, classId);
    const holidays = await db.holiday.findMany({ where: { classId }, orderBy: { startDate: "desc" } });
    return Response.json({ holidays });
  } catch (e) {
    return errorResponse(e);
  }
}

// 이 반 전용 휴무 추가. 학원 전체 휴무가 아니어도 이 반에는 적용된다.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireStaff();
    const classId = Number((await ctx.params).id);
    const cls = await guardClass(s, classId);
    const b = await req.json();
    const name = String(b.name ?? "").trim();
    const startDate = String(b.startDate ?? "");
    const endDate = String(b.endDate ?? startDate);
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return Response.json({ error: "이름과 날짜를 입력하세요." }, { status: 400 });
    }
    if (endDate < startDate) return Response.json({ error: "종료일이 시작일보다 빠릅니다." }, { status: 400 });
    if (cls.organizationId === null) return Response.json({ error: "학원 소속이 없는 반입니다." }, { status: 400 });
    const h = await db.holiday.create({
      data: { organizationId: cls.organizationId, classId, name, startDate, endDate },
    });
    return Response.json({ id: h.id });
  } catch (e) {
    return errorResponse(e);
  }
}
