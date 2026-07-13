import { db } from "@/lib/db";
import { requireStaff, AuthError, errorResponse } from "@/lib/auth";

// 반/학생에게 레벨 또는 커스텀 단어장 배정 (기존 배정은 비활성화)
export async function POST(req: Request) {
  try {
    const s = await requireStaff();
    const { classId, studentId, sourceType, levelId, wordbookId } = await req.json();
    if (!classId && !studentId) return Response.json({ error: "배정 대상을 선택하세요." }, { status: 400 });
    if (sourceType === "LEVEL" && !levelId) return Response.json({ error: "레벨을 선택하세요." }, { status: 400 });
    if (sourceType === "WORDBOOK" && !wordbookId) return Response.json({ error: "단어장을 선택하세요." }, { status: 400 });
    // 커스텀 단어장은 총관리자 전용 기능
    if (sourceType === "WORDBOOK" && s.role !== "SUPER_ADMIN") throw new AuthError(403, "커스텀 단어장 배정은 총관리자만 가능합니다.");

    await db.assignment.updateMany({
      where: classId ? { classId } : { studentId },
      data: { active: false },
    });
    const a = await db.assignment.create({
      data: {
        classId: classId ?? null,
        studentId: studentId ?? null,
        sourceType,
        levelId: sourceType === "LEVEL" ? levelId : null,
        wordbookId: sourceType === "WORDBOOK" ? wordbookId : null,
      },
    });
    return Response.json({ id: a.id });
  } catch (e) {
    return errorResponse(e);
  }
}
