"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { useLiveRefresh } from "@/lib/use-live";

type LessonCard = {
  id: number; partOrder: number; area: string; order: number; name: string;
  isReview: boolean; bookLabel: string | null;
  wordCount: number; hasDialogue: boolean; hasPassage: boolean;
  roles: string[]; passedRoles: string[]; wordPassed: boolean; done: boolean;
};
type Home = {
  program: string; courseTrack: string;
  textbook: { id: number; course: string; name: string } | null;
  mode?: string;
  lessons: LessonCard[];
  todayLessonId: number | null;
};

const AREA_KO: Record<string, string> = { TOON: "🗣️ Toon World", READING: "📖 Book Club" };

export default function TextbookHomePage() {
  const [d, setD] = useState<Home | null>(null);

  const load = useCallback(() => {
    api<Home>("/api/textbook/home").then(setD).catch(() => { /* 일시적 실패는 화면 유지 */ });
  }, []);
  useEffect(load, [load]);
  // 선생님이 진도를 바꾸면 학생 화면도 따라 갱신된다
  useLiveRefresh(load, 20000);

  if (!d) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  if (!d.textbook) {
    return (
      <div className="card p-8 text-center space-y-2">
        <p className="text-3xl">📕</p>
        <p className="font-black text-[#16204a]">아직 배정된 교재가 없어요</p>
        <p className="text-sm text-slate-400">선생님이 교재를 정해주면 여기에서 학습할 수 있어요.</p>
        <Link href="/home" className="btn-ghost inline-block mt-2">홈으로</Link>
      </div>
    );
  }

  const today = d.lessons.find((l) => l.id === d.todayLessonId) ?? null;
  const parts = [...new Set(d.lessons.map((l) => l.partOrder))].sort();
  const doneCount = d.lessons.filter((l) => l.done).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-[#16204a]">📕 {d.textbook.name}</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          {d.courseTrack === "ADVANCED" ? "심화반" : "기본반"} · 완료 {doneCount}/{d.lessons.length}레슨
        </p>
      </div>

      {/* 오늘의 진도 */}
      {today && (
        <Link href={`/textbook/${today.id}`} className="card block p-5 border-2 border-[#c9a227] bg-[#fdfaf0] pop-in">
          <p className="text-[11px] font-black text-[#c9a227]">오늘의 진도</p>
          <p className="font-black text-[#16204a] text-lg mt-0.5">
            P{today.partOrder} · {AREA_KO[today.area]} L{today.order}
          </p>
          <p className="text-sm text-slate-500">{today.name}</p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            {today.wordCount > 0 && <span className="chip bg-white text-slate-500">단어 {today.wordCount}</span>}
            {today.hasDialogue && <span className="chip bg-white text-slate-500">대화</span>}
            {today.hasPassage && <span className="chip bg-white text-slate-500">본문 읽기</span>}
          </div>
          <p className="text-xs font-bold text-[#16204a] mt-3">시작하기 →</p>
        </Link>
      )}

      {/* 전체 레슨 */}
      {parts.map((p) => (
        <div key={p} className="space-y-2">
          <h2 className="font-black text-[#16204a] text-sm">PART {p}</h2>
          {(["TOON", "READING"] as const).map((area) => {
            const list = d.lessons.filter((l) => l.partOrder === p && l.area === area);
            if (list.length === 0) return null;
            return (
              <div key={area} className="space-y-1.5">
                <p className="text-xs font-bold text-slate-400">{AREA_KO[area]}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {list.map((l) => (
                    <Link key={l.id} href={`/textbook/${l.id}`}
                      className={"card p-3.5 block hover:shadow-md transition-shadow " + (l.done ? "!border-emerald-200 bg-emerald-50/40" : "")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-black text-[#16204a] text-sm">
                            L{l.order}. {l.name}
                            {l.isReview && <span className="chip bg-amber-50 text-amber-600 ml-1">복습</span>}
                          </p>
                          {l.bookLabel && <p className="text-[10px] text-indigo-500 font-bold">{l.bookLabel}</p>}
                        </div>
                        {l.done
                          ? <span className="chip bg-emerald-500 text-white shrink-0">완료 ✓</span>
                          : l.id === d.todayLessonId
                            ? <span className="chip bg-[#c9a227] text-white shrink-0">오늘</span>
                            : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                        {l.wordCount > 0 && (
                          <span className={"chip " + (l.wordPassed ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500")}>
                            단어 {l.wordCount}{l.wordPassed && " ✓"}
                          </span>
                        )}
                        {l.roles.map((r) => (
                          <span key={r} className={"chip " + (l.passedRoles.includes(r) ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500")}>
                            {r === "N" ? "본문" : `${r}역`}{l.passedRoles.includes(r) && " ✓"}
                          </span>
                        ))}
                        {l.wordCount === 0 && l.roles.length === 0 && <span className="chip bg-slate-100 text-slate-300">준비 중</span>}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
