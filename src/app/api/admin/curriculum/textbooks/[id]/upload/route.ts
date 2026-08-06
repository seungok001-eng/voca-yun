import { requireSuperAdmin, errorResponse } from "@/lib/auth";
import { importTextbookContent, parseWorkbook, type ImportLesson } from "@/lib/speak-import";

// 교재 콘텐츠 업로드 — 엑셀(multipart) 또는 JSON 본문 둘 다 받는다.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSuperAdmin();
    const textbookId = Number((await ctx.params).id);
    const contentType = req.headers.get("content-type") ?? "";

    let lessons: ImportLesson[];
    if (contentType.includes("application/json")) {
      const b = await req.json();
      if (!Array.isArray(b.lessons)) return Response.json({ error: "lessons 배열이 필요합니다." }, { status: 400 });
      lessons = b.lessons as ImportLesson[];
    } else {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) return Response.json({ error: "엑셀 파일이 필요합니다." }, { status: 400 });
      lessons = parseWorkbook(Buffer.from(await file.arrayBuffer()));
    }

    if (lessons.length === 0) {
      return Response.json(
        { error: "읽을 내용이 없습니다. 각 시트의 앞 3칸이 파트·영역(T/B)·레슨번호인지 확인하세요." },
        { status: 400 }
      );
    }
    const result = await importTextbookContent(textbookId, lessons, s.uid);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
