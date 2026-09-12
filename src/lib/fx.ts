"use client";

// 효과음 + 색종이 폭죽 — 파일 없이 브라우저 안에서 만든다.
// 학생 설정(localStorage "voca.fx")으로 끌 수 있다.

export function fxEnabled(): boolean {
  try { return localStorage.getItem("voca.fx") !== "off"; } catch { return true; }
}
export function setFxEnabled(on: boolean) {
  try { localStorage.setItem("voca.fx", on ? "on" : "off"); } catch { /* 무시 */ }
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(ac: AudioContext, freq: number, at: number, dur: number, type: OscillatorType = "sine", gain = 0.18) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(ac.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

export type Sfx = "correct" | "wrong" | "pass" | "fail" | "levelup" | "tap" | "badge";

/** 효과음 — correct: 딩동, wrong: 부저, pass: 팡파르, fail: 아쉬움, levelup: 상승음, badge: 반짝 */
export function sfx(kind: Sfx) {
  if (!fxEnabled()) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  switch (kind) {
    case "correct":
      tone(ac, 880, t, 0.12, "sine", 0.16);
      tone(ac, 1318, t + 0.1, 0.18, "sine", 0.16);
      break;
    case "wrong":
      tone(ac, 220, t, 0.18, "square", 0.08);
      tone(ac, 180, t + 0.15, 0.25, "square", 0.08);
      break;
    case "tap":
      tone(ac, 660, t, 0.06, "triangle", 0.08);
      break;
    case "pass":
      [523, 659, 784, 1046].forEach((f, i) => tone(ac, f, t + i * 0.11, 0.22, "triangle", 0.16));
      tone(ac, 1318, t + 0.5, 0.5, "sine", 0.14);
      break;
    case "fail":
      [392, 349, 311].forEach((f, i) => tone(ac, f, t + i * 0.18, 0.28, "sine", 0.12));
      break;
    case "levelup":
      [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(ac, f, t + i * 0.07, 0.16, "triangle", 0.14));
      tone(ac, 2093, t + 0.45, 0.6, "sine", 0.12);
      break;
    case "badge":
      [1568, 2093, 2637].forEach((f, i) => tone(ac, f, t + i * 0.08, 0.3, "sine", 0.1));
      break;
  }
}

/** 색종이 폭죽 — 화면 전체에 2.5초 */
export function confetti(opts: { count?: number; colors?: string[]; duration?: number } = {}) {
  if (!fxEnabled() || typeof document === "undefined") return;
  const count = opts.count ?? 160;
  const colors = opts.colors ?? ["#c9a227", "#16204a", "#f43f5e", "#22c55e", "#3b82f6", "#a855f7", "#fb923c", "#facc15"];
  const duration = opts.duration ?? 2600;

  const cv = document.createElement("canvas");
  cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999";
  document.body.appendChild(cv);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  const c = cv.getContext("2d")!;
  c.scale(dpr, dpr);

  type P = { x: number; y: number; vx: number; vy: number; w: number; h: number; r: number; vr: number; color: string; shape: number };
  const ps: P[] = Array.from({ length: count }, () => {
    const side = Math.random() < 0.5 ? -1 : 1;
    return {
      x: innerWidth / 2 + side * (Math.random() * innerWidth * 0.25),
      y: innerHeight * 0.55,
      vx: (Math.random() - 0.5) * 14 + side * 2,
      vy: -(8 + Math.random() * 12),
      w: 6 + Math.random() * 6, h: 4 + Math.random() * 6,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: Math.floor(Math.random() * 3),
    };
  });
  const start = performance.now();
  const tick = (now: number) => {
    const el = now - start;
    c.clearRect(0, 0, innerWidth, innerHeight);
    const fade = el > duration - 600 ? Math.max(0, (duration - el) / 600) : 1;
    for (const p of ps) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      c.save();
      c.globalAlpha = fade;
      c.translate(p.x, p.y); c.rotate(p.r);
      c.fillStyle = p.color;
      if (p.shape === 0) c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      else if (p.shape === 1) { c.beginPath(); c.arc(0, 0, p.w / 2.2, 0, Math.PI * 2); c.fill(); }
      else { c.beginPath(); c.moveTo(0, -p.h); c.lineTo(p.w / 2, p.h / 2); c.lineTo(-p.w / 2, p.h / 2); c.closePath(); c.fill(); }
      c.restore();
    }
    if (el < duration) requestAnimationFrame(tick);
    else cv.remove();
  };
  requestAnimationFrame(tick);
}

/** 가볍게 떨어지는 별 — 작은 정답 연출 */
export function sparkle(x?: number, y?: number) {
  if (!fxEnabled() || typeof document === "undefined") return;
  confetti({ count: 24, duration: 1100, colors: ["#facc15", "#c9a227", "#fde68a"] });
  void x; void y;
}
