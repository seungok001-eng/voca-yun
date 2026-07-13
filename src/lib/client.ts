"use client";

// 공통 fetch 헬퍼
export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "요청에 실패했습니다.");
  return data as T;
}

// 미국식 발음 TTS (Web Speech API)
let voicesCache: SpeechSynthesisVoice[] = [];
let cachedVoice: SpeechSynthesisVoice | null = null;

function pickUsVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  if (cachedVoice) return cachedVoice;
  if (voicesCache.length === 0) voicesCache = window.speechSynthesis.getVoices();
  const voices = voicesCache;
  const enUs = voices.filter((v) => v.lang === "en-US");
  const enAny = voices.filter((v) => v.lang.startsWith("en"));
  // 로컬(오프라인) 음성을 최우선 — 서버 왕복이 없어 버튼 즉시 재생.
  // 네트워크 음성(예: 크롬 "Google US English")은 첫 재생이 느려질 수 있어 후순위로.
  cachedVoice =
    enUs.find((v) => v.localService) ||
    enAny.find((v) => v.localService) ||
    enUs[0] ||
    enAny[0] ||
    null;
  return cachedVoice;
}

export function speak(text: string, rate = 0.95) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  const v = pickUsVoice();
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

// ─────────────────────────────────────────────
// 미리 생성된 음성 파일(Google Kore) 우선 재생, 없으면 Web Speech로 폴백
// 천천히 듣기: 같은 음원을 0.6배속(음정 유지)으로 재생
// ─────────────────────────────────────────────
export function audioUrlFor(
  levelOrder: number | null | undefined,
  no: number | null | undefined,
  kind: "word" | "ex"
): string | null {
  if (!levelOrder || !no) return null;
  return `/audio/l${levelOrder}/${no}${kind === "ex" ? "_ex" : ""}.mp3`;
}

let currentAudio: HTMLAudioElement | null = null;
function setPreservePitch(a: HTMLAudioElement) {
  const el = a as unknown as Record<string, unknown>;
  el.preservesPitch = true;
  el.mozPreservesPitch = true;
  el.webkitPreservesPitch = true;
}

// url이 있으면 음성 파일을, 실패하면 text를 Web Speech로 읽는다.
// 첫음 잘림 방지: 재생 전 오디오를 충분히 버퍼링(canplaythrough)한 뒤 재생 →
// 데이터가 준비된 상태에서 0초부터 재생돼 브라우저가 앞부분을 건너뛰지 않는다.
export function playClip(url: string | null | undefined, text: string, slow = false) {
  if (typeof window === "undefined") return;
  window.speechSynthesis?.cancel();
  if (currentAudio) { try { currentAudio.pause(); } catch { /* noop */ } currentAudio = null; }
  const fallback = () => speak(text, slow ? 0.6 : 0.95);
  if (!url) { fallback(); return; }
  const a = new Audio();
  setPreservePitch(a);
  a.playbackRate = slow ? 0.6 : 1;
  a.preload = "auto";
  a.onerror = fallback;
  currentAudio = a;
  let started = false;
  const start = () => {
    if (started || currentAudio !== a) return;
    started = true;
    a.play().catch(fallback);
  };
  // 완전 버퍼링되면 재생 (캐시된 경우 즉시 발생)
  a.addEventListener("canplaythrough", start, { once: true });
  // 안전장치: 이벤트가 안 뜨거나 지연되면 최대 400ms 후 강제 재생
  window.setTimeout(start, 400);
  a.src = url;
  a.load();
}

// 엔진 예열: 첫 발화 지연을 없애기 위해 앱 로드 직후 무음을 한 번 흘려보낸다.
let warmed = false;
export function warmUpSpeech() {
  if (warmed || typeof window === "undefined" || !window.speechSynthesis) return;
  warmed = true;
  pickUsVoice();
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  try { window.speechSynthesis.speak(u); } catch { /* noop */ }
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    voicesCache = window.speechSynthesis.getVoices();
    cachedVoice = null; // 음성 목록 갱신 시 재선택
  };
  voicesCache = window.speechSynthesis.getVoices();
  // 첫 사용자 제스처에서 엔진 예열 → 이후 버튼 클릭이 즉시 재생됨
  const warm = () => {
    warmUpSpeech();
    window.removeEventListener("pointerdown", warm);
  };
  window.addEventListener("pointerdown", warm, { once: true });
}

// 발음 인식 (Web Speech API SpeechRecognition)
type RecResult = { transcript: string; confidence: number };

export function speechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function recognizeOnce(timeoutMs = 6000): Promise<RecResult> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition || w.webkitSpeechRecognition) as
      | (new () => SpeechRecognitionLike)
      | undefined;
    if (!SR) return reject(new Error("이 브라우저는 음성 인식을 지원하지 않습니다. Chrome을 사용해 주세요."));
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        try { rec.stop(); } catch { /* noop */ }
        reject(new Error("음성이 인식되지 않았습니다. 다시 시도해 주세요."));
      }
    }, timeoutMs);
    rec.onresult = (e: SpeechRecognitionEventLike) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const alt = e.results[0][0];
      resolve({ transcript: alt.transcript, confidence: alt.confidence ?? 0.8 });
    };
    rec.onerror = (e: { error?: string }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(new Error(e.error === "not-allowed" ? "마이크 권한을 허용해 주세요." : "음성 인식에 실패했습니다. 다시 시도해 주세요."));
    };
    rec.onend = () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(new Error("음성이 인식되지 않았습니다. 다시 시도해 주세요."));
      }
    };
    rec.start();
  });
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionEventLike = {
  results: { [i: number]: { [j: number]: { transcript: string; confidence: number } } };
};

export const POS_KO: Record<string, string> = {
  n: "명사", v: "동사", adj: "형용사", adv: "부사", prep: "전치사",
  conj: "접속사", pron: "대명사", int: "감탄사", num: "수사", phrase: "숙어",
};
