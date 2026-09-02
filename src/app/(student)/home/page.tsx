"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { useLiveRefresh } from "@/lib/use-live";

type TodayLesson = {
  id: number; partOrder: number; area: string; order: number; name: string;
  isReview: boolean; bookLabel: string | null;
  wordCount: number; hasDialogue: boolean; hasPassage: boolean;
  roles: string[]; passedRoles: string[]; passedAt: Record<string, string>;
  wordPassed: boolean; wordPassedAt: string | null; done: boolean;
};
type TextbookToday = {
  textbook: { id: number; course: string; name: string };
  mode?: string; courseTrack: string;
  today: TodayLesson | null; doneCount: number; total: number;
};
type Dashboard = {
  textbook: TextbookToday | null;
  name: string;
  className: string | null;
  points: number;
  streak: number;
  bestStreak: number;
  todayCount: number;
  cursor: number;
  total: number;
  assignment: { type: string; name?: string; group?: string; order?: number } | null;
  isIndividual: boolean;
  todayIsStudyDay: boolean;
  settings: { testMode: string; dailyWordCount: number; failThreshold: number; pronEnabled: boolean };
  dueReviews: number;
  wrongNotes: number;
  activeSessionId: number | null;
  lastSession: { id: number; status: string; kind: string; attemptNo: number } | null;
};

const MODE_KO: Record<string, string> = {
  KO_TO_EN: "한글 → 영어",
  EN_TO_KO: "영어 → 한글 4지선다",
  MIXED: "혼합",
};
const AREA_KO: Record<string, string> = { TOON: "Toon World", READING: "Book Club" };

