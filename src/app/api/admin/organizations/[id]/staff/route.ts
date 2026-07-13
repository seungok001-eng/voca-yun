import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/auth";

// 기존 학원에 원장/선생님 계정 직접 생성 (총관리자) — 생성 즉시 승인
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSuperAdmin();
    const { id } = await ctx.params;
    const b = await req.json();
    const role = String(b.role ?? "");
    const name = String(b.name ?? "").trim();
    const username = String(b.username ?? "").trim();
    const password = String(b.password ?? "");
    if (!["DIRECTOR", "TEACHER"].includes(role)) return Response.json({ error: "역할은 원장 또는 선생님만 가능합니다." }, { status: 400 });
    if (!name || !username || !password) return Response.json({ error: "이름·아이디·비밀번호를 모두 입력하세요." }, { status: 400 });
    const org = await db.organization.findUnique({ where: { id: Number(id) } });
    if (!org) return Response.json({ error: "학원을 찾을 수 없습니다." }, { status: 404 });
    const exists = await db.user.findUnique({ where: { username } });
    if (exists) return Response.json({ error: "이미 사용 중인 아이디입니다." }, { status: 400 });
    const user = await db.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 10),
        plainPassword: password,
        name,
        role,
        status: "APPROVED",
        organizationId: org.id,
        parentPhone: b.phone?.trim() || null, // 교직원은 본인 연락처로 사용
      },
    });
    return Response.json({ id: user.id });
  } catch (e) {
    return errorResponse(e);
  }
}
