// 채점 로직
// - KO→EN: 영어 철자 정확 일치 (대소문자/공백 무시)
// - EN→KO: 등록된 모든 한글 뜻 + 선생님이 인정한 추가 정답(alias) 중 하나와 일치하면 정답
//   posStrict=true  → 조사/어미까지 정확히 일치해야 정답 (거대한 ≠ 거대하다)
//   posStrict=false → 어간이 같으면 정답 (저학년용: 거대한 = 거대하다 = 거대)

const KO_ENDINGS = [
  "스러운", "스럽다", "스럽게",
  "적으로", "적인", "하게", "하다", "되다", "되는", "하는", "해서",
  "이다", "롭다", "로운", "롭게",
  "은", "는", "인", "한", "된", "될", "할", "히", "게", "이", "다",
];

export function normalizeEn(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9'\- ]/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeKo(s: string): string {
  // 공백/문장부호/괄호 주석 제거: "크다 (형용사)" → "크다"
  return s
    .replace(/\([^)]*\)/g, "")
    .replace(/[\s.,·~!?;:'"“”‘’\-]/g, "")
    .trim();
}

export function koStem(s: string): string {
  const n = normalizeKo(s);
  for (const end of KO_ENDINGS) {
    if (n.length > end.length + 0 && n.endsWith(end)) {
      const stem = n.slice(0, n.length - end.length);
      if (stem.length >= 1) return stem;
    }
  }
  return n;
}

export function gradeKoToEn(given: string, answer: string): boolean {
  return normalizeEn(given) === normalizeEn(answer) && normalizeEn(given).length > 0;
}

export function gradeEnToKo(given: string, meanings: string[], aliases: string[], posStrict: boolean): boolean {
  const g = normalizeKo(given);
  if (!g) return false;
  const candidates = [...meanings, ...aliases];
  // 1) 정확 일치는 항상 정답
  if (candidates.some((c) => normalizeKo(c) === g)) return true;
  if (posStrict) return false;
  // 2) 관대 채점: 어간 일치
  const gStem = koStem(given);
  return candidates.some((c) => koStem(c) === gStem && gStem.length >= 1);
}

// 발음 점수: 인식된 텍스트와 목표 단어의 유사도 × 인식 신뢰도
export function pronunciationScore(recognized: string, target: string, confidence: number): number {
  const r = normalizeEn(recognized);
  const t = normalizeEn(target);
  if (!r) return 0;
  if (r === t) return Math.round(100 * Math.max(confidence, 0.6));
  // 인식 결과가 여러 단어면 목표 단어 포함 여부 확인
  if (r.split(" ").includes(t)) return Math.round(95 * Math.max(confidence, 0.6));
  const sim = 1 - levenshtein(r, t) / Math.max(r.length, t.length);
  return Math.max(0, Math.round(sim * 85 * Math.max(confidence, 0.5)));
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[m][n];
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
