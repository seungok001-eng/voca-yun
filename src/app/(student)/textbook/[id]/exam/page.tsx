"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, playClip, playClipAsync, recognizeOnce, speechRecognitionSupported } from "@/lib/client";
import type { LessonData } from "../page";

type Line = { id: number; order: number; speaker: string; text: string; textKo: string | null; audioUrl: string | null };
type Session = {
  id: number; lessonId: number; role: string; items: number[];
  index: number; total: number; passedCount: number; requiredCount: number;
  matchRate: number; status: string;
};
type AnswerResult = {
  score: number; passed: boolean; missed: string[]; feedback: string; correctText: string;
  index: number; total: number; passedCount: number; requiredCount: number;
  status: "IN_PROGRESS" | "PASSED" | "FAILED"; lessonPassed: boolean;
};

export default function ExamPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const role = (useSearchParams().get("role") ?? "A") as "A" | "B" | "N";

  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [listening, setListening] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState<AnswerResult | null>(null);
  const [showKo, setShowKo] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const started = useRef(false);

  // 레슨 + 시험 세션 시작
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const l = await api<LessonData>(`/api/textbook/lessons/${id}`);
        setLesson(l);
        const s = await api<Session>("/api/textbook/test", {
          method: "POST",
          body: JSON.stringify({ lessonId: Number(id), role }),
        });
        setSession(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : "시험을 시작할 수 없습니다.");
      }
    })();
  }, [id, role]);

  // 다시 도전 — 끝난 세션은 그대로 두고 새 세션을 받아 처음부터 시작한다
  async function retry() {
    setResult(null);
    setFinished(null);
    setSession(null);
    setShowKo(false);
    try {
      const s = await api<Session>("/api/textbook/test", {
        method: "POST",
        body: JSON.stringify({ lessonId: Number(id), role }),
      });
      setSession(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 시작할 수 없습니다.");
    }
  }

  // 전체 줄을 순서대로 (대화 세트 → 줄 순서). 상대 대사 재생을 위해 필요.
  const allLines: Line[] = lesson
    ? (role === "N" ? (lesson.passage?.lines ?? []) : lesson.dialogues.flatMap((d) => d.lines))
    : [];
  const currentLineId = session && session.index < session.items.length ? session.items[session.index] : null;
  const currentLine = allLines.find((l) => l.id === currentLineId) ?? null;

  // 내 차례 직전까지 상대 대사 자동 재생
  const playLeadIn = useCallback(async (target: Line) => {
    if (role === "N") return; // 본문 읽기는 상대가 없다
    const idx = allLines.findIndex((l) => l.id === target.id);
    if (idx < 0) return;
    // 직전 내 차례 다음부터 이번 차례 전까지
    let from = 0;
    for (let i = idx - 1; i >= 0; i--) {
      if (allLines[i].speaker === role) { from = i + 1; break; }
    }
    setPreparing(true);
    for (let i = from; i < idx; i++) {
      await playClipAsync(allLines[i].audioUrl, allLines[i].text);
      await new Promise((r) => setTimeout(r, 200));
    }
    setPreparing(false);
  }, [allLines, role]);

  async function answer() {
    if (!session || !currentLine) return;
    if (!speechRecognitionSupported()) {
      alert("이 브라우저는 음성 인식을 지원하지 않아요. 크롬으로 접속해 주세요.");
      return;
    }
    setResult(null);
    await playLeadIn(currentLine);
    setListening(true);
    let transcript = "";
    try {
      transcript = (await recognizeOnce(8000)).transcript;
    } catch {
      transcript = ""; // 인식 실패도 답안으로 제출 (0점 처리)
    }
    setListening(false);
    try {
      const res = await api<AnswerResult>(`/api/textbook/test/${session.id}`, {
        method: "POST",
        body: JSON.stringify({ recognized: transcript }),
      });
      setResult(res);
      setShowKo(false);
      setSession((s) => s ? { ...s, index: res.index, passedCount: res.passedCount, status: res.status } : s);
      if (res.status !== "IN_PROGRESS") setFinished(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "채점에 실패했습니다.");
    }
  }

  // 시험을 그만두고 세션을 지운다 → 다음에 처음부터 다시 볼 수 있다
  async function quitExam() {
    if (!confirm("시험을 그만둘까요?\n지금까지 말한 내용은 사라지고, 처음부터 다시 볼 수 있어요.")) return;
    setQuitting(true);
    try {
      await api("/api/student/abandon", {
        method: "POST",
        body: JSON.stringify({ kind: "SPEAK", sessionId: session?.id }),
      });
      router.push(`/textbook/${id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "중단하지 못했습니다.");
      setQuitting(false);
    }
  }

  if (error) {
    return (
      <div className="card p-8 text-center space-y-3">
        <p className="text-3xl">⚠️</p>
        <p className="font-bold text-[#16204a]">{error}</p>
        <Link href={`/textbook/${id}`} className="btn-ghost inline-block">돌아가기</Link>
      </div>
    );
  }
  if (!lesson || !session) return <p className="text-slate-400 text-center py-20">시험 준비 중...</p>;

  // 결과 화면
  if (finished) {
    const ok = finished.status === "PASSED";
    return (
      <div className="card p-8 text-center space-y-3 pop-in">
        <p className="text-5xl">{ok ? "🎉" : "💪"}</p>
        <p className="text-xl font-black text-[#16204a]">{ok ? "통과했어요!" : "아쉬워요"}</p>
        <p className="text-sm text-slate-500">
          {finished.total}문장 중 <b className="text-[#16204a]">{finished.passedCount}문장</b> 통과
          <span className="text-slate-400"> (기준 {finished.requiredCount}문장)</span>
        </p>
        {finished.lessonPassed && (
          <p className="chip bg-emerald-500 text-white inline-block">레슨 전체 완료! 🏅</p>
        )}
        <div className="flex gap-2 justify-center pt-2">
          <Link href={`/textbook/${id}`} className="btn-ghost">레슨으로</Link>
          {!ok && <button className="btn-primary" onClick={retry}>다시 도전</button>}
        </div>
      </div>
    );
  }

  const done = session.index;
  const pct = Math.round((done / Math.max(1, session.total)) * 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-400">
            {lesson.name} · {role === "N" ? "본문 읽기 시험" : `${role}역 시험`}
          </p>
          <p className="text-sm font-black text-[#16204a]">
            {done + 1} / {session.total} 문장
            <span className="text-emerald-600 ml-2">통과 {session.passedCount}</span>
            <span className="text-slate-400 text-xs"> / 목표 {session.requiredCount}</span>
          </p>
        </div>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-[#c9a227] transition-all" style={{ width: `${pct}%` }} />
      </div>

      {currentLine ? (
        <div className="card p-6 space-y-4">
          {preparing && <p className="text-center text-sm text-amber-600 font-bold">🔊 상대 대사를 듣는 중...</p>}

          {role === "N" ? (
            /* 본문 읽기: 영어 문장을 보여주고, 들려준 뒤 따라 말하게 한다 */
            <div className="space-y-3">
              <div className="text-center space-y-2">
                <p className="text-[11px] font-bold text-slate-400">듣고 따라 읽으세요</p>
                <p className="text-lg font-black text-[#16204a] leading-relaxed">{currentLine.text}</p>
                {showKo
                  ? <p className="text-sm text-slate-500">{currentLine.textKo ?? "(해석 없음)"}</p>
                  : <button className="chip bg-slate-100 text-slate-500 !py-1.5"
                      onClick={() => setShowKo(true)}>해석 보기</button>}
              </div>
              <button className="btn-ghost w-full"
                onClick={() => playClip(currentLine.audioUrl, currentLine.text)}>
                🔊 문장 듣기 (몇 번이든 다시 들을 수 있어요)
              </button>
            </div>
          ) : (
            /* 대화: 한국어 뜻을 보고 영어로 말한다 */
            <div className="text-center space-y-1">
              <p className="text-[11px] font-bold text-slate-400">이 뜻을 영어로 말하세요</p>
              <p className="text-xl font-black text-[#16204a]">{currentLine.textKo ?? "(뜻 없음)"}</p>
            </div>
          )}

          <button className="btn-primary w-full !py-4 text-lg"
            disabled={listening || preparing}
            onClick={answer}>
            {listening ? "🎙️ 듣고 있어요..." : preparing ? "잠시만요..." : role === "N" ? "🎤 따라 말하기" : "🎤 말하기"}
          </button>

          {role !== "N" && (
            <button className="btn-ghost w-full !py-2 text-sm"
              disabled={listening || preparing}
              onClick={() => playLeadIn(currentLine)}>
              🔊 상대 대사 다시 듣기
            </button>
          )}

          {result && (
            <div className={"rounded-xl p-3 text-sm " + (result.passed ? "bg-emerald-50" : "bg-rose-50")}>
              <p className="text-[10px] font-bold text-slate-400">직전 문장 채점 결과</p>
              <p className={"font-black " + (result.passed ? "text-emerald-600" : "text-rose-500")}>
                {result.passed ? "정답!" : "아쉬워요"} · 정확도 {result.score}%
              </p>
              <p className="text-slate-600 text-xs mt-0.5">{result.feedback}</p>
              <p className="text-slate-400 text-xs mt-1">정답: {result.correctText}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-slate-400 text-center py-10">문장을 불러오는 중...</p>
      )}

      <p className="text-[11px] text-slate-400 text-center">
        {session.matchRate}% 이상 정확하게 말하면 통과예요. 틀려도 끝까지 진행되니 편하게 말해보세요.
      </p>

      <button className="btn-quit" disabled={listening || preparing || quitting} onClick={quitExam}>
        {quitting ? "정리하는 중..." : "✋ 시험 그만두기"}
      </button>
      <p className="text-[11px] text-slate-400 text-center -mt-2">그만두면 처음부터 다시 볼 수 있어요</p>
    </div>
  );
}