// "2026년 9월 2일 14:35" — 미리 통과한 진도의 통과 시각
function fmtPassedAt(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`;
}

// 오늘의 교재 진도 카드 — 단어 카드처럼 '먼저 외우기 / 시험 보기'를 바로 누를 수 있다
function TextbookTodayCard({ t, starting, onWords }: {
  t: TextbookToday; starting: boolean; onWords: (lessonId: number, to: "study" | "test") => void;
}) {
  const l = t.today;
  const passedA = l?.passedRoles.includes("A") ?? false;
  const passedB = l?.passedRoles.includes("B") ?? false;
  const passedN = l?.passedRoles.includes("N") ?? false;
  // 통과 시각 표시 — 통과한 항목만 (탈락은 아무 표시도 하지 않는다)
  const PassedAt = ({ iso }: { iso: string | null | undefined }) =>
    iso ? <p className="text-[10px] text-emerald-600 mt-0.5">✓ {fmtPassedAt(iso)} 통과</p> : null;
  const latestPassed = l
    ? [l.wordPassedAt, ...Object.values(l.passedAt)].filter((x): x is string => !!x).sort().at(-1) ?? null
    : null;

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-black text-[#16204a]">오늘의 학습</h2>
        <span className="chip bg-indigo-50 text-indigo-800">📕 {t.textbook.name}</span>
      </div>
      <div className="text-xs text-slate-500 mb-3 flex flex-wrap gap-x-3 gap-y-1">
        <span>{t.courseTrack === "ADVANCED" ? "심화반" : "기본반"}</span>
        <span>완료 <b>{t.doneCount}/{t.total}</b>레슨</span>
        {t.mode === "MANUAL" && <span>👩‍🏫 선생님 지정 진도</span>}
      </div>

      {!l ? (
        <p className="text-center text-emerald-600 font-bold py-3">🎉 교재의 모든 레슨을 통과했어요!</p>
      ) : (
        <div className="space-y-3">
          <Link href={`/textbook/${l.id}`} className="block rounded-xl border-2 border-[#c9a227] bg-[#fdfaf0] p-3">
            <p className="text-[11px] font-black text-[#c9a227]">오늘의 진도</p>
            <p className="font-black text-[#16204a]">
              PART {l.partOrder} · {AREA_KO[l.area] ?? l.area} L{l.order}
              {l.isReview && <span className="chip bg-amber-50 text-amber-600 ml-1">복습</span>}
              {l.bookLabel && <span className="chip bg-indigo-50 text-indigo-600 ml-1">{l.bookLabel}</span>}
            </p>
            <p className="text-sm text-slate-500">{l.name}</p>
            {l.done && latestPassed && (
              <p className="text-xs font-bold text-emerald-600 mt-1.5">
                🎉 이 진도는 {fmtPassedAt(latestPassed)}에 이미 통과했어요
              </p>
            )}
          </Link>

          {/* 단어 */}
          {l.wordCount > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500">📚 단어 {l.wordCount}개{l.wordPassed && " ✓"}</p>
              <PassedAt iso={l.wordPassedAt} />
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                <button className="btn-ghost text-center" disabled={starting} onClick={() => onWords(l.id, "study")}>📖 먼저 외우기</button>
                <button className={"btn-primary " + (l.wordPassed ? "!bg-emerald-500" : "")} disabled={starting} onClick={() => onWords(l.id, "test")}>
                  ✏️ 단어 시험{l.wordPassed && " ✓"}
                </button>
              </div>
            </div>
          )}

          {/* 대화 */}
          {l.hasDialogue && (
            <div>
              <p className="text-xs font-bold text-slate-500">🗣️ 대화 (A·B 역할 모두 통과해야 해요)</p>
              <div className="grid grid-cols-3 gap-2 mt-1.5">
                <Link href={`/textbook/${l.id}/practice`} className="btn-ghost text-center text-sm">🎧 먼저 연습</Link>
                <Link href={`/textbook/${l.id}/exam?role=A`} className={"btn-primary text-center text-sm " + (passedA ? "!bg-emerald-500" : "")}>A역 시험{passedA && " ✓"}</Link>
                <Link href={`/textbook/${l.id}/exam?role=B`} className={"btn-primary text-center text-sm " + (passedB ? "!bg-emerald-500" : "")}>B역 시험{passedB && " ✓"}</Link>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <span />
                <PassedAt iso={l.passedAt.A} />
                <PassedAt iso={l.passedAt.B} />
              </div>
            </div>
          )}

          {/* 본문 */}
          {l.hasPassage && (
            <div>
              <p className="text-xs font-bold text-slate-500">📖 본문 읽기{passedN && " ✓"}</p>
              <PassedAt iso={l.passedAt.N} />
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                <Link href={`/textbook/${l.id}/practice?kind=passage`} className="btn-ghost text-center">🎧 먼저 연습</Link>
                <Link href={`/textbook/${l.id}/exam?role=N`} className={"btn-primary text-center " + (passedN ? "!bg-emerald-500" : "")}>본문 시험{passedN && " ✓"}</Link>
              </div>
            </div>
          )}

          {l.wordCount === 0 && !l.hasDialogue && !l.hasPassage && (
            <p className="text-center text-slate-400 text-sm py-2">🚧 이 레슨은 아직 준비 중이에요.</p>
          )}

          <Link href="/textbook" className="btn-back">📕 다른 레슨 보기</Link>
        </div>
      )}
    </section>
  );
}

export default function HomePage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [abandoning, setAbandoning] = useState(false);

  // 진행 중인 시험을 지우고 처음부터 다시 볼 수 있게 한다 (점수·진도에는 영향 없음)
  async function abandonTest() {
    if (!confirm("진행 중인 시험을 그만둘까요?\n지금까지 푼 내용은 사라지고, 처음부터 다시 볼 수 있어요.")) return;
    setAbandoning(true);
    try {
      await api("/api/student/abandon", { method: "POST", body: JSON.stringify({ kind: "WORD" }) });
      const fresh = await api<Dashboard>("/api/student/dashboard");
      setD(fresh);
    } catch (e) {
      alert(e instanceof Error ? e.message : "중단하지 못했습니다.");
    } finally {
      setAbandoning(false);
    }
  }
  const router = useRouter();

  const load = useCallback(() => {
    api<Dashboard>("/api/student/dashboard").then(setD).catch(() => { /* 일시적 실패는 화면 유지 */ });
  }, []);
  useLiveRefresh(load, 30000);

  useEffect(() => {
    api<Dashboard>("/api/student/dashboard").then(setD).catch((e) => setError(e.message));
  }, []);

  // 교재 진도의 단어 외우기/시험 — 레슨 단어장을 학습 대상으로 걸고 기존 단어 화면으로 보낸다
  async function startLessonWords(lessonId: number, to: "study" | "test") {
    setStarting(true);
    try {
      await api(`/api/textbook/lessons/${lessonId}/words`, { method: "POST", body: JSON.stringify({ mode: to }) });
      if (to === "study") { router.push("/study"); return; }
      const res = await api<{ sessionId: number }>("/api/test/start", { method: "POST", body: JSON.stringify({ kind: "DAILY" }) });
      router.push(`/test/${res.sessionId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "단어 학습을 시작할 수 없습니다.");
      setStarting(false);
    }
  }

  async function startTest(kind: string, retestOf?: number) {
    setStarting(true);
    try {
      const res = await api<{ sessionId: number }>("/api/test/start", {
        method: "POST",
        body: JSON.stringify({ kind, retestOf }),
      });
      router.push(`/test/${res.sessionId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "시작 실패");
      setStarting(false);
    }
  }

  if (error) return <p className="text-rose-600 font-semibold">{error}</p>;
  if (!d) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  const progressPct = d.total > 0 ? Math.round((d.cursor / d.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* 인사 + 스탯 */}
      <section className="card p-5 bg-gradient-to-br from-[#16204a] to-[#2a3c7d] !border-0 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-indigo-200">{d.className ?? "반 미배정"}</p>
            <h1 className="text-xl font-black mt-0.5">{d.name}님, 안녕하세요! 👋</h1>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-[color:var(--brand-gold-soft,#e7cf7a)]">🔥 {d.streak}일</p>
            <p className="text-[10px] text-indigo-200">연속 학습 (최고 {d.bestStreak}일)</p>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <div className="flex-1 rounded-xl bg-white/10 p-3 text-center">
            <p className="text-lg font-black">{d.points.toLocaleString()}P</p>
            <p className="text-[10px] text-indigo-200">포인트</p>
          </div>
          <div className="flex-1 rounded-xl bg-white/10 p-3 text-center">
            <p className="text-lg font-black">{d.todayCount}</p>
            <p className="text-[10px] text-indigo-200">오늘의 단어</p>
          </div>
          <div className="flex-1 rounded-xl bg-white/10 p-3 text-center">
            <p className="text-lg font-black">{d.dueReviews}</p>
            <p className="text-[10px] text-indigo-200">복습 대기</p>
          </div>
        </div>
      </section>

      {/* 오늘은 쉬는 날 */}
      {!d.todayIsStudyDay && (
        <div className="card p-4 text-center border-2 !border-sky-200">
          <p className="font-black text-sky-700">🏖️ 오늘은 쉬는 날이에요!</p>
          <p className="text-xs text-slate-500 mt-1">오늘은 숙제가 없어요. 그래도 원하면 자유롭게 학습·시험할 수 있어요.</p>
        </div>
      )}

      {/* 진행 중 시험 이어하기 (그만두고 처음부터 다시 볼 수도 있다) */}
      {d.activeSessionId && (
        <div className="card p-4 border-2 !border-amber-400">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-black text-amber-700">⏸ 진행 중인 시험이 있어요</p>
              <p className="text-xs text-slate-500 mt-0.5">이어서 응시하기</p>
            </div>
            <Link href={`/test/${d.activeSessionId}`} className="btn-gold text-sm py-2 whitespace-nowrap">계속하기 →</Link>
          </div>
          <button
            className="mt-3 w-full text-xs font-bold text-slate-400 hover:text-rose-500 py-1.5"
            disabled={abandoning}
            onClick={abandonTest}
          >
            {abandoning ? "정리하는 중..." : "그만두고 처음부터 다시 보기"}
          </button>
        </div>
      )}

      {/* 탈락 → 재시험 */}
      {!d.activeSessionId && d.lastSession?.status === "FAILED" && (
        <div className="card p-4 border-2 !border-rose-300">
          <p className="font-black text-rose-600">😢 지난 시험에서 탈락했어요 ({d.lastSession.attemptNo}차)</p>
          <p className="text-xs text-slate-500 mt-1">재시험은 단어 순서가 랜덤으로 바뀌어요. 다시 도전!</p>
          <button
            className="btn-primary w-full mt-3"
            disabled={starting}
            onClick={() => startTest("RETEST", d.lastSession!.id)}
          >
            재시험 보기 ({d.lastSession.attemptNo + 1}차)
          </button>
        </div>
      )}

      {/* 오늘의 학습 — 교재 과정이면 교재 진도 카드, 아니면 단어장 카드 */}
      {d.textbook ? (
        <TextbookTodayCard t={d.textbook} starting={starting || !!d.activeSessionId} onWords={startLessonWords} />
      ) : (
      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-[#16204a]">오늘의 학습</h2>
          {d.assignment && (
            <span className="chip bg-indigo-50 text-indigo-800">
              {d.assignment.group ? `${d.assignment.group} · ` : ""}{d.assignment.name}
            </span>
          )}
        </div>
        {d.assignment ? (
          <>
            <div className="mb-4">
              <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1">
                <span>전체 진도</span>
                <span>{d.cursor} / {d.total} 단어 ({progressPct}%)</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2a3c7d] to-[#c9a227] transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
            <div className="text-xs text-slate-500 mb-4 flex flex-wrap gap-x-3 gap-y-1">
              <span>📋 시험: <b>{MODE_KO[d.settings.testMode]}</b></span>
              <span>🎯 하루 <b>{d.settings.dailyWordCount}단어</b></span>
              <span>❌ <b>{d.settings.failThreshold}개</b> 틀리면 재시험</span>
              {d.settings.pronEnabled && <span>🎤 발음 평가 ON</span>}
            </div>
            {d.todayCount > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                <Link href="/study" className="btn-ghost text-center">📖 먼저 외우기</Link>
                <button className="btn-primary" disabled={starting || !!d.activeSessionId} onClick={() => startTest("DAILY")}>
                  ✏️ 시험 보기
                </button>
              </div>
            ) : (
              <p className="text-center text-emerald-600 font-bold py-3">🎉 배정된 단어를 모두 통과했어요!</p>
            )}
          </>
        ) : d.isIndividual ? (
          <div className="py-4 text-center space-y-3">
            <p className="text-sm text-slate-500">학습할 레벨을 선택하면 바로 시작할 수 있어요.</p>
            <Link href="/levels" className="btn-primary inline-block">🗺️ 레벨 선택하기</Link>
          </div>
        ) : (
          <p className="text-sm text-slate-400 py-4 text-center">아직 선생님이 학습을 배정하지 않았어요.</p>
        )}
      </section>
      )}

      {/* 복습 & 오답 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="text-sm font-black text-[#16204a]">🔄 누적 복습</p>
          <p className="text-[11px] text-slate-500 mt-1 mb-3">3일·7일·21일 주기로 다시 확인 ({d.dueReviews}개)</p>
          <button className="btn-ghost w-full text-sm" disabled={d.dueReviews === 0 || starting || !!d.activeSessionId} onClick={() => startTest("REVIEW")}>
            복습 시험
          </button>
        </div>
        <div className="card p-4">
          <p className="text-sm font-black text-[#16204a]">📝 오답 정복</p>
          <p className="text-[11px] text-slate-500 mt-1 mb-3">틀렸던 단어만 모아서 ({d.wrongNotes}개)</p>
          <button className="btn-ghost w-full text-sm" disabled={d.wrongNotes === 0 || starting || !!d.activeSessionId} onClick={() => startTest("WRONG_NOTE")}>
            오답 시험
          </button>
        </div>
      </div>
    </div>
  );
}
