import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSessionCookie, type Role } from "@/lib/auth";

// 회원가입 — 학원 선택 시 승인 대기(PENDING), 개인 학습은 즉시 이용(APPROVED)
export async function POST(req: Request) {
  const b = await req.json();
  const username = String(b.username ?? "").trim();
  const password = String(b.password ?? "");
  const name = String(b.name ?? "").trim();
  // ACADEMY(학원 학생) | TEACHER(선생님) | INDIVIDUAL(개인)
  const accountType = ["INDIVIDUAL", "TEACHER"].includes(b.accountType) ? b.accountType : "ACADEMY";

  if (!username || !password || !name) {
    return Response.json({ error: "아이디, 비밀번호, 이름은 필수입니다." }, { status: 400 });
  }
  if (password.length < 4) {
    return Response.json({ error: "비밀번호는 4자 이상이어야 합니다." }, { status: 400 });
  }
  const exists = await db.user.findUnique({ where: { username } });
  if (exists) return Response.json({ error: "이미 사용 중인 아이디입니다." }, { status: 400 });

  const common = {
    username,
    passwordHash: await bcrypt.hash(password, 10),
    plainPassword: password, // 교직원 확인용 사본
    name,
    birthdate: b.birthdate ? String(b.birthdate) : null,
    gender: ["M", "F", "OTHER"].includes(b.gender) ? b.gender : null,
    school: b.school ? String(b.school).trim() : null,
    grade: b.grade ? String(b.grade).trim() : null,
    parentPhone: b.parentPhone ? String(b.parentPhone).trim() : null,
  };

  if (accountType === "INDIVIDUAL") {
    // 개인 학습자 — 즉시 이용 가능
    const user = await db.user.create({
      data: { ...common, role: "INDIVIDUAL" as Role, status: "APPROVED" },
    });
    await createSessionCookie({ uid: user.id, role: "INDIVIDUAL", name: user.name, orgId: null });
    return Response.json({ ok: true, status: "APPROVED", role: "INDIVIDUAL" });
  }

  // 학원 소속(학생/선생님) — 승인 대기
  const organizationId = Number(b.organizationId);
  const org = await db.organization.findFirst({
    where: { id: organizationId, type: "ACADEMY", visible: true, status: "ACTIVE" },
  });
  if (!org) return Response.json({ error: "학원을 선택해 주세요." }, { status: 400 });

  const role: Role = accountType === "TEACHER" ? "TEACHER" : "STUDENT";
  await db.user.create({
    data: { ...common, role, status: "PENDING", organizationId: org.id },
  });
  return Response.json({ ok: true, status: "PENDING", academyName: org.name, role });
}
