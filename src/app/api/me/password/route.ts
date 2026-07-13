import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireSession, errorResponse } from "@/lib/auth";

// 내 비밀번호 변경 (모든 역할 공통)
export async function POST(req: Request) {
  try {
    const s = await requireSession();
    const b = await req.json();
    const current = String(b.current ?? "");
    const next = String(b.next ?? "");
    if (!current || !next) return Response.json({ error: "현재 비밀번호와 새 비밀번호를 입력하세요." }, { status: 400 });
    if (next.length < 4) return Response.json({ error: "새 비밀번호는 4자 이상으로 해주세요." }, { status: 400 });
    const user = await db.user.findUnique({ where: { id: s.uid } });
    if (!user) return Response.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    const ok = await bcrypt.compare(current, user.passwordHash);
    if (!ok) return Response.json({ error: "현재 비밀번호가 일치하지 않습니다." }, { status: 400 });
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(next, 10), plainPassword: next },
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
