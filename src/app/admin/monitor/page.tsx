"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

type Row = {
  id: number; studentName: string; classId: number | null; className: string; kind: string; mode: string;
  status: string; attemptNo: number; currentIndex: number; total: number;
  wrongCount: number; failThreshold: number; cheatCount: number;
  startedAt: string; finishedAt: string | null;
};
type ClassRow = { id: number; name: string };

const KIND_KO: Record<string, string> = {
  DAILY: "일일시험", RETEST: "재시험", WRONG_NOTE: "오답시험", REVIEW: "복습시험",
};

// 5초마다 자동 갱신되는 실시간 모니터링
export default function MonitorPage() {
  const [data, setData] = useState<{ active: Row[]; recent: Row[]; classes: ClassRow[] } | null>(null);
  const [classId, setClassId] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const load = () => api<{ active: Row[]; recent: Row[]; classes: ClassRow[] }>("/api/admin/monitor").then(setData).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  const match = (r: Row) =>
    (!classId || String(r.classId) === classId) &&
    (!q || r.studentName.includes(q.trim()));
  const active = data.active.filter(match);
  const recent = data.recent.filter(match);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl font-black text-[#16204a]">👀 실시간 모니터링</h1>
        <span className="chip bg-emerald-50 text-emerald-600 animate-pulse">● LIVE (5초 갱신)</span>
      </div>

      {/* 반 필터 + 이름 검색 */}
      <div className="card p-4 grid gap-2 sm:grid-cols-3">
        <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">전체 반</option>
          {data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className="input" placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <section>
        <h2 className="font-black text-sm text-slate-600 mb-2">지금 시험 중 ({active.length}명)</h2>
        {active.length === 0 ? (
          <div className="card p-8 text-center text-slate-400">현재 시험 중인 학생이 없습니다.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((t) => (
              <div key={t.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <p className="font-black text-[#16204a]">{t.studentName}</p>
                  <span className="chip bg-indigo-50 text-indigo-700">{t.className}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{KIND_KO[t.kind]}{t.attemptNo > 1 && ` ${t.attemptNo}차`}</p>
                <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#2a3c7d] to-[#c9a227]"
                    style={{ width: `${Math.round((t.currentIndex / t.total) * 100)}%` }} />
                </div>
                <div className="flex justify-between text-[11px] mt-1.5 font-bold">
                  <span className="text-slate-400">{t.currentIndex}/{t.total} 문항</span>
                  <span className={t.wrongCount > 0 ? "text-rose-500" : "text-slate-400"}>오답 {t.wrongCount}/{t.failThreshold}</span>
                  {t.cheatCount > 0 && <span className="text-amber-600">⚠️ 이탈 {t.cheatCount}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-black text-sm text-slate-600 mb-2">최근 완료</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
                <th className="p-3">완료 시각</th><th className="p-3">학생</th><th className="p-3">반</th>
                <th className="p-3">종류</th><th className="p-3">결과</th><th className="p-3">오답</th><th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id} className="border-b border-slate-50">
                  <td className="p-3 text-xs text-slate-500">{t.finishedAt ? new Date(t.finishedAt).toLocaleTimeString("ko-KR") : "-"}</td>
                  <td className="p-3 font-bold text-[#16204a]">{t.studentName}</td>
                  <td className="p-3 text-slate-500">{t.className}</td>
                  <td className="p-3">{KIND_KO[t.kind]}{t.attemptNo > 1 && ` ${t.attemptNo}차`}</td>
                  <td className="p-3">
                    {t.status === "PASSED"
                      ? <span className="chip bg-emerald-50 text-emerald-600">통과</span>
                      : <span className="chip bg-rose-50 text-rose-500">탈락</span>}
                  </td>
                  <td className="p-3">{t.wrongCount}개</td>
                  <td className="p-3"><Link href={`/admin/results/${t.id}`} className="text-xs font-bold text-indigo-600 hover:underline">답안 →</Link></td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400">기록 없음</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
