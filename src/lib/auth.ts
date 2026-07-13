import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret");

export type Role = "SUPER_ADMIN" | "DIRECTOR" | "TEACHER" | "STUDENT" | "INDIVIDUAL";
export type Session = { uid: number; role: Role; name: string; orgId: number | null };

export async function createSessionCookie(payload: Session) {
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(secret());
  const jar = await cookies();
  jar.set("session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete("session");
}

export async function getSession(): Promise<Session | null> {
  try {
    const jar = await cookies();
    const token = jar.get("session")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AuthError(401, "로그인이 필요합니다.");
  return s;
}

// 교직원: 총관리자 / 원장 / 선생님
export async function requireStaff(): Promise<Session> {
  const s = await requireSession();
  if (!["SUPER_ADMIN", "DIRECTOR", "TEACHER"].includes(s.role)) throw new AuthError(403, "권한이 없습니다.");
  return s;
}

export async function requireSuperAdmin(): Promise<Session> {
  const s = await requireSession();
  if (s.role !== "SUPER_ADMIN") throw new AuthError(403, "총관리자만 접근할 수 있습니다.");
  return s;
}

// 원장급: 총관리자 또는 원장 (학원 운영 설정·가입 승인 등)
export async function requireDirector(): Promise<Session> {
  const s = await requireSession();
  if (!["SUPER_ADMIN", "DIRECTOR"].includes(s.role)) throw new AuthError(403, "원장 이상만 접근할 수 있습니다.");
  return s;
}

// 학습자: 학생 또는 개인
export async function requireStudent(): Promise<Session> {
  const s = await requireSession();
  if (s.role !== "STUDENT" && s.role !== "INDIVIDUAL") throw new AuthError(403, "학습자 계정만 사용할 수 있습니다.");
  return s;
}

// 접근 가능한 반 ID 목록. null = 전체(총관리자).
// 원장·선생님 모두 자기 학원의 모든 반을 봄 (선생님은 학원 전체 학생 열람).
export async function accessibleClassIds(s: Session): Promise<number[] | null> {
  if (s.role === "SUPER_ADMIN") return null;
  if (s.role === "DIRECTOR" || s.role === "TEACHER") {
    const classes = await db.class.findMany({ where: { organizationId: s.orgId ?? -1 }, select: { id: true } });
    return classes.map((c) => c.id);
  }
  return [];
}

// 접근 가능한 학원 ID. null = 전체(총관리자).
export function accessibleOrgId(s: Session): number | null {
  if (s.role === "SUPER_ADMIN") return null;
  return s.orgId ?? -1;
}

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return Response.json({ error: e.message }, { status: e.status });
  }
  // 사용자에게 안내문으로 던진 오류 (예: "복습할 단어가 없습니다.") → 400으로 그대로 전달
  if (e instanceof Error && /[가-힣]/.test(e.message)) {
    return Response.json({ error: e.message }, { status: 400 });
  }
  console.error(e);
  // 예상 못한 서버 오류는 DB에 기록 (실패해도 응답에는 영향 없음)
  const message = e instanceof Error ? e.message : String(e);
  const stack = e instanceof Error ? e.stack?.slice(0, 4000) : undefined;
  db.errorLog.create({ data: { message: message.slice(0, 1000), stack } }).catch(() => {});
  return Response.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
}
