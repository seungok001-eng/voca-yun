// AI 시험지 만들기 — 단어 / 문법 / 빈칸 채우기 / 영작
//
// 만드는 것: 학생용 문제지 + 교사용 정답지 + 교사용 해설지
// 난이도는 src/lib/exam-levels.ts 의 학년별 기준표를 그대로 지시문에 넣어 맞춘다.

import { geminiJson, FLASH, PRO, type Part } from "./gemini";
import { levelBrief, LEVEL_BY_CODE, CLOZE_BY_CODE } from "./exam-levels";
import { shuffle } from "./grading";

export type ExamKind = "VOCAB" | "GRAMMAR" | "CLOZE" | "COMPOSITION";

export type ExamQuestion = {
  no: number;
  prompt: string;        // 문제 본문 (영어 문장, 빈칸 번호 등)
  promptKo?: string;     // 학생에게 보여줄 한국어 (영작의 우리말 문장 등)
  choices?: string[];    // 객관식 보기
  answer: string;        // 정답
  explanation: string;   // 해설 (왜 그런지)
  points?: string[];     // 교사용 핵심 포인트
};

export type ExamPaper = {
  kind: ExamKind;
  title: string;
  levelLabel: string;
  instruction: string;                 // 문제지 상단 지시문
  passage?: string;                    // 빈칸 채우기 본문 ({{1}} 형태의 빈칸 표시 포함)
  passageKo?: string;                  // 본문 전체 번역 (해설지용)
  wordBank?: string[];                 // <보기> 낱말 상자
  questions: ExamQuestion[];
  teacherNotes: { heading: string; body: string }[];      // 해설지 지도 포인트
  vocabNotes: { word: string; meaning: string; note?: string }[]; // 중요 어휘 정리
};

const QUESTION_SCHEMA = {
  type: "OBJECT",
  properties: {
    no: { type: "INTEGER" },
    prompt: { type: "STRING" },
    promptKo: { type: "STRING" },
    choices: { type: "ARRAY", items: { type: "STRING" } },
    answer: { type: "STRING" },
    explanation: { type: "STRING" },
    points: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["no", "prompt", "answer", "explanation"],
};

const PAPER_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    instruction: { type: "STRING" },
    passage: { type: "STRING" },
    passageKo: { type: "STRING" },
    wordBank: { type: "ARRAY", items: { type: "STRING" } },
    questions: { type: "ARRAY", items: QUESTION_SCHEMA },
    teacherNotes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { heading: { type: "STRING" }, body: { type: "STRING" } },
        required: ["heading", "body"],
      },
    },
    vocabNotes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { word: { type: "STRING" }, meaning: { type: "STRING" }, note: { type: "STRING" } },
        required: ["word", "meaning"],
      },
    },
  },
  required: ["title", "instruction", "questions", "teacherNotes", "vocabNotes"],
};

// 해설지에 늘 요구하는 것 — 교사용 지도서처럼 쓰이게 한다
const TEACHER_RULES = `
해설(explanation)과 지도 포인트(teacherNotes)는 선생님이 그대로 보고 수업할 수 있게 쓴다.
- explanation: 정답인 이유를 문법 용어를 써서 한국어로 설명한다. 오답이 왜 틀렸는지도 짚는다. 2~4문장.
- points: 그 문항에서 짚어야 할 핵심(문법 규칙 이름, 함께 외울 표현, 학생이 자주 틀리는 지점)을 짧은 구로 1~3개.
- teacherNotes: 이 시험지 전체를 가르칠 때의 지도 포인트. heading은 문법·주제 이름, body는 규칙 설명과 예문, 학생이 흔히 하는 실수와 지도 요령을 담는다. 3~6개.
- vocabNotes: 시험지에 나온 중요 어휘·숙어를 정리한다. word는 영어, meaning은 한국어 뜻, note에는 품사·파생어·함께 쓰는 표현·헷갈리는 단어를 적는다. 8~20개.
모든 설명은 한국어로 쓴다.
`.trim();

function pickModel(quality?: string) {
  return quality === "PRO" ? PRO : FLASH;
}

const norm = (s: string) => s.replace(/[[\]]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * 객관식 보기가 지시문 안에도 그대로 딸려 오는 경우가 있어 잘라낸다.
 * (시험지에는 보기가 choices 로만 그려지므로 그대로 두면 두 번 나온다)
 */
function stripInlineChoices(prompt: string, choices?: string[]): string {
  const p = prompt.trim();
  if (!choices || choices.length < 2) return p;
  const first = norm(choices[0]);
  if (!first || !norm(p).includes(first)) return p;
  const m = /(?:[①]|(?:^|[\s.,;:!?])1[.)])\s*\S/.exec(p);
  if (!m || m.index === 0) return p;
  // 마커 앞의 문장부호는 지시문에 남긴다
  const keep = /[.,;:!?]/.test(p[m.index]) ? m.index + 1 : m.index;
  return p.slice(0, keep).trim();
}

