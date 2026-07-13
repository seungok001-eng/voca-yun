import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireStaff, errorResponse } from "@/lib/auth";

// 학생 계정 생성 (관리자가 직접 등록 — 즉시 승인)
export async function POST(req: Request) {
  try {
    const s = await requireStaff();
    const { username, password, name, classId, parentPhone, school, grade } = await req.json();
    if (!username || !password || !name) {
      return Response.json({ error: "아이디, 비밀번호, 이름은 필수입니다." }, { status: 400 });
    }
    const exists = await db.user.findUnique({ where: { username } });
    if (exists) return Response.json({ error: "이미 사용 중인 아이디입니다." }, { status: 400 });
    const user = await db.user.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(String(password), 10),
        plainPassword: String(password), // 교직원 확인용 사본
        name,
        role: "STUDENT",
        status: "APPROVED",
        organizationId: s.orgId ?? null,
        classId: classId ?? null,
        parentPhone: parentPhone ?? null,
        school: school ?? null,
        grade: grade ?? null,
      },
    });
    return Response.json({ id: user.id });
  } catch (e) {
    return errorResponse(e);
  }
}
