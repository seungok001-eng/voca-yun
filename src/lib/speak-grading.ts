// 문장 말하기 채점 — 브라우저 음성인식(무료) 결과를 정답 문장과 비교한다.
// 음소(발음) 채점이 아니라 "어떤 단어가 제대로 전달됐는가"를 본다:
//   일치율(%) = 정답 문장의 단어 중 순서대로 인식된 단어 비율
//   피드백    = 인식되지 않았거나 다르게 들린 단어 목록
// 축약형("I'm"↔"I am")·숫자("2"↔"two")는 같은 말로 취급해 억울한 오답을 막는다.

const CONTRACTIONS: Record<string, string> = {
  "i'm": "i am", "it's": "it is", "that's": "that is", "what's": "what is",
  "where's": "where is", "who's": "who is", "how's": "how is", "there's": "there is",
  "he's": "he is", "she's": "she is", "let's": "let us",
  "we're": "we are", "you're": "you are", "they're": "they are",
  "i've": "i have", "we've": "we have", "you've": "you have", "they've": "they have",
  "i'll": "i will", "we'll": "we will", "you'll": "you will", "he'll": "he will",
  "she'll": "she will", "they'll": "they will", "it'll": "it will",
  "i'd": "i would", "we'd": "we would", "you'd": "you would", "he'd": "he would",
  "she'd": "she would", "they'd": "they would",
  "don't": "do not", "doesn't": "does not", "didn't": "did not",
  "isn't": "is not", "aren't": "are not", "wasn't": "was not", "weren't": "were not",
  "can't": "can not", "cannot": "can not", "won't": "will not", "wouldn't": "would not",
  "couldn't": "could not", "shouldn't": "should not", "mustn't": "must not",
  "haven't": "have not", "hasn't": "has not", "hadn't": "had not",
};

const NUMBERS: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
  "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten",
  "11": "eleven", "12": "twelve", "13": "thirteen", "14": "fourteen", "15": "fifteen",
  "16": "sixteen", "17": "seventeen", "18": "eighteen", "19": "nineteen", "20": "twenty",
  "30": "thirty", "40": "forty", "50": "fifty", "60": "sixty", "70": "seventy",
  "80": "eighty", "90": "ninety", "100": "hundred", "1000": "thousand",
};

// 문장을 비교 가능한 단어 배열로 변환
export function tokenizeSentence(s: string): string[] {
  let t = s.toLowerCase();
  // 유니코드 아포스트로피를 표준화 (’ → ')
  t = t.replace(/[‘’ʼ]/g, "'");
  // 축약형 펼치기 (단어 경계 기준)
  t = t.replace(/[a-z]+'[a-z]+|cannot/g, (m) => CONTRACTIONS[m] ?? m);
  // 문장부호 제거 (아포스트로피는 위에서 처리됨)
  t = t.replace(/[^a-z0-9\s'-]/g, " ");
  return t
    .split(/[\s]+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter(Boolean)
    .map((w) => NUMBERS[w] ?? w);
}

// 순서를 지키며 일치하는 단어 찾기 (최장 공통 부분수열)
// 반환: 정답 단어 배열에서 인식된 인덱스 집합
function matchedIndices(target: string[], said: string[]): Set<number> {
  const n = target.length, m = said.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = target[i - 1] === said[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const hit = new Set<number>();
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (target[i - 1] === said[j - 1]) { hit.add(i - 1); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--;
    else j--;
  }
  return hit;
}

export type SpeakResult = {
  score: number; // 일치율 0~100
  passed: boolean;
  missed: string[]; // 제대로 전달되지 않은 단어들
  matchedAnswer: string; // 채점에 쓰인 정답(허용답안 중 가장 높은 점수)
  feedback: string; // 학생에게 보여줄 한 줄 안내
};

// 하나의 정답 문장에 대한 채점
function gradeOne(recognized: string, answer: string): { score: number; missed: string[] } {
  const target = tokenizeSentence(answer);
  const said = tokenizeSentence(recognized);
  if (target.length === 0) return { score: 0, missed: [] };
  if (said.length === 0) return { score: 0, missed: [...target] };
  const hit = matchedIndices(target, said);
  const score = Math.round((hit.size / target.length) * 100);
  const missed = target.filter((_, i) => !hit.has(i));
  return { score, missed };
}

// 허용 답안이 여러 개면 가장 높은 점수를 채택한다.
export function gradeSpeech(
  recognized: string,
  answers: string[],
  matchRate: number
): SpeakResult {
  const candidates = answers.map((a) => a.trim()).filter(Boolean);
  if (candidates.length === 0) {
    return { score: 0, passed: false, missed: [], matchedAnswer: "", feedback: "정답 문장이 없습니다." };
  }
  let best = { score: -1, missed: [] as string[], answer: candidates[0] };
  for (const a of candidates) {
    const r = gradeOne(recognized, a);
    if (r.score > best.score) best = { score: r.score, missed: r.missed, answer: a };
  }
  const passed = best.score >= matchRate;
  return {
    score: best.score,
    passed,
    missed: best.missed,
    matchedAnswer: best.answer,
    feedback: buildFeedback(recognized, best.score, best.missed, passed),
  };
}

// 통과 여부와 무관하게, 어떤 부분이 불완전했는지 짧게 알려준다.
function buildFeedback(recognized: string, score: number, missed: string[], passed: boolean): string {
  if (!recognized.trim()) return "소리가 인식되지 않았어요. 마이크에 가까이서 또렷하게 말해 주세요.";
  if (missed.length === 0) return passed ? "완벽해요! 모든 단어가 또렷하게 들렸어요. 👏" : "다시 한 번 말해 볼까요?";
  const list = missed.slice(0, 4).map((w) => `‘${w}’`).join(", ");
  const more = missed.length > 4 ? ` 외 ${missed.length - 4}개` : "";
  if (passed) return `통과! 다만 ${list}${more} 는 잘 안 들렸어요. 다음엔 또렷하게 발음해 보세요.`;
  if (score === 0) return `${list}${more} 를 포함해 문장 전체가 잘 전달되지 않았어요. 천천히 다시 말해 보세요.`;
  return `${list}${more} 부분이 정확하지 않았어요. 이 단어들을 또렷하게 다시 말해 보세요.`;
}

// 대답 허용 답안 파싱: "I'm great. | I am great" → ["I'm great.", "I am great"]
export function parseAlts(text: string, altsJson: string | null): string[] {
  const alts: string[] = [];
  if (altsJson) {
    try {
      const parsed = JSON.parse(altsJson);
      if (Array.isArray(parsed)) alts.push(...parsed.map(String));
    } catch { /* 잘못된 JSON은 무시 */ }
  }
  return [text, ...alts];
}
