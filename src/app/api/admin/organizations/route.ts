import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/auth";

// 학원 목록 (총관리자)
export async function GET() {
  try {
    await requireSuperAdmin();
    const orgs = await db.organization.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { members: true, classes: true } },
        members: { select: { name: true, username: true, role: true, status: true } },
      },
    });
    return Response.json({
      organizations: orgs.map((o) => {
        const director = o.members.find((m) => m.role === "DIRECTOR") ?? null;
        const directors = o.members.filter((m) => m.role === "DIRECTOR").length;
        const teachers = o.members.filter((m) => m.role === "TEACHER").length;
        const students = o.members.filter((m) => m.role === "STUDENT").length;
        const pending = o.members.filter((m) => m.role === "STUDENT" && m.status === "PENDING").length;
        return {
          id: o.id, name: o.name, type: o.type, phone: o.phone, address: o.address,
          visible: o.visible, status: o.status,
          memberCount: o._count.members, classCount: o._count.classes,
          director: director ? { name: director.name, username: director.username } : null,
          breakdown: { directors, teachers, students, pending },
        };
      }),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// 학원 등록 + 원장(관리자) 계정 생성 (총관리자만) — 등록 즉시 회원가입 학원 목록에 노출
export async function POST(req: Request) {
  try {
    await requireSuperAdmin();
    const b = await req.json();
    const name = String(b.name ?? "").trim();
    const adminUsername = String(b.adminUsername ?? "").trim();
    const adminPassword = String(b.adminPassword ?? "");
    const adminName = String(b.adminName ?? "").trim();
    if (!name || !adminUsername || !adminPassword || !adminName) {
      return Response.json({ error: "학원 이름과 원장 계정 정보를 모두 입력하세요." }, { status: 400 });
    }
    const exists = await db.user.findUnique({ where: { username: adminUsername } });
    if (exists) return Response.json({ error: "이미 사용 중인 원장 아이디입니다." }, { status: 400 });

    const org = await db.organization.create({
      data: {
        name, type: "ACADEMY",
        phone: b.phone?.trim() || null,
        address: b.address?.trim() || null,
        visible: b.visible !== false,
      },
    });
    await db.user.create({
      data: {
        username: adminUsername,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        plainPassword: adminPassword,
        name: adminName,
        role: "DIRECTOR",
        status: "APPROVED",
        organizationId: org.id,
      },
    });
    return Response.json({ id: org.id });
  } catch (e) {
    return errorResponse(e);
  }
}
