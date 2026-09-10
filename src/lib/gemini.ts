// Gemini 텍스트·이미지 호출 (서버 전용)
//
// 키는 Vercel 환경변수 GEMINI_API_KEY (또는 GEMINI_KEYS 에 쉼표로 여러 개)로 넣는다.
// 여러 개를 넣으면 한도가 걸릴 때 다음 키로 넘어간다.

const KEYS = [
  ...(process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY] : []),
  ...(process.env.GEMINI_KEYS || "").split(",").map((k) => k.trim()).filter(Boolean),
];

export const FLASH = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
export const PRO = process.env.GEMINI_PRO_MODEL || "gemini-2.5-pro";

export function geminiReady() {
  return KEYS.length > 0;
}

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

type CallOpts = {
  model?: string;
  schema?: unknown;      // JSON 스키마를 주면 JSON만 돌려받는다
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
};

async function once(parts: Part[], key: string, o: CallOpts): Promise<string> {
  const model = o.model || FLASH;
  const body: Record<string, unknown> = {
    contents: [{ parts }],
    generationConfig: {
      temperature: o.temperature ?? 0.4,
      maxOutputTokens: o.maxOutputTokens ?? 16384,
      ...(o.schema ? { responseMimeType: "application/json", responseSchema: o.schema } : {}),
    },
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 180000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal }
    );
    const d = await res.json().catch(() => ({}));
    if (d?.error) {
      const err = new Error(`${d.error.code}: ${String(d.error.message).slice(0, 160)}`);
      (err as Error & { code?: number }).code = d.error.code;
      throw err;
    }
    const cand = d?.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    if (!text) {
      // 길이 초과나 안전 필터로 본문이 비는 경우
      throw new Error(`빈 응답 (${cand?.finishReason ?? "unknown"})`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export async function gemini(parts: Part[], o: CallOpts = {}): Promise<string> {
  if (KEYS.length === 0) {
    throw new Error("AI 키가 설정되지 않았습니다. 배포 환경변수 GEMINI_API_KEY 를 추가해 주세요.");
  }
  let last: unknown;
  for (let attempt = 0; attempt < KEYS.length * 2; attempt++) {
    const key = KEYS[attempt % KEYS.length];
    try {
      return await once(parts, key, o);
    } catch (e) {
      last = e;
      const code = (e as Error & { code?: number }).code;
      // 429·503은 잠깐 쉬었다가 다시, 그 외 4xx는 바로 포기
      if (code && code !== 429 && code !== 500 && code !== 503) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw last instanceof Error ? last : new Error("AI 호출에 실패했습니다.");
}

/** JSON 스키마를 주고 결과를 파싱해서 돌려준다. */
export async function geminiJson<T>(parts: Part[], schema: unknown, o: CallOpts = {}): Promise<T> {
  const raw = await gemini(parts, { ...o, schema });
  try {
    return JSON.parse(raw) as T;
  } catch {
    // 드물게 코드펜스가 섞여 오는 경우를 걷어낸다
    const m = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("AI 응답을 읽지 못했습니다. 다시 시도해 주세요.");
  }
}
