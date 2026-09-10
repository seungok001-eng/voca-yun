import { db } from "@/lib/db";
import { requireStaff, errorResponse } from "@/lib/auth";

// 내가(또는 우리 학원이) 만들어 둔 시험지 목록·불러오기·삭제
export async function GET(req: Request) {
  try {
    const s = await requireStaff();
    const id = new URL(req.url).searchParams.get("id");
    const me = await db.user.findUnique({ where: { id: s.uid }, select: { organizationId: true } });

    if (id) {
      const row = await db.examPaper.findUnique({ where: { id: Number(id) }, include: { organization: { select: { name: true } } } });
      if (!row) return Response.json({ error: "시험지를 찾을 수 없습니다." }, { status: 404 });
      if (s.role !== "SUPER_ADMIN" && row.organizationId !== me?.organizationId) {
        return Response.json({ error: "권한이 없습니다." }, { status: 403 });
      }
      return Response.json({ ...JSON.parse(row.paperJson), id: row.id, orgName: row.organization?.name ?? "정철 VOCA" });
    }

    const rows = await db.examPaper.findMany({
      where: s.role === "SUPER_ADMIN" ? {} : { organizationId: me?.organizationId ?? null },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { createdBy: { select: { name: true } } },
    });
    return Response.json({
      papers: rows.map((r) => ({
        id: r.id, kind: r.kind, title: r.title, level: r.level,
        author: r.createdBy?.name ?? "", createdAt: r.createdAt,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const s = await requireStaff();
    const id = Number(new URL(req.url).searchParams.get("id"));
    const row = await db.examPaper.findUnique({ where: { id } });
    if (!row) return Response.json({ ok: true });
    const me = await db.user.findUnique({ where: { id: s.uid }, select: { organizationId: true } });
    const mine = row.createdById === s.uid;
    const sameOrg = row.organizationId === me?.organizationId;
    if (s.role !== "SUPER_ADMIN" && !mine && !(s.role === "DIRECTOR" && sameOrg)) {
      return Response.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    await db.examPaper.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
