import { db } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/auth";

// 단어 수정 (뜻/품사/예문)
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id } = await ctx.params;
    const b = await req.json();
    const data: Record<string, unknown> = {};
    if (b.text?.trim()) data.text = String(b.text).trim();
    if (b.pos) data.pos = b.pos;
    if (Array.isArray(b.meanings)) {
      const cleaned = b.meanings.map((m: string) => String(m).trim()).filter(Boolean);
      if (cleaned.length === 0) return Response.json({ error: "뜻은 최소 1개 필요합니다." }, { status: 400 });
      data.meaningsJson = JSON.stringify(cleaned);
    }
    if (b.example !== undefined) data.example = b.example?.trim() || null;
    if (b.exampleKo !== undefined) data.exampleKo = b.exampleKo?.trim() || null;
    if (b.emoji !== undefined) data.emoji = b.emoji?.trim() || null;
    await db.word.update({ where: { id: Number(id) }, data });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

// 단어 삭제
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id } = await ctx.params;
    await db.word.delete({ where: { id: Number(id) } });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
