import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireStaff, requireDirector, errorResponse } from "@/lib/auth";

export async function GET() {
  try {
    await requireStaff();
    const teachers = await db.user.findMany({
      where: { role: { in: ["TEACHER", "DIRECTOR"] } },
      select: { id: true, name: true, username: true, role: true },
      orderBy: { name: "asc" },
    });
    return Response.json({ teachers });
  } catch (e) {
    return errorResponse(e);
  }
}

// 선생님 계정 직접 생성 (원장급). 소속 학원은 만든 사람 기준.
export async function POST(req: Request) {
  try {
    const s = await requireDirector();
    const { username, password, name } = await req.json();
    if (!username || !password || !name) return Response.json({ error: "모든 항목을 입력하세요." }, { status: 400 });
    const exists = await db.user.findUnique({ where: { username } });
    if (exists) return Response.json({ error: "이미 사용 중인 아이디입니다." }, { status: 400 });
    const user = await db.user.create({
      data: { username, passwordHash: await bcrypt.hash(String(password), 10), name, role: "TEACHER", status: "APPROVED", organizationId: s.orgId ?? null },
    });
    return Response.json({ id: user.id });
  } catch (e) {
    return errorResponse(e);
  }
}
