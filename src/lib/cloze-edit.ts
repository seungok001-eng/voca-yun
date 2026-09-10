// 빈칸 채우기 편집 — 본문을 낱말 단위로 쪼개고, 빈칸을 넣고 빼고, 다시 합친다.
//
// 본문 형식: "Emperor penguins {{1}} in Antarctica, the {{2}} place."
//   {{n}} 자리에 들어갈 정답은 questions[n-1].answer 에 있다.
// 편집할 때는 {{n}}을 정답 낱말로 되돌려 낱말 목록(tokens)으로 만들고,
// 어느 낱말이 빈칸인지(blanks)만 따로 들고 있다가 저장할 때 다시 {{n}} 형식으로 합친다.

export type Token = {
  lead: string;  // 앞 문장부호  ("  (
  core: string;  // 낱말 자체 — 이것만 빈칸이 될 수 있다
  trail: string; // 뒤 문장부호  ,  .  ."  )
  ws: string;    // 뒤 공백 (줄바꿈 포함)
};
export type Blank = { start: number; end: number }; // tokens[start..end) 가 빈칸 하나

const MARK = /\{\{(\d+)\}\}/;

function splitPunct(text: string): Pick<Token, "lead" | "core" | "trail"> {
  const m = /^([^\p{L}\p{N}]*)([\p{L}\p{N}][\s\S]*?[\p{L}\p{N}]|[\p{L}\p{N}])?([^\p{L}\p{N}]*)$/u.exec(text);
  if (!m) return { lead: "", core: text, trail: "" };
  return { lead: m[1] ?? "", core: m[2] ?? "", trail: m[3] ?? "" };
}

/** {{n}} 이 든 본문 + 정답 목록 → 낱말 목록과 빈칸 위치 */
export function parseCloze(passage: string, answers: Map<number, string>): { tokens: Token[]; blanks: Blank[] } {
  const tokens: Token[] = [];
  const blanks: Blank[] = [];
  const re = /(\S+)(\s*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(passage))) {
    const [, chunk, ws] = m;
    const mk = MARK.exec(chunk);
    if (!mk) {
      tokens.push({ ...splitPunct(chunk), ws });
      continue;
    }
    // 빈칸 표시가 든 덩어리: 앞뒤 문장부호를 떼고 정답 낱말들로 바꿔 넣는다
    const n = Number(mk[1]);
    const lead = chunk.slice(0, mk.index);
    const trail = chunk.slice(mk.index + mk[0].length);
    const words = (answers.get(n) ?? "").trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) words.push("?");
    const start = tokens.length;
    words.forEach((w, i) => {
      const last = i === words.length - 1;
      tokens.push({
        lead: i === 0 ? lead : "",
        core: w,
        trail: last ? trail : "",
        ws: last ? ws : " ",
      });
    });
    blanks.push({ start, end: tokens.length });
  }
  return { tokens, blanks };
}

/** 낱말 목록 + 빈칸 위치 → {{n}} 이 든 본문과 정답 목록 (빈칸 순서대로 번호를 다시 매긴다) */
export function buildCloze(tokens: Token[], blanks: Blank[]): { passage: string; answers: string[] } {
  const sorted = [...blanks].sort((a, b) => a.start - b.start);
  const answers: string[] = [];
  let out = "";
  let i = 0;
  let bi = 0;
  while (i < tokens.length) {
    const b = sorted[bi];
    if (b && b.start === i) {
      const part = tokens.slice(b.start, b.end);
      answers.push(part.map((t) => t.core).join(" "));
      out += part[0].lead + `{{${answers.length}}}` + part[part.length - 1].trail + part[part.length - 1].ws;
      i = b.end;
      bi++;
      continue;
    }
    const t = tokens[i];
    out += t.lead + t.core + t.trail + t.ws;
    i++;
  }
  return { passage: out.trimEnd(), answers };
}

/** 그 빈칸이 든 문장만 뽑아 빈칸을 ____ 로 바꿔 돌려준다 (문항 prompt 용) */
export function sentenceOf(tokens: Token[], blank: Blank): string {
  const ends = (t: Token) => /[.!?]/.test(t.trail) || /\n/.test(t.ws);
  let s = blank.start;
  while (s > 0 && !ends(tokens[s - 1])) s--;
  let e = blank.end - 1;
  while (e < tokens.length - 1 && !ends(tokens[e])) e++;
  let out = "";
  for (let i = s; i <= e; i++) {
    const t = tokens[i];
    if (i === blank.start) {
      const last = tokens[blank.end - 1];
      out += t.lead + "__________" + last.trail + last.ws;
      i = blank.end - 1;
      continue;
    }
    out += t.lead + t.core + t.trail + t.ws;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** 이 낱말이 어느 빈칸에 속하는지 (없으면 -1) */
export function blankAt(blanks: Blank[], i: number): number {
  return blanks.findIndex((b) => i >= b.start && i < b.end);
}
