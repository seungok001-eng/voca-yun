import { db } from "@/lib/db";
import { requireDirector, accessibleOrgId, errorResponse } from "@/lib/auth";

function resolveOrg(s: Awaited<ReturnType<typeof requireDirector>>, academyId?: string | null) {
  let orgId = accessibleOrgId(s);
  if (s.role === "SUPER_ADMIN") orgId = academyId ? Number(academyId) : (s.orgId ?? null);
  return orgId;
}

// 휴무 기간 목록 + 공휴일 자동휴무 설정
export async function GET(req: Request) {
  try {
    const s = await requireDirector();
    const url = new URL(req.url);
    const orgId = resolveOrg(s, url.searchParams.get("academyId"));
    if (orgId === null) return Response.json({ error: "학원을 지정하세요." }, { status: 400 });

    const [org, holidays, classes] = await Promise.all([
      db.organization.findUnique({ where: { id: orgId }, select: { name: true, skipKoreanHolidays: true } }),
      db.holiday.findMany({ where: { organizationId: orgId }, orderBy: { startDate: "desc" } }),
      db.class.findMany({ where: { organizationId: orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    const classNameById = new Map(classes.map((c) => [c.id, c.name]));
    return Response.json({
      academyName: org?.name,
      skipKoreanHolidays: org?.skipKoreanHolidays ?? true,
      classes,
      holidays: holidays.map((h) => ({
        id: h.id, name: h.name, startDate: h.startDate, endDate: h.endDate,
        classId: h.classId, className: h.classId ? classNameById.get(h.classId) ?? "?" : null,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// 휴무 기간 추가
export async function POST(req: Request) {
  try {
    const s = await requireDirector();
    const b = await req.json();
    const orgId = resolveOrg(s, b.academyId);
    if (orgId === null) return Response.json({ error: "학원을 지정하세요." }, { status: 400 });
    const name = String(b.name ?? "").trim();
    const startDate = String(b.startDate ?? "");
    const endDate = String(b.endDate ?? startDate);
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return Response.json({ error: "이름과 날짜를 입력하세요." }, { status: 400 });
    }
    if (endDate < startDate) return Response.json({ error: "종료일이 시작일보다 빠릅니다." }, { status: 400 });
    const h = await db.holiday.create({
      data: { organizationId: orgId, classId: b.classId ? Number(b.classId) : null, name, startDate, endDate },
    });
    return Response.json({ id: h.id });
  } catch (e) {
    return errorResponse(e);
  }
}

// 공휴일 자동휴무 토글
export async function PATCH(req: Request) {
  try {
    const s = await requireDirector();
    const b = await req.json();
    const orgId = resolveOrg(s, b.academyId);
    if (orgId === null) return Response.json({ error: "학원을 지정하세요." }, { status: 400 });
    await db.organization.update({ where: { id: orgId }, data: { skipKoreanHolidays: !!b.skipKoreanHolidays } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
