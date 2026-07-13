import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSessionCookie, type Role } from "@/lib/auth";

export async function POST(req: Request) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return Response.json({ error: "아이디와 비밀번호를 입력하세요." }, { status: 400 });
  }
  const user = await db.user.findUnique({ where: { username: String(username).trim() } });
  if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
    return Response.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  if (user.status === "PENDING") {
    return Response.json({ error: "가입 승인 대기 중입니다. 학원 관리자의 승인 후 이용할 수 있습니다." }, { status: 403 });
  }
  if (user.status === "REJECTED") {
    return Response.json({ error: "가입이 거절되었습니다. 학원에 문의해 주세요." }, { status: 403 });
  }
  await createSessionCookie({ uid: user.id, role: user.role as Role, name: user.name, orgId: user.organizationId ?? null });
  return Response.json({ ok: true, role: user.role, name: user.name });
}
