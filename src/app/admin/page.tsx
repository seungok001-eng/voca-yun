"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

type Stats = {
  passed: number; failed: number; passRate: number | null; accuracy: number | null;
  topWrongWords: { word: string; meanings: string[]; count: number }[];
  students: { id: number; name: string; accuracy: number | null; passed: number; failed: number }[];
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Stats>("/api/admin/stats").then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-rose-600 font-semibold">{error}</p>;
  if (!stats) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-black text-[#16204a]">📊 학원 현황</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="시험 통과" value={`${stats.passed}회`} tone="emerald" />
        <Stat label="시험 탈락" value={`${stats.failed}회`} tone="rose" />
        <Stat label="통과율" value={stats.passRate !== null ? `${stats.passRate}%` : "-"} tone="navy" />
        <Stat label="전체 정답률" value={stats.accuracy !== null ? `${stats.accuracy}%` : "-"} tone="gold" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-black text-[#16204a] mb-3">🔻 자주 틀리는 단어 TOP 10</h2>
          {stats.topWrongWords.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">아직 데이터가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {stats.topWrongWords.map((w, i) => (
                <li key={i} className="py-2 flex items-center gap-3">
                  <span className="w-5 text-center font-black text-slate-300">{i + 1}</span>
                  <span className="font-bold text-[#16204a]">{w.word}</span>
                  <span className="flex-1 text-xs text-slate-400 truncate">{w.meanings.join(", ")}</span>
                  <span className="chip bg-rose-50 text-rose-500">{w.count}회</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-black text-[#16204a] mb-3">🎓 학생별 성적</h2>
          {stats.students.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">등록된 학생이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {stats.students.map((st) => (
                <li key={st.id} className="py-2 flex items-center gap-3">
                  <Link href={`/admin/students/${st.id}`} className="font-bold text-[#16204a] hover:underline flex-1">
                    {st.name}
                  </Link>
                  <span className="text-xs text-emerald-600 font-bold">통과 {st.passed}</span>
                  <span className="text-xs text-rose-500 font-bold">탈락 {st.failed}</span>
                  <span className="chip bg-indigo-50 text-indigo-700">{st.accuracy !== null ? `${st.accuracy}%` : "-"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  const tones: Record<string, string> = {
    emerald: "text-emerald-600", rose: "text-rose-500", navy: "text-[#16204a]", gold: "text-[#c9a227]",
  };
  return (
    <div className="card p-4 text-center">
      <p className={"text-2xl font-black " + tones[tone]}>{value}</p>
      <p className="text-[11px] font-bold text-slate-400 mt-1">{label}</p>
    </div>
  );
}
