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

// 오디오 하드웨어를 계속 깨워두기 — 아무 소리도 없을 때 첫 재생 시 장치가
// 깨어나며 앞부분(첫음)이 잘리는 문제 방지. 거의 무음 오실레이터를 상시 흘려보낸다.
let audioCtx: AudioContext | null = null;
export function keepAudioAwake() {
  if (typeof window === "undefined") return;
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.0002; // 사실상 무음, 파이프라인 유지용
      osc.frequency.value = 30;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
  } catch { /* noop */ }
}

// 재생 중인 것 정리 (Web Audio 소스 + HTMLAudio + Web Speech)
let currentSource: AudioBufferSourceNode | null = null;
const bufferCache = new Map<string, AudioBuffer>();
let playToken = 0;
function stopCurrent() {
  window.speechSynthesis?.cancel();
  if (currentAudio) { try { currentAudio.pause(); } catch { /* noop */ } currentAudio = null; }
  if (currentSource) { try { currentSource.stop(); } catch { /* noop */ } currentSource = null; }
}

// 보통 속도: Web Audio로 재생 (샘플 단위 정확 시작 → 첫음 잘림 없음, 캐시로 반복 재생 즉시)
async function playViaWebAudio(url: string, token: number, fallback: () => void) {
  try {
    keepAudioAwake();
    if (!audioCtx) { fallback(); return; }
    let buf = bufferCache.get(url);
    if (!buf) {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("fetch failed");
      buf = await audioCtx.decodeAudioData(await resp.arrayBuffer());
      bufferCache.set(url, buf);
    }
    if (token !== playToken) return; // 그 사이 다른 재생 요청됨
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    stopCurrent();
    currentSource = src;
    src.start();
  } catch {
    if (token === playToken) fallback();
  }
}

// url이 있으면 음성 파일을, 실패하면 text를 Web Speech로 읽는다.
// 보통 속도 = Web Audio(첫음 잘림 없음), 천천히 = HTMLAudio(음정 유지).
export function playClip(url: string | null | undefined, text: string, slow = false) {
  if (typeof window === "undefined") return;
  const token = ++playToken;
  keepAudioAwake();
  const fallback = () => { if (token === playToken) speak(text, slow ? 0.6 : 0.95); };
  if (!url) { stopCurrent(); fallback(); return; }
  if (slow) {
    // 천천히 = HTMLAudio (0.6배속, 음정 유지)
    stopCurrent();
    const a = new Audio();
    setPreservePitch(a);
    a.playbackRate = 0.6;
    a.preload = "auto";
    a.onerror = fallback;
    currentAudio = a;
    let started = false;
    const start = () => { if (started || currentAudio !== a) return; started = true; a.play().catch(fallback); };
    a.addEventListener("canplaythrough", start, { once: true });
    window.setTimeout(start, 400);
    a.src = url;
    a.load();
  } else {
    // 보통 = Web Audio
    void playViaWebAudio(url, token, fallback);
  }
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
    keepAudioAwake(); // 오디오 장치 상시 깨우기 시작
    window.removeEventListener("pointerdown", warm);
  };
  window.addEventListener("pointerdown", warm, { once: true });
}

// speechSynthesis가 없는 환경에서도 오디오 장치는 깨워둔다
if (typeof window !== "undefined" && !window.speechSynthesis) {
  const warmA = () => { keepAudioAwake(); window.removeEventListener("pointerdown", warmA); };
  window.addEventListener("pointerdown", warmA, { once: true });
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
