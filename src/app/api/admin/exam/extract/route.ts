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
    // 서버 요청 한도가 4.5MB라 그 안에서 받는다 (사진은 화면에서 미리 줄여서 온다)
    if (file.size > 4 * 1024 * 1024) {
      return Response.json({ error: "파일이 너무 큽니다. 4MB 이하로 올려주세요." }, { status: 400 });
    }
    return Response.json(await extractFromFile(file, want));
  } catch (e) {
    // AI 쪽 오류(한도 초과, 키 문제 등)는 원인을 그대로 보여준다
    const msg = e instanceof Error ? e.message : "";
    if (/^\d{3}:|빈 응답|AI 키|AI 응답|AI 호출/.test(msg)) {
      return Response.json({ error: `AI 오류: ${msg.slice(0, 220)}` }, { status: 502 });
    }
    return errorResponse(e);
  }
}
