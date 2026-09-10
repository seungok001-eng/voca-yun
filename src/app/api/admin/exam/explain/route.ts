import { requireStaff, errorResponse } from "@/lib/auth";
import { geminiJson, FLASH } from "@/lib/gemini";

export const maxDuration = 120;

// 선생님이 새로 추가한 빈칸에 해설을 붙여준다
// body: { passage: 본문(빈칸 없는 원문), level: 학년 이름, items: [{ no, answer, sentence }] }
export async function POST(req: Request) {
  try {
    await requireStaff();
    const b = await req.json();
    const items: { no: number; answer: string; sentence: string }[] = Array.isArray(b.items) ? b.items : [];
    if (items.length === 0) return Response.json({ items: [] });

    const got = await geminiJson<{ items: { no: number; explanation: string; points: string[] }[] }>(
      [{
        text: `아래 영어 본문으로 빈칸 채우기 시험을 본다. 선생님이 고른 빈칸마다 해설을 써라.
${b.level ? `대상: ${b.level}` : ""}

해설(explanation)은 왜 그 낱말이 들어가는지, 어떤 어휘·문법 포인트인지 한국어로 2~3문장 쓴다.
points에는 그 빈칸에서 짚을 핵심(품사, 함께 쓰는 표현, 헷갈리는 낱말, 문법 규칙)을 짧은 구로 1~3개 쓴다.
no는 주어진 번호를 그대로 쓴다.

본문
"""
${String(b.passage || "").trim()}
"""

빈칸
${items.map((x) => `${x.no}. 정답: ${x.answer} / 문장: ${x.sentence}`).join("\n")}`,
      }],
      {
        type: "OBJECT",
        properties: {
          items: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                no: { type: "INTEGER" },
                explanation: { type: "STRING" },
                points: { type: "ARRAY", items: { type: "STRING" } },
              },
              required: ["no", "explanation"],
            },
          },
        },
        required: ["items"],
      },
      { model: FLASH, temperature: 0.4 }
    );
    return Response.json({ items: got.items ?? [] });
  } catch (e) {
    return errorResponse(e);
  }
}
