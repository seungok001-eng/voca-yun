import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

// 총관리자 비밀번호 재설정 (로그인 불가 시 복구용)
// 보안: Vercel 환경변수 SETUP_KEY 와 ?key=... 가 일치해야만 동작한다.
// 사용: /api/admin/reset-director?key=<SETUP_KEY>&pw=<새비밀번호>  (pw 생략 시 1234)
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.SETUP_KEY || url.searchParams.get("key") !== process.env.SETUP_KEY) {
    return Response.json({ error: "설정 키가 올바르지 않습니다." }, { status: 403 });
  }
  const username = url.searchParams.get("user") || "director";
  const pw = url.searchParams.get("pw") || "1234";

  const user = await db.user.findUnique({ where: { username } });
  if (!user) return Response.json({ error: `'${username}' 계정을 찾을 수 없습니다.` }, { status: 404 });

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(pw, 10), plainPassword: pw, status: "APPROVED" },
  });
  return Response.json({ ok: true, username, password: pw, role: user.role });
}
