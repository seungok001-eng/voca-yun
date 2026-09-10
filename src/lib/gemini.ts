// Gemini 텍스트·이미지 호출 (서버 전용)
//
// 키를 찾는 순서
//  1) 배포 환경변수 GEMINI_API_KEY (또는 GEMINI_KEYS 에 쉼표로 여러 개)
//  2) 총관리자가 화면(AI 시험지 → AI 키 설정)에서 넣어 DB에 저장한 키
// 여러 개면 한도가 걸릴 때 다음 키로 넘어간다.

import { db } from "./db";

export const FLASH = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
export const PRO = process.env.GEMINI_PRO_MODEL || "gemini-2.5-pro";

const ENV_KEYS = [
  ...(process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY] : []),
  ...(process.env.GEMINI_KEYS || "").split(",").map((k) => k.trim()).filter(Boolean),
];

// DB 키는 1분 동안 기억해 두고 쓴다 (요청마다 DB를 읽지 않게)
let cache: { keys: string[]; at: number } | null = null;
export function invalidateKeyCache() { cache = null; }

async function loadKeys(): Promise<string[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.keys;
  let dbKey = "";
  try {
    const row = await db.appSetting.findUnique({ where: { key: "gemini_api_key" } });
    dbKey = row?.value?.trim() ?? "";
  } catch { /* 테이블이 아직 없거나 DB 오류 — 환경변수만 쓴다 */ }
  const keys = [...new Set([...ENV_KEYS, ...(dbKey ? [dbKey] : [])])];
  cache = { keys, at: Date.now() };
  return keys;
}

export async function geminiReady() {
  return (await loadKeys()).length > 0;
}

export type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

type CallOpts = {
  model?: string;
  schema?: unknown;      // JSON 스키마를 주면 JSON만 돌려받는다
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  keys?: string[];       // 특정 키로만 부를 때 (키 검증용)
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
    if (!text) throw new Error(`빈 응답 (${cand?.finishReason ?? "unknown"})`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export async function gemini(parts: Part[], o: CallOpts = {}): Promise<string> {
  const keys = o.keys?.length ? o.keys : await loadKeys();
  if (keys.length === 0) {
    throw new Error("AI 키가 설정되지 않았습니다. 총관리자가 'AI 시험지 → AI 키 설정'에서 Gemini 키를 넣어 주세요.");
  }
  let last: unknown;
  for (let attempt = 0; attempt < keys.length * 2; attempt++) {
    const key = keys[attempt % keys.length];
    try {
      return await once(parts, key, o);
    } catch (e) {
      last = e;
      const code = (e as Error & { code?: number }).code;
      // 429·5xx는 잠깐 쉬었다가 다시, 그 외 4xx는 바로 포기
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
    const m = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("AI 응답을 읽지 못했습니다. 다시 시도해 주세요.");
  }
}
