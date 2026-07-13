"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, speak, recognizeOnce, speechRecognitionSupported, POS_KO } from "@/lib/client";

type Question = { dir: "KO_TO_EN" | "EN_TO_KO"; prompt: string; pos: string; wordId: number };
type TestState = {
  sessionId: number;
  kind: string;
  status: string;
  total: number;
  currentIndex: number;
  wrongCount: number;
  failThreshold: number;
  pronEnabled: boolean;
  pronThreshold: number;
  attemptNo: number;
  question: Question | null;
  phase?: "ANSWER" | "PRON";
  pronTarget?: string;
};
type Reveal = { word: string; meanings: string[]; pos: string; emoji?: string | null };
type AnswerRes = {
  textCorrect: boolean; needPron: boolean; correct?: boolean; reveal: Reveal;
  pronTarget?: string; finished?: boolean; status?: string;
};
type PronRes = {
  pronScore: number; pronPassed: boolean; threshold: number; correct: boolean;
  reveal: Reveal; finished?: boolean; status?: string;
};

const KIND_KO: Record<string, string> = {
  DAILY: "오늘의 단어시험", RETEST: "재시험", WRONG_NOTE: "오답노트 시험", REVIEW: "누적 복습시험",
};

export default function TestPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<TestState | null>(null);
  const [given, setGiven] = useState("");
  const [feedback, setFeedback] = useState<{
    correct: boolean; reveal: Reveal; given: string; pronScore?: number; threshold?: number;
    finished?: boolean; status?: string;
  } | null>(null);
  const [pronMode, setPronMode] = useState<{ target: string; tries: number; listening: boolean; lastMsg?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const s = await api<TestState>(`/api/test/${id}`);
    setState(s);
    if (s.status !== "IN_PROGRESS") {
      router.replace(`/result/${id}`);
      return;
    }
    if (s.phase === "PRON" && s.pronTarget) {
      setPronMode({ target: s.pronTarget, tries: 0, listening: false });
    }
    if (s.question?.dir === "EN_TO_KO") setTimeout(() => speak(s.question!.prompt), 300);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  // 부정행위 감지: 탭 전환/앱 이탈
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        navigator.sendBeacon?.(
          `/api/test/${id}/event`,
          new Blob([JSON.stringify({ type: "HIDDEN" })], { type: "application/json" })
        );
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [id]);

  async function submitAnswer() {
    if (!state?.question || submitting) return;
    setSubmitting(true);
    try {
      const res = await api<AnswerRes>(`/api/test/${id}/answer`, {
        method: "POST",
        body: JSON.stringify({ given }),
      });
      if (res.needPron) {
        setPronMode({ target: res.pronTarget!, tries: 0, listening: false });
        speak(res.pronTarget!);
      } else {
        setFeedback({
          correct: !!res.correct, reveal: res.reveal, given,
          finished: res.finished, status: res.status,
        });
        if (res.correct) speak(res.reveal.word);
      }
      setGiven("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "제출 실패");
    } finally {
      setSubmitting(false);
    }
  }

  async function doPron() {
    if (!pronMode || pronMode.listening) return;
    setPronMode({ ...pronMode, listening: true, lastMsg: undefined });
    try {
      const rec = await recognizeOnce();
      const res = await api<PronRes>(`/api/test/${id}/pron`, {
        method: "POST",
        body: JSON.stringify({ recognized: rec.transcript, confidence: rec.confidence }),
      });
      setPronMode(null);
      setFeedback({
        correct: res.correct, reveal: res.reveal, given: rec.transcript,
        pronScore: res.pronScore, threshold: res.threshold,
        finished: res.finished, status: res.status,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "인식 실패";
      setPronMode((p) => p && { ...p, listening: false, tries: p.tries + 1, lastMsg: msg });
    }
  }

  async function next() {
    if (feedback?.finished) {
      router.replace(`/result/${id}`);
      return;
    }
    setFeedback(null);
    await load();
  }

  if (!state) return <p className="text-slate-400 text-center py-20">시험 준비 중...</p>;

  const progress = Math.round((state.currentIndex / state.total) * 100);
  const livesLeft = Math.max(0, state.failThreshold - state.wrongCount);

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      {/* 상단 진행 바 */}
      <div className="card p-4">
        <div className="flex items-center justify-between text-xs font-bold mb-2">
          <span className="text-[#16204a]">{KIND_KO[state.kind] ?? "시험"}{state.attemptNo > 1 ? ` · ${state.attemptNo}차` : ""}</span>
          <span className="text-slate-400">{Math.min(state.currentIndex + 1, state.total)} / {state.total}</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#2a3c7d] to-[#c9a227] transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between items-center mt-2">
          <p className="text-[11px] text-slate-400">틀리면 처음부터 재시험! 신중하게 ✍️</p>
          <p className="text-xs font-black">
            {Array.from({ length: livesLeft }).map((_, i) => <span key={i}>❤️</span>)}
            <span className="text-slate-300 ml-1">남은 기회</span>
          </p>
        </div>
      </div>

      {/* 피드백 화면 */}
      {feedback ? (
        <div className={"card p-6 text-center space-y-3 pop-in border-2 " + (feedback.correct ? "!border-emerald-300" : "!border-rose-300")}>
          <p className="text-5xl">{feedback.correct ? "⭕" : "❌"}</p>
          <p className={"font-black text-lg " + (feedback.correct ? "text-emerald-600" : "text-rose-600")}>
            {feedback.correct ? "정답입니다!" : "틀렸어요"}
          </p>
          <div className="rounded-xl bg-slate-50 p-4">
            {feedback.reveal.emoji && <p className="text-5xl leading-none mb-1">{feedback.reveal.emoji}</p>}
            <p className="text-2xl font-black text-[#16204a]">{feedback.reveal.word}</p>
            <p className="text-sm font-bold text-[color:var(--brand-gold)] mt-1">
              [{POS_KO[feedback.reveal.pos] ?? feedback.reveal.pos}] {feedback.reveal.meanings.join(", ")}
            </p>
            {!feedback.correct && feedback.given && (
              <p className="text-xs text-slate-400 mt-2">내 답: {feedback.given}</p>
            )}
            {feedback.pronScore !== undefined && (
              <p className={"text-xs font-bold mt-2 " + ((feedback.pronScore ?? 0) >= (feedback.threshold ?? 0) ? "text-emerald-600" : "text-rose-500")}>
                🎤 발음 점수 {feedback.pronScore}점 (기준 {feedback.threshold}점)
              </p>
            )}
          </div>
          <button className="btn-gold px-4 text-sm" onClick={() => speak(feedback.reveal.word)}>🔊 발음 듣기</button>
          <button className="btn-primary w-full" onClick={next}>
            {feedback.finished ? "결과 보기 →" : "다음 문제 →"}
          </button>
        </div>
      ) : pronMode ? (
        /* 발음 평가 화면 */
        <div className="card p-6 text-center space-y-4 pop-in">
          <p className="text-xs font-bold text-slate-400">정답! 이제 발음해 보세요 🎤</p>
          <p className="text-4xl font-black text-[#16204a]">{pronMode.target}</p>
          <button className="text-xs text-slate-400" onClick={() => speak(pronMode.target)}>🔊 원어민 발음 다시 듣기</button>
          {!speechRecognitionSupported() ? (
            <p className="text-sm text-rose-500 font-bold">
              이 브라우저는 음성 인식을 지원하지 않아요.<br />Chrome 브라우저로 접속해 주세요.
            </p>
          ) : (
            <button
              onClick={doPron}
              disabled={pronMode.listening}
              className={
                "mx-auto flex items-center justify-center w-24 h-24 rounded-full text-4xl shadow-lg transition-all " +
                (pronMode.listening ? "bg-rose-500 animate-pulse text-white" : "bg-gradient-to-br from-[#16204a] to-[#2a3c7d] text-white")
              }
            >
              🎤
            </button>
          )}
          <p className="text-xs text-slate-400">
            {pronMode.listening ? "듣고 있어요... 또박또박 발음하세요!" : "버튼을 누르고 단어를 발음하세요"}
          </p>
          {pronMode.lastMsg && <p className="text-xs text-rose-500 font-bold">{pronMode.lastMsg}</p>}
        </div>
      ) : state.question ? (
        /* 문제 화면 */
        <div className="card p-6 space-y-5">
          <div className="text-center">
            <span className="chip bg-slate-100 text-slate-500">
              {POS_KO[state.question.pos] ?? state.question.pos} · {state.question.dir === "KO_TO_EN" ? "한글 → 영어" : "영어 → 한글"}
            </span>
            <p className={"font-black text-[#16204a] mt-3 " + (state.question.dir === "KO_TO_EN" ? "text-2xl" : "text-4xl")}>
              {state.question.prompt}
            </p>
            {state.question.dir === "EN_TO_KO" && (
              <button className="text-xs text-slate-400 mt-2" onClick={() => speak(state.question!.prompt)}>
                🔊 발음 듣기
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            className="input text-center text-xl font-bold"
            placeholder={state.question.dir === "KO_TO_EN" ? "영어로 입력" : "한글 뜻 입력"}
            value={given}
            onChange={(e) => setGiven(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submitAnswer()}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button className="btn-primary w-full py-3.5 text-lg" onClick={submitAnswer} disabled={submitting || !given.trim()}>
            {submitting ? "채점 중..." : "제출"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