function tidy(questions: ExamQuestion[]): ExamQuestion[] {
  return (questions ?? []).map((q, i) => ({
    ...q,
    no: i + 1,
    prompt: stripInlineChoices(q.prompt ?? "", q.choices),
    choices: q.choices?.length ? q.choices : undefined,
  }));
}

// 객관식·서술형 공통 서식 규칙 — 시험지가 깔끔하게 그려지도록
const FORMAT_RULES = `
문항 서식 규칙 (반드시 지킨다)
- prompt에는 문항 지시문과 본문만 넣는다. 보기(①②③④⑤ 또는 1. 2. 3.)를 prompt 안에 절대 넣지 마라.
  보기는 choices 배열에만 넣는다. 같은 내용을 두 곳에 쓰면 시험지에 두 번 찍힌다.
- choices의 각 항목에는 번호를 붙이지 마라. 내용만 쓴다. 번호는 시험지가 알아서 붙인다.
- 줄을 바꿔야 하는 곳에는 실제 줄바꿈(\\n)을 넣는다.
- 밑줄 칠 부분은 [ ] 로 감싼다.
- 빈칸은 __________ (밑줄 10개)로 표시한다.
- 낱말 <보기>를 주겠다고 썼으면 그 낱말을 prompt 안에 실제로 적어라. 주지 않을 거면 <보기>라는 말을 쓰지 마라.
- 빈칸 문제는 빈칸(__________)이 들어간 영어 문장을 prompt에 반드시 적는다. 문장 없이 지시문만 쓰면 학생이 풀 수 없다.
- 문장 전환·배열 문제는 바꿀 원래 문장이나 배열할 낱말들을 prompt에 반드시 적는다.
`.trim();

type Draft = Omit<ExamPaper, "kind" | "levelLabel">;

/** 학생이 풀 수 없는 문항이 섞여 있는지 확인한다. 문제가 있으면 그 목록을 돌려준다. */
function validate(d: Draft): string[] {
  const bad: string[] = [];
  if (!d.questions?.length) return ["문항이 하나도 없다"];
  d.questions.forEach((q, i) => {
    const p = q.prompt ?? "";
    const n = i + 1;
    if (!p.trim()) bad.push(`${n}번: prompt가 비어 있다`);
    if (/빈칸/.test(p) && !/_{3,}|\{\{\d+\}\}/.test(p) && !d.passage) bad.push(`${n}번: 빈칸 문제인데 빈칸이 든 문장이 없다`);
    if (/<보기>/.test(p) && !/<보기>\s*\S/.test(p)) bad.push(`${n}번: <보기>라고 썼는데 낱말이 없다`);
    if (/고르시오|고르세요/.test(p) && (!q.choices || q.choices.length < 3)) bad.push(`${n}번: 고르라고 했는데 choices가 없다`);
    if (/(바꾸시오|전환하시오|배열하시오|완성하시오)/.test(p) && p.replace(/[^A-Za-z]/g, "").length < 8) {
      bad.push(`${n}번: 바꾸거나 배열할 영어 문장·낱말이 prompt에 없다`);
    }
    if (!q.answer?.trim()) bad.push(`${n}번: answer가 비어 있다`);
  });
  return bad;
}

/** 만들고 → 검사하고 → 문제가 있으면 무엇이 잘못됐는지 알려주며 다시 만든다 (최대 2번) */
async function ask(parts: Part[], quality?: string): Promise<Draft> {
  let feedback = "";
  let last: Draft | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const p: Part[] = feedback ? [...parts, { text: feedback }] : parts;
    const d = await geminiJson<Draft>(p, PAPER_SCHEMA, {
      model: pickModel(quality),
      temperature: attempt === 0 ? 0.5 : 0.35,
      maxOutputTokens: 32768,
    });
    const bad = validate(d);
    if (bad.length === 0) return d;
    last = d;
    feedback = `\n\n이전 시도에서 아래 문항이 잘못 만들어졌다. 같은 실수를 하지 말고 전체를 다시 만들어라.\n- ${bad.join("\n- ")}`;
  }
  // 세 번 다 흠이 있으면 마지막 것을 쓰되, 문제 문항은 걸러낸다
  const bad = new Set(validate(last!).map((b) => Number(b.split("번")[0])));
  return { ...last!, questions: last!.questions.filter((_, i) => !bad.has(i + 1)) };
}

