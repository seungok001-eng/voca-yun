"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import Mascot from "@/components/Mascot";
import GrowthTree, { treeStage, TREE_STAGES } from "@/components/GrowthTree";
import { fxEnabled, setFxEnabled, sfx } from "@/lib/fx";

type Badge = { id: string; name: string; desc: string; emoji: string; group: string; earned: boolean };
type Data = {
  badges: Badge[]; earnedCount: number; total: number;
  stats: { words: number; passed: number; perfect: number; bestStreak: number; points: number; speakPassed: number; daysActive: number };
};

export default function BadgesPage() {
  const [d, setD] = useState<Data | null>(null);
  const [fx, setFx] = useState(true);
  useEffect(() => {
    api<Data>("/api/student/badges").then(setD).catch(() => setD(null));
    setFx(fxEnabled());
  }, []);

  if (!d) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  const groups = [...new Set(d.badges.map((b) => b.group))];
  const tree = treeStage(d.stats.words);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-[#16204a]">🏅 내 뱃지 진열장</h1>
        <Link href="/home" className="btn-back">🏠 홈으로</Link>
      </div>

      {/* 나무 + 요약 */}
      <section className="card p-5 tone-review border-2">
        <div className="flex items-center gap-4">
          <GrowthTree words={d.stats.words} size={120} />
          <div className="flex-1">
            <p className="text-xs font-bold text-emerald-700">내 나무 · {TREE_STAGES[tree.stage].name}</p>
            <p className="text-2xl text-[#16204a]">단어 {d.stats.words.toLocaleString()}개 정복</p>
            {tree.next ? (
              <>
                <div className="h-2.5 rounded-full bg-white/70 overflow-hidden mt-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all" style={{ width: `${Math.round(tree.progress * 100)}%` }} />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">{TREE_STAGES[tree.stage + 1].name}까지 {(tree.next - d.stats.words).toLocaleString()}개 남았어요</p>
              </>
            ) : <p className="text-[11px] text-emerald-700 mt-1">가장 큰 나무예요! 🎉</p>}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-4 text-center">
          {[["🏅", `${d.earnedCount}/${d.total}`, "뱃지"], ["✅", d.stats.passed, "통과"], ["💯", d.stats.perfect, "만점"], ["🔥", `${d.stats.bestStreak}일`, "최고 연속"]].map(([i, v, l]) => (
            <div key={String(l)} className="rounded-2xl bg-white/80 p-2">
              <p className="text-lg font-black text-[#16204a]">{i} {v}</p>
              <p className="text-[10px] text-slate-500">{l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 뱃지 */}
      {groups.map((g) => (
        <section key={g} className="card p-4">
          <h2 className="text-[#16204a] text-base mb-2">{g}</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {d.badges.filter((b) => b.group === g).map((b) => (
              <div key={b.id}
                onClick={() => b.earned && sfx("badge")}
                className={"rounded-2xl p-3 text-center border " + (b.earned ? "tone-badge border-2 float" : "bg-slate-50 border-slate-100 badge-locked")}
                title={b.desc}>
                <p className="text-3xl leading-none">{b.emoji}</p>
                <p className="text-xs font-black text-[#16204a] mt-1.5 truncate">{b.name}</p>
                <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{b.desc}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* 효과 설정 */}
      <section className="card p-4 flex items-center gap-3">
        <Mascot mood="happy" size={56} />
        <div className="flex-1">
          <p className="text-sm font-black text-[#16204a]">효과음과 폭죽</p>
          <p className="text-[11px] text-slate-400">정답·통과할 때 소리와 색종이가 나와요. 조용히 공부하고 싶으면 꺼 두세요.</p>
        </div>
        <button className={"chip !py-2 !px-4 font-bold " + (fx ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600")}
          onClick={() => { const n = !fx; setFx(n); setFxEnabled(n); if (n) sfx("tap"); }}>
          {fx ? "켜짐" : "꺼짐"}
        </button>
      </section>
    </div>
  );
}
