import { requireStaff, errorResponse } from "@/lib/auth";
import { extractFromFile } from "@/lib/exam-extract";

export const maxDuration = 120;

// 업로드한 사진·엑셀에서 시험지 재료(낱말 목록 또는 본문)를 뽑는다.
export async function POST(req: Request) {
  try {
    await requireStaff();
    const form = await req.formData();
    const file = form.get("file");
    const want = form.get("want") === "WORDS" ? "WORDS" : "TEXT";
    if (!(file instanceof File)) return Response.json({ error: "파일을 선택하세요." }, { status: 400 });
    if (file.size > 8 * 1024 * 1024) {
      return Response.json({ error: "파일이 너무 큽니다. 8MB 이하로 올려주세요." }, { status: 400 });
    }
    return Response.json(await extractFromFile(file, want));
  } catch (e) {
    return errorResponse(e);
  }
}
