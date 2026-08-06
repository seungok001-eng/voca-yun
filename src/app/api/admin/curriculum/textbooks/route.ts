import { db } from "@/lib/db";
import { requireStaff, requireSuperAdmin, errorResponse } from "@/lib/auth";

// 표준 교재 구성: KEM=SKY 6권, FEM=PLANET 6권
export const COURSES = [
  { code: "KEM", label: "SKY (KEM)", books: ["SKY 1-1", "SKY 1-2", "SKY 1-3", "SKY 2-1", "SKY 2-2", "SKY 2-3"] },
  { code: "FEM", label: "PLANET (FEM)", books: ["PLANET 1-1", "PLANET 1-2", "PLANET 1-3", "PLANET 2-1", "PLANET 2-2", "PLANET 2-3"] },
];

// 교재 목록 (레슨 수·단어 수 요약)
export async function GET() {
  try {
    await requireStaff();
    const books = await db.textbook.findMany({
      orderBy: [{ course: "asc" }, { order: "asc" }],
      include: {
        parts: {
          orderBy: { order: "asc" },
          include: {
            lessons: {
              orderBy: [{ area: "asc" }, { order: "asc" }],
              include: {
                wordbook: { select: { _count: { select: { words: true } } } },
                _count: { select: { dialogues: true } },
              },
            },
          },
        },
      },
    });
    return Response.json({
      courses: COURSES,
      textbooks: books.map((b) => {
        const lessons = b.parts.flatMap((p) => p.lessons);
        return {
          id: b.id, course: b.course, name: b.name, order: b.order,
          partCount: b.parts.length,
          lessonCount: lessons.length,
          toonCount: lessons.filter((l) => l.area === "TOON").length,
          readingCount: lessons.filter((l) => l.area === "READING").length,
          wordCount: lessons.reduce((n, l) => n + (l.wordbook?._count.words ?? 0), 0),
          dialogueCount: lessons.reduce((n, l) => n + l._count.dialogues, 0),
        };
      }),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// 교재 등록 (총관리자)
export async function POST(req: Request) {
  try {
    await requireSuperAdmin();
    const b = await req.json();
    const course = String(b.course ?? "").trim().toUpperCase();
    const name = String(b.name ?? "").trim();
    if (!["KEM", "FEM"].includes(course)) return Response.json({ error: "레벨은 KEM 또는 FEM 이어야 합니다." }, { status: 400 });
    if (!name) return Response.json({ error: "교재 이름을 입력하세요." }, { status: 400 });
    const dup = await db.textbook.findUnique({ where: { course_name: { course, name } } });
    if (dup) return Response.json({ error: "이미 등록된 교재입니다." }, { status: 400 });
    const order = Number(b.order) || ((await db.textbook.aggregate({ where: { course }, _max: { order: true } }))._max.order ?? 0) + 1;
    const book = await db.textbook.create({ data: { course, name, order } });
    return Response.json({ id: book.id });
  } catch (e) {
    return errorResponse(e);
  }
}
