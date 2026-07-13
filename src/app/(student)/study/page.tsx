"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, playClip, audioUrlFor, POS_KO } from "@/lib/client";

type W = { id: number; no?: number; levelOrder?: number | null; text: string; pos: string; meanings: string[]; example?: string; exampleKo?: string; emoji?: string | null; defEn?: string | null };

// 단어/예문 음성 재생 헬퍼 (파일 우선, 폴백 TTS)
const sayWord = (w: W, slow = false) => playClip(audioUrlFor(w.levelOrder, w.no, "word"), w.text, slow);
const sayEx = (w: W, slow = false) => playClip(audioUrlFor(w.levelOrder, w.no, "ex"), w.example!, slow);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const MODES = [
  { key: "card", label: "카드 암기", icon: "🃏" },
  { key: "choice", label: "뜻 고르기", icon: "✅" },
  { key: "spell", label: "스펠링", icon: "⌨️" },
  { key: "listen", label: "받아쓰기", icon: "🎧" },
  { key: "match", label: "매칭 게임", icon: "🧩" },
] as const;

type ChunkData = { chunk: number; hasPrev: boolean; hasNext: boolean; words: W[] };

export default function StudyPage() {
  const [data, setData] = useState<ChunkData | null>(null);
  const [chunk, setChunk] = useState(0);
  const [mode, setMode] = useState<(typeof MODES)[number]["key"]>("card");

  useEffect(() => {
    setData(null);
    api<ChunkData>(`/api/student/study-words?chunk=${chunk}`).then(setData);
  }, [chunk]);

  if (!data) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;
  const words = data.words;
  if (words.length === 0)
    return (
      <div className="card p-8 text-center space-y-3">
        <p className="text-4xl">🎉</p>
        <p className="font-bold text-slate-600">이 분량에는 단어가 없어요!</p>
        {data.hasPrev && <button className="btn-ghost" onClick={() => setChunk(chunk - 1)}>← 이전 분량 보기</button>}
        <Link href="/home" className="btn-primary inline-block">홈으로</Link>
      </div>
    );

  const label = chunk === 0 ? "오늘의 단어" : chunk > 0 ? `미리 학습 (+${chunk}일 분량)` : `지난 분량 복습 (${chunk}일)`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-[#16204a]">{label} {words.length}개</h1>
        <Link href="/home" className="text-xs font-bold text-slate-400">← 홈</Link>
      </div>

      {/* 분량 이동 — 학습은 진도와 상관없이 자유롭게 */}
      <div className="flex items-center justify-between gap-2">
        <button className="btn-ghost !py-1.5 !px-3 text-xs" disabled={!data.hasPrev} onClick={() => setChunk(chunk - 1)}>
          ◀ 이전 분량
        </button>
        {chunk !== 0 && (
          <button className="chip bg-[#c9a227] text-white !py-1.5" onClick={() => setChunk(0)}>오늘 분량으로</button>
        )}
        <button className="btn-ghost !py-1.5 !px-3 text-xs" disabled={!data.hasNext} onClick={() => setChunk(chunk + 1)}>
          다음 분량 ▶
        </button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={
              "chip whitespace-nowrap !py-2 !px-3.5 transition-colors " +
              (mode === m.key ? "bg-[#16204a] text-white" : "bg-white text-slate-500 border border-slate-200")
            }
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>
      {mode === "card" && <FlashCards key={chunk} words={words} />}
      {mode === "choice" && <Choice key={chunk} words={words} />}
      {mode === "spell" && <Spelling key={chunk} words={words} />}
      {mode === "listen" && <Listening key={chunk} words={words} />}
      {mode === "match" && <Matching key={chunk} words={words} />}
    </div>
  );
}