// ── 1) 단어 시험 ────────────────────────────────────────────────
// 뜻이 바뀌면 안 되므로 문항은 AI 없이 그대로 만들고,
// 예문 빈칸과 해설·어휘 정리만 AI에게 맡긴다.
export type WordPair = { text: string; meaning: string };
export type VocabMode = "EN_KO" | "KO_EN" | "CHOICE" | "SENTENCE" | "MIX";

export async function makeVocabPaper(opts: {
  words: WordPair[]; mode: VocabMode; count?: number; level: string; title?: string; quality?: string;
}): Promise<ExamPaper> {
  const level = LEVEL_BY_CODE.get(opts.level);
  const all = opts.words.filter((w) => w.text.trim() && w.meaning.trim());
  if (all.length < 2) throw new Error("단어가 2개 이상 필요합니다.");

  const count = Math.min(all.length, Math.max(1, opts.count || all.length));
  const picked = count < all.length ? shuffle(all).slice(0, count) : shuffle([...all]);

  // 예문 빈칸이 필요한 문항만 AI에게 예문을 받는다
  const needSentence = opts.mode === "SENTENCE" || opts.mode === "MIX";
  let sentences = new Map<string, { en: string; ko: string }>();
  if (needSentence) {
    const targets = opts.mode === "SENTENCE" ? picked : picked.filter((_, i) => i % 3 === 2);
    if (targets.length > 0) {
      const got = await geminiJson<{ items: { word: string; en: string; ko: string }[] }>(
        [{
          text: `아래 영어 낱말마다 예문을 하나씩 만들어라.

${levelBrief(opts.level)}

규칙
- 예문은 그 낱말의 주어진 뜻으로 쓰여야 한다.
- 위 학년 수준의 어휘와 문장 길이를 지킨다.
- en에는 낱말이 들어간 영어 문장을 그대로 쓴다 (빈칸을 만들지 마라).
- ko에는 그 문장의 한국어 번역을 쓴다.

낱말
${targets.map((w, i) => `${i + 1}. ${w.text} — ${w.meaning}`).join("\n")}`,
        }],
        {
          type: "OBJECT",
          properties: {
            items: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: { word: { type: "STRING" }, en: { type: "STRING" }, ko: { type: "STRING" } },
                required: ["word", "en", "ko"],
              },
            },
          },
          required: ["items"],
        },
        { model: pickModel(opts.quality), temperature: 0.6 }
      );
      sentences = new Map(got.items.map((x) => [x.word.trim().toLowerCase(), { en: x.en, ko: x.ko }]));
    }
  }

  const questions: ExamQuestion[] = picked.map((w, i) => {
    let mode = opts.mode;
    if (mode === "MIX") {
      const pool: VocabMode[] = ["EN_KO", "KO_EN"];
      if (sentences.has(w.text.trim().toLowerCase())) pool.push("SENTENCE");
      mode = pool[i % pool.length];
    }
    const base = { no: i + 1, points: [`${w.text} — ${w.meaning}`] };

    if (mode === "CHOICE") {
      const wrong = shuffle(all.filter((x) => x.meaning !== w.meaning)).slice(0, 3).map((x) => x.meaning);
      const choices = shuffle([w.meaning, ...wrong]);
      return {
        ...base, prompt: w.text, choices, answer: `${choices.indexOf(w.meaning) + 1}번 (${w.meaning})`,
        explanation: `${w.text}의 뜻은 '${w.meaning}'이다.`,
      };
    }
    if (mode === "SENTENCE") {
      const s = sentences.get(w.text.trim().toLowerCase());
      if (s) {
        const re = new RegExp(`\\b${w.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w*`, "i");
        return {
          ...base,
          prompt: s.en.replace(re, "__________"),
          promptKo: s.ko,
          answer: w.text,
          explanation: `빈칸에는 '${w.meaning}'을 뜻하는 ${w.text}가 들어간다. 전체 뜻: ${s.ko}`,
        };
      }
    }
    if (mode === "KO_EN") {
      return { ...base, prompt: w.meaning, answer: w.text, explanation: `'${w.meaning}'은 영어로 ${w.text}이다.` };
    }
    return { ...base, prompt: w.text, answer: w.meaning, explanation: `${w.text}의 뜻은 '${w.meaning}'이다.` };
  });

  // 해설지용 어휘 정리는 AI에게 받는다 (실패해도 시험지는 나오게 한다)
  let vocabNotes: ExamPaper["vocabNotes"] = picked.map((w) => ({ word: w.text, meaning: w.meaning }));
  let teacherNotes: ExamPaper["teacherNotes"] = [];
  try {
    const notes = await geminiJson<{ vocabNotes: ExamPaper["vocabNotes"]; teacherNotes: ExamPaper["teacherNotes"] }>(
      [{
        text: `아래 낱말들로 단어 시험을 봤다. 선생님이 수업할 때 쓸 어휘 정리와 지도 포인트를 만들어라.

${levelBrief(opts.level)}

${TEACHER_RULES}

vocabNotes에는 아래 낱말을 모두 넣고, meaning은 주어진 뜻을 그대로 쓴다.
teacherNotes에는 이 낱말들을 묶어서 가르치는 방법(주제별 묶음, 헷갈리는 짝, 파생어, 함께 쓰는 표현, 발음·철자 주의)을 3~5개 적는다.

낱말
${picked.map((w, i) => `${i + 1}. ${w.text} — ${w.meaning}`).join("\n")}`,
      }],
      {
        type: "OBJECT",
        properties: {
          vocabNotes: PAPER_SCHEMA.properties.vocabNotes,
          teacherNotes: PAPER_SCHEMA.properties.teacherNotes,
        },
        required: ["vocabNotes", "teacherNotes"],
      },
      { model: pickModel(opts.quality), temperature: 0.5 }
    );
    if (notes.vocabNotes?.length) vocabNotes = notes.vocabNotes;
    if (notes.teacherNotes?.length) teacherNotes = notes.teacherNotes;
  } catch { /* 해설이 없어도 시험지는 나온다 */ }

  const modeKo = { EN_KO: "뜻 쓰기", KO_EN: "영어로 쓰기", CHOICE: "4지선다", SENTENCE: "예문 빈칸", MIX: "혼합" }[opts.mode];
  return {
    kind: "VOCAB",
    title: opts.title?.trim() || `단어 시험 (${modeKo})`,
    levelLabel: level?.label ?? "",
    instruction: {
      EN_KO: "다음 단어의 뜻을 우리말로 쓰시오.",
      KO_EN: "다음 뜻에 해당하는 영어 단어를 쓰시오.",
      CHOICE: "다음 단어의 알맞은 뜻을 고르시오.",
      SENTENCE: "빈칸에 알맞은 단어를 쓰시오.",
      MIX: "각 문제의 지시에 따라 답을 쓰시오.",
    }[opts.mode],
    questions,
    teacherNotes,
    vocabNotes,
  };
}

