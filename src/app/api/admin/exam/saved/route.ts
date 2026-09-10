import { db } from "@/lib/db";
import { requireStaff, errorResponse, type Session } from "@/lib/auth";

// 만들어 둔 시험지 — 목록(필터·검색·쪽 넘김) · 불러오기 · 태그/내용 수정 · 삭제
//
// 권한
//  - 보기·인쇄: 같은 학원 누구나 (총관리자는 전체)
//  - 편집·태그·삭제: 만든 사람 본인, 같은 학원 원장, 총관리자

const PAGE = 20;

function splitTags(s: string | null | undefined): string[] {
  return String(s ?? "").split(",").map((t) => t.trim()).filter(Boolean);
}

async function canEdit(s: Session, row: { createdById: number; organizationId: number | null }) {
  if (s.role === "SUPER_ADMIN") return true;
  if (row.createdById === s.uid) return true;
  if (s.role === "DIRECTOR") {
    const me = await db.user.findUnique({ where: { id: s.uid }, select: { organizationId: true } });
    return !!me?.organizationId && row.organizationId === me.organizationId;
  }
  return false;
}

export async function GET(req: Request) {
  try {
    const s = await requireStaff();
    const url = new URL(req.url);
    const q = url.searchParams;
    const me = await db.user.findUnique({ where: { id: s.uid }, select: { organizationId: true } });

    // 한 장 불러오기
    const id = q.get("id");
    if (id) {
      const row = await db.examPaper.findUnique({ where: { id: Number(id) }, include: { organization: { select: { name: true } } } });
      if (!row) return Response.json({ error: "시험지를 찾을 수 없습니다." }, { status: 404 });
      if (s.role !== "SUPER_ADMIN" && row.organizationId !== me?.organizationId) {
        return Response.json({ error: "권한이 없습니다." }, { status: 403 });
      }
      return Response.json({
        ...JSON.parse(row.paperJson),
        id: row.id,
        orgName: row.organization?.name ?? "정철 VOCA",
        tags: splitTags(row.tags),
        canEdit: await canEdit(s, row),
      });
    }

    // 목록 — 필터
    const scope = s.role === "SUPER_ADMIN" ? {} : { organizationId: me?.organizationId ?? null };
    const where: Record<string, unknown> = { ...scope };
    if (q.get("mine") === "1") where.createdById = s.uid;
    if (q.get("author")) where.createdById = Number(q.get("author"));
    if (q.get("kind")) where.kind = q.get("kind");
    if (q.get("level")) where.level = { contains: q.get("level")! };
    if (q.get("tag")) where.tags = { contains: q.get("tag")! };
    if (q.get("q")) where.title = { contains: q.get("q")!, mode: "insensitive" };

    // 날짜 — from/to 는 YYYY-MM-DD (그 날 하루를 모두 포함)
    const from = q.get("from"), to = q.get("to");
    if (from || to) {
      const c: Record<string, Date> = {};
      if (from) c.gte = new Date(`${from}T00:00:00+09:00`);
      if (to) c.lte = new Date(`${to}T23:59:59.999+09:00`);
      where.createdAt = c;
    }

    const page = Math.max(1, Number(q.get("page")) || 1);
    const [total, rows, authors, tagRows] = await Promise.all([
      db.examPaper.count({ where }),
      db.examPaper.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE,
        include: { createdBy: { select: { id: true, name: true } } },
      }),
      // 필터용 선생님 목록 — 이 학원에서 시험지를 만든 적 있는 사람
      db.examPaper.findMany({ where: scope, distinct: ["createdById"], select: { createdBy: { select: { id: true, name: true } } } }),
      db.examPaper.findMany({ where: { ...scope, NOT: { tags: "" } }, select: { tags: true }, take: 500 }),
    ]);

    const tagSet = new Set<string>();
    for (const r of tagRows) for (const t of splitTags(r.tags)) tagSet.add(t);

    return Response.json({
      papers: await Promise.all(rows.map(async (r) => ({
        id: r.id, kind: r.kind, title: r.title, level: r.level,
        author: r.createdBy?.name ?? "", authorId: r.createdById,
        createdAt: r.createdAt, tags: splitTags(r.tags),
        canEdit: await canEdit(s, r),
      }))),
      total, page, pageSize: PAGE,
      authors: authors.map((a) => a.createdBy).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, "ko")),
      tags: [...tagSet].sort((a, b) => a.localeCompare(b, "ko")),
      me: { id: s.uid, role: s.role },
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
    if (!(await canEdit(s, row))) return Response.json({ error: "본인이 만든 시험지만 삭제할 수 있습니다." }, { status: 403 });
    await db.examPaper.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

// 수정 — { id, paper } 면 내용 전체, { id, tags } 면 태그만
export async function PUT(req: Request) {
  try {
    const s = await requireStaff();
    const b = await req.json();
    const id = Number(b.id);
    if (!id) return Response.json({ error: "저장할 내용이 없습니다." }, { status: 400 });
    const row = await db.examPaper.findUnique({ where: { id } });
    if (!row) return Response.json({ error: "시험지를 찾을 수 없습니다." }, { status: 404 });
    if (!(await canEdit(s, row))) return Response.json({ error: "본인이 만든 시험지만 편집할 수 있습니다." }, { status: 403 });

    const data: Record<string, unknown> = {};
    if (Array.isArray(b.tags) || typeof b.tags === "string") {
      const tags = Array.isArray(b.tags) ? b.tags : splitTags(b.tags);
      data.tags = [...new Set(tags.map((t: string) => String(t).trim()).filter(Boolean))].join(", ");
    }
    if (b.paper?.questions) {
      const { id: _id, orgName: _o, tags: _t, canEdit: _c, ...body } = b.paper;
      void _id; void _o; void _t; void _c;
      data.title = String(body.title || row.title);
      data.paperJson = JSON.stringify(body);
    }
    if (Object.keys(data).length === 0) return Response.json({ error: "바뀐 내용이 없습니다." }, { status: 400 });
    await db.examPaper.update({ where: { id }, data });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