/* ---------- 카드 암기 ---------- */
function FlashCards({ words }: { words: W[] }) {
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const w = words[i];
  useEffect(() => { setFlip(false); }, [i]);
  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setFlip(!flip)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setFlip(!flip)}
        className="card w-full min-h-64 p-6 flex flex-col items-center justify-center gap-3 select-none cursor-pointer"
      >
        {!flip ? (
          <>
            {w.emoji && <p className="text-6xl leading-none mb-1">{w.emoji}</p>}
            <span className="chip bg-slate-100 text-slate-500">{w.no && <span className="text-[#c9a227] mr-1">{w.no}번</span>}{POS_KO[w.pos] ?? w.pos}</span>
            <p className="text-4xl font-black text-[#16204a]">{w.text}</p>
            <p className="text-xs text-slate-400">카드를 눌러 뜻 확인</p>
          </>
        ) : (
          <>
            {w.emoji && <p className="text-5xl leading-none mb-1">{w.emoji}</p>}
            <p className="text-2xl font-black text-[color:var(--brand-gold)]">{w.meanings.join(", ")}</p>
            {w.defEn && (
              <p className="text-sm text-slate-500 text-center px-2">
                <span className="text-[10px] font-bold text-slate-400 mr-1">영영</span>{w.defEn}
              </p>
            )}
            {w.example && (
              <div className="text-center mt-2">
                <p className="text-sm text-slate-600 italic">
                  {w.example}
                  <button
                    className="ml-1.5 align-middle text-base"
                    onClick={(e) => { e.stopPropagation(); sayEx(w); }}
                    aria-label="예문 듣기"
                  >
                    🔊
                  </button>
                  <button
                    className="ml-1 align-middle text-sm"
                    onClick={(e) => { e.stopPropagation(); sayEx(w, true); }}
                    aria-label="예문 천천히 듣기"
                  >
                    🐢
                  </button>
                </p>
                <p className="text-xs text-slate-400 mt-1">{w.exampleKo}</p>
              </div>
            )}
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-gold" onClick={() => sayWord(w)}>🔊 단어</button>
        <button className="btn-ghost border border-slate-200" onClick={() => sayWord(w, true)}>🐢 단어 천천히</button>
        {w.example && <button className="btn-gold" onClick={() => sayEx(w)}>🔊 예문</button>}
        {w.example && <button className="btn-ghost border border-slate-200" onClick={() => sayEx(w, true)}>🐢 예문 천천히</button>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <button className="btn-ghost flex-1" disabled={i === 0} onClick={() => setI(i - 1)}>← 이전</button>
        <button className="btn-primary flex-1" disabled={i === words.length - 1} onClick={() => setI(i + 1)}>다음 →</button>
      </div>
      <p className="text-center text-xs font-bold text-slate-400">{i + 1} / {words.length}</p>
    </div>
  );
}

/* ---------- 뜻 고르기 (4지선다) ---------- */
function Choice({ words }: { words: W[] }) {
  const order = useMemo(() => shuffle(words), [words]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const w = order[i];
  const options = useMemo(() => {
    const others = shuffle(words.filter((x) => x.id !== w.id)).slice(0, 3).map((x) => x.meanings[0]);
    return shuffle([w.meanings[0], ...others]);
  }, [w, words]);
  const done = i >= order.length;
  if (done) return <Done label="뜻 고르기 완료!" />;
  return (
    <div className="card p-6 space-y-4">
      <p className="text-center text-xs font-bold text-slate-400">{i + 1} / {order.length}</p>
      <div className="text-center">
        {w.emoji && <p className="text-5xl leading-none mb-1">{w.emoji}</p>}
        <p className="text-3xl font-black text-[#16204a]">{w.text}</p>
        <button className="text-xs text-slate-400 mt-1" onClick={() => sayWord(w)}>🔊 발음 듣기</button>
      </div>
      <div className="grid gap-2">
        {options.map((opt) => {
          const isAnswer = opt === w.meanings[0];
          const cls =
            picked === null
              ? "btn-ghost"
              : isAnswer
                ? "btn-ghost !border-emerald-500 !bg-emerald-50 !text-emerald-700"
                : picked === opt
                  ? "btn-ghost !border-rose-400 !bg-rose-50 !text-rose-600"
                  : "btn-ghost opacity-50";
          return (
            <button key={opt} className={cls} disabled={picked !== null} onClick={() => setPicked(opt)}>
              {opt}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <button className="btn-primary w-full pop-in" onClick={() => { setPicked(null); setI(i + 1); }}>
          다음 →
        </button>
      )}
    </div>
  );
}

/* ---------- 스펠링 연습 ---------- */
function Spelling({ words }: { words: W[] }) {
  const order = useMemo(() => shuffle(words), [words]);
  const [i, setI] = useState(0);
  const [val, setVal] = useState("");
  const [state, setState] = useState<"idle" | "right" | "wrong">("idle");
  const w = order[i];
  if (i >= order.length) return <Done label="스펠링 연습 완료!" />;
  function check() {
    const ok = val.trim().toLowerCase() === w.text.toLowerCase();
    setState(ok ? "right" : "wrong");
    if (ok) sayWord(w);
  }
  return (
    <div className="card p-6 space-y-4">
      <p className="text-center text-xs font-bold text-slate-400">{i + 1} / {order.length}</p>
      <div className="text-center">
        {w.emoji && <p className="text-5xl leading-none mb-1">{w.emoji}</p>}
        <span className="chip bg-slate-100 text-slate-500">{POS_KO[w.pos] ?? w.pos}</span>
        <p className="text-2xl font-black text-[color:var(--brand-gold)] mt-2">{w.meanings.join(", ")}</p>
        <p className="text-xs text-slate-400 mt-1">영어 단어를 입력하세요 ({w.text.length}글자)</p>
      </div>
      <input
        className={"input text-center text-lg font-bold " + (state === "wrong" ? "shake !border-rose-400" : "")}
        value={val}
        onChange={(e) => { setVal(e.target.value); setState("idle"); }}
        onKeyDown={(e) => e.key === "Enter" && (state === "right" ? next() : check())}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      {state === "right" && <p className="text-center text-emerald-600 font-black pop-in">⭕ 정답! {w.text}</p>}
      {state === "wrong" && <p className="text-center text-rose-500 font-bold text-sm">다시 시도해 보세요 (힌트: {w.text[0]}...)</p>}
      {state === "right" ? (
        <button className="btn-primary w-full" onClick={next}>다음 →</button>
      ) : (
        <button className="btn-primary w-full" onClick={check}>확인</button>
      )}
    </div>
  );
  function next() { setVal(""); setState("idle"); setI(i + 1); }
}

/* ---------- 받아쓰기 (듣고 쓰기) ---------- */
function Listening({ words }: { words: W[] }) {
  const order = useMemo(() => shuffle(words), [words]);
  const [i, setI] = useState(0);
  const [val, setVal] = useState("");
  const [state, setState] = useState<"idle" | "right" | "wrong">("idle");
  const w = order[i];
  useEffect(() => { if (w) setTimeout(() => sayWord(w), 400); }, [w]);
  if (i >= order.length) return <Done label="받아쓰기 완료!" />;
  function check() {
    const ok = val.trim().toLowerCase() === w.text.toLowerCase();
    setState(ok ? "right" : "wrong");
  }
  return (
    <div className="card p-6 space-y-4">
      <p className="text-center text-xs font-bold text-slate-400">{i + 1} / {order.length}</p>
      <div className="text-center space-y-2">
        <div className="flex justify-center gap-2">
          <button className="btn-gold" onClick={() => sayWord(w)}>🔊 다시 듣기</button>
          <button className="btn-ghost border border-slate-200" onClick={() => sayWord(w, true)}>🐢 천천히</button>
        </div>
        <p className="text-xs text-slate-400">들리는 단어를 입력하세요</p>
      </div>
      <input
        className={"input text-center text-lg font-bold " + (state === "wrong" ? "shake !border-rose-400" : "")}
        value={val}
        onChange={(e) => { setVal(e.target.value); setState("idle"); }}
        onKeyDown={(e) => e.key === "Enter" && (state === "right" ? next() : check())}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      {state === "right" && (
        <p className="text-center text-emerald-600 font-black pop-in">⭕ {w.text} — {w.meanings.join(", ")}</p>
      )}
      {state === "wrong" && <p className="text-center text-rose-500 font-bold text-sm">다시 들어보세요!</p>}
      {state === "right" ? (
        <button className="btn-primary w-full" onClick={next}>다음 →</button>
      ) : (
        <button className="btn-primary w-full" onClick={check}>확인</button>
      )}
    </div>
  );
  function next() { setVal(""); setState("idle"); setI(i + 1); }
}

/* ---------- 매칭 게임 ---------- */
function Matching({ words }: { words: W[] }) {
  const [round, setRound] = useState(0);
  const pool = useMemo(() => shuffle(words).slice(round * 6, round * 6 + 6), [words, round]);
  const [left, setLeft] = useState<W[]>([]);
  const [right, setRight] = useState<W[]>([]);
  const [selL, setSelL] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrongPair, setWrongPair] = useState<number | null>(null);

  useEffect(() => {
    setLeft(shuffle(pool));
    setRight(shuffle(pool));
    setMatched(new Set());
    setSelL(null);
  }, [pool]);

  if (pool.length === 0) return <Done label="매칭 게임 완료!" />;
  const allDone = matched.size === pool.length && pool.length > 0;

  function pickRight(w: W) {
    if (selL === null) return;
    if (selL === w.id) {
      const next = new Set(matched);
      next.add(w.id);
      setMatched(next);
      setSelL(null);
    } else {
      setWrongPair(w.id);
      setTimeout(() => setWrongPair(null), 400);
      setSelL(null);
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <p className="text-center text-xs font-bold text-slate-400">
        라운드 {round + 1} — 짝을 맞추세요 ({matched.size}/{pool.length})
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          {left.map((w) => (
            <button
              key={w.id}
              disabled={matched.has(w.id)}
              onClick={() => setSelL(w.id)}
              className={
                "w-full rounded-xl border-2 p-2.5 text-sm font-bold transition-all " +
                (matched.has(w.id)
                  ? "opacity-25 border-emerald-200 bg-emerald-50"
                  : selL === w.id
                    ? "border-[#16204a] bg-indigo-50 text-[#16204a]"
                    : "border-slate-200 bg-white text-slate-700")
              }
            >
              {w.text}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {right.map((w) => (
            <button
              key={w.id}
              disabled={matched.has(w.id)}
              onClick={() => pickRight(w)}
              className={
                "w-full rounded-xl border-2 p-2.5 text-xs font-bold transition-all " +
                (matched.has(w.id)
                  ? "opacity-25 border-emerald-200 bg-emerald-50"
                  : wrongPair === w.id
                    ? "shake border-rose-400 bg-rose-50"
                    : "border-slate-200 bg-white text-slate-600")
              }
            >
              {w.meanings[0]}
            </button>
          ))}
        </div>
      </div>
      {allDone && (
        <button className="btn-primary w-full pop-in" onClick={() => setRound(round + 1)}>
          다음 라운드 →
        </button>
      )}
    </div>
  );
}

function Done({ label }: { label: string }) {
  return (
    <div className="card p-8 text-center space-y-3">
      <p className="text-4xl">🎉</p>
      <p className="font-black text-[#16204a]">{label}</p>
      <Link href="/home" className="btn-primary inline-block">홈으로 가서 시험 보기</Link>
    </div>
  );
}