// ── 2) 문법 시험 ────────────────────────────────────────────────
export async function makeGrammarPaper(opts: {
  topics: string; level: string; count: number; title?: string; quality?: string; extra?: string;
}): Promise<ExamPaper> {
  const level = LEVEL_BY_CODE.get(opts.level);
  const text = `너는 한국 중·고등학교 영어 교사이자 시중 영어 문제집의 문항 출제 위원이다.
아래 문법 항목으로 학교 시험과 문제집에 실제로 나오는 수준의 문항을 만들어라.

문법 항목: ${opts.topics}
문항 수: ${opts.count}개

${levelBrief(opts.level)}

출제 규칙
- 한국 학교 내신 시험과 시중 문제집에서 쓰는 문항 형태를 그대로 따른다.
- 문항 형태를 섞는다. 위 '문항 형태'에 적힌 것 안에서만 고른다.
- 객관식이면 choices에 보기를 넣고(초등 4개, 중등 이상 5개), answer는 "3번 (was going)"처럼 번호와 내용을 함께 쓴다.
- 서술형이면 choices를 아예 넣지 않는다.
- 서술형이면 choices를 비우고 answer에 모범답안을 쓴다. 조건(단어 수, 어형 변화)을 prompt에 분명히 적는다.
- 오답 보기는 학생이 실제로 헷갈리는 것으로 만든다. 눈에 띄게 엉뚱한 보기는 넣지 않는다.
- 같은 형태의 문항만 반복하지 말고, 쉬운 것에서 어려운 것 순으로 배열한다.

${FORMAT_RULES}

${TEACHER_RULES}

instruction에는 시험지 맨 위에 넣을 지시문을 한 줄 쓴다.
title에는 시험지 제목을 쓴다.`;
  const got = await ask([{ text }], opts.quality);
  return {
    ...got,
    kind: "GRAMMAR",
    title: opts.title?.trim() || got.title,
    levelLabel: level?.label ?? "",
    questions: tidy(got.questions),
  };
}

