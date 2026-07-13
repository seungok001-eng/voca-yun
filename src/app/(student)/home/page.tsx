"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";

type Dashboard = {
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
  EN_TO_KO: "영어 → 한글",
  MIXED: "혼합",
};

export default function HomePage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    api<Dashboard>("/api/student/dashboard").then(setD).catch((e) => setError(e.message));
  }, []);

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

      {/* 진행 중 시험 이어하기 */}
      {d.activeSessionId && (
        <Link href={`/test/${d.activeSessionId}`} className="card p-4 flex items-center justify-between border-2 !border-amber-400 block">
          <div>
            <p className="font-black text-amber-700">⏸ 진행 중인 시험이 있어요</p>
            <p className="text-xs text-slate-500 mt-0.5">이어서 응시하기</p>
          </div>
          <span className="btn-gold text-sm py-2">계속하기 →</span>
        </Link>
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

      {/* 오늘의 학습 */}
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
