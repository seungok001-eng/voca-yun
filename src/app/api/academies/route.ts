import { db } from "@/lib/db";

// 회원가입 학원 선택칸용 — 노출 허용된 학원만 (공개, 인증 불필요)
export async function GET() {
  const academies = await db.organization.findMany({
    where: { type: "ACADEMY", visible: true, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return Response.json({ academies });
}