// ── 3) 빈칸 채우기 ──────────────────────────────────────────────
export async function makeClozePaper(opts: {
  passage: string; clozeLevel: string; level: string; title?: string; quality?: string;
}): Promise<ExamPaper> {
  const level = LEVEL_BY_CODE.get(opts.level);
  const cl = CLOZE_BY_CODE.get(opts.clozeLevel);
  if (!cl) throw new Error("빈칸 난이도를 선택하세요.");

  const text = `너는 한국 영어 교사다. 아래 영어 본문으로 빈칸 채우기 시험지를 만들어라.

난이도: ${cl.label} — 빈칸은 ${cl.rate} 정도로 만든다.
빈칸 기준: ${cl.target}

${levelBrief(opts.level)}

만드는 방법
- passage에는 본문을 그대로 두되, 빈칸으로 만들 낱말만 {{1}}, {{2}} … 로 바꿔 넣는다. 번호는 1부터 순서대로.
- 본문의 다른 부분은 한 글자도 바꾸지 마라. 문장을 줄이거나 늘리지 마라.
- 학습에 중요한 것만 빈칸으로 만든다: 핵심 어휘, 숙어·구동사, 그 학년에서 배우는 문법 요소.
  the·a·is 같은 것을 아무 데나 뚫지 마라. 뚫는다면 그 자리가 문법 학습 포인트일 때만 뚫는다.
- questions에는 빈칸마다 하나씩 넣는다. no는 빈칸 번호와 같게 한다.
  prompt에는 그 빈칸이 있는 문장을 빈칸 표시와 함께 쓴다. answer에는 들어갈 낱말을 쓴다.
  explanation에는 왜 그 낱말인지, 어떤 어휘·문법 포인트인지 한국어로 설명한다.
${cl.bank
      ? "- wordBank에 정답 낱말들을 뒤섞어 넣는다. 학생이 고르기 어렵게 오답 낱말 3~5개를 섞어 넣는다."
      : "- wordBank는 넣지 않는다. 학생이 스스로 떠올려 쓰게 한다."}
- passageKo에는 본문 전체의 한국어 번역을 자연스럽게 쓴다.

${FORMAT_RULES}

${TEACHER_RULES}

본문
"""
${opts.passage.trim()}
"""`;
  const got = await ask([{ text }], opts.quality);
  return {
    ...got,
    kind: "CLOZE",
    title: opts.title?.trim() || got.title,
    levelLabel: level ? `${level.label} · ${cl.label}` : cl.label,
  };
}

// ── 4) 영작 시험 ────────────────────────────────────────────────
export async function makeCompositionPaper(opts: {
  source: string; level: string; count?: number; hint?: boolean; title?: string; quality?: string;
}): Promise<ExamPaper> {
  const level = LEVEL_BY_CODE.get(opts.level);
  const text = `너는 한국 영어 교사다. 아래 자료로 영작 시험지를 만들어라.

${levelBrief(opts.level)}

자료는 한국어일 수도, 영어일 수도, 둘이 섞여 있을 수도 있다.
- 영어 문장이 있으면 그 문장을 모범답안(answer)으로 쓰고, 자연스러운 한국어 번역을 promptKo에 쓴다.
- 한국어만 있으면 그 학년 수준에 맞는 영어 문장을 만들어 answer에 쓴다.
${opts.count ? `- 문항은 ${opts.count}개로 만든다. 자료가 더 길면 학습에 중요한 문장을 골라 쓴다.` : "- 자료에 있는 문장을 모두 문항으로 만든다."}

문항 만드는 방법
- promptKo: 학생이 보는 우리말 문장. 이것만 보고 영어로 쓰게 한다.
- prompt: 조건을 적는다. 반드시 써야 할 단어, 단어 수, 사용할 문법(예: "현재완료를 사용할 것", "주어진 단어를 모두 사용할 것")을 한국어로 쓴다.
${opts.hint
      ? "  조건 뒤에 <보기>로 쓸 낱말들을 원형으로 제시한다. 어형은 학생이 바꾸게 한다."
      : "  낱말 <보기>는 주지 않는다."}
- answer: 모범답안 영어 문장. 자연스럽고 문법에 맞아야 한다.
- explanation: 이 문장에서 학생이 틀리기 쉬운 곳(어순, 시제, 관사, 전치사, 수일치)을 한국어로 짚는다.
  가능한 다른 정답 표현이 있으면 함께 적는다.
- 쉬운 문장부터 어려운 문장 순으로 배열한다.

${FORMAT_RULES}

${TEACHER_RULES}

자료
"""
${opts.source.trim()}
"""`;
  const got = await ask([{ text }], opts.quality);
  return {
    ...got,
    kind: "COMPOSITION",
    title: opts.title?.trim() || got.title,
    levelLabel: level?.label ?? "",
    questions: tidy(got.questions),
  };
}
