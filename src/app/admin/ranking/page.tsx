"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

type Row = { rank: number; id: number; name: string; className: string; points: number; badges: number };
type Data = { academyName: string; rankingTopN: number; month: string; rows: Row[] };
type Academy = { id: number; name: string };

function kstMonth(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(m: string, d: number): string {
  const [y, mo] = m.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1 + d, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function AdminRankingPage() {
  const [month, setMonth] = useState(kstMonth());
  const [data, setData] = useState<Data | null>(null);
  const [topN, setTopN] = useState(10);
  const [saved, setSaved] = useState(false);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [academyId, setAcademyId] = useState("");
  const [error, setError] = useState("");

  // 총관리자면 학원 목록 (아니면 403 → 무시)
  useEffect(() => {
    api<{ organizations: Academy[] }>("/api/admin/organizations")
      .then((r) => {
        setAcademies(r.organizations);
        if (r.organizations.length > 0) setAcademyId((cur) => cur || String(r.organizations[0].id));
      })
      .catch(() => setAcademies([]));
  }, []);

  const load = useCallback(() => {
    // 총관리자는 학원을 골라야 조회 가능. 원장/선생님은 자기 학원 자동.
    if (academies.length > 0 && !academyId) return;
    setError("");
    const p = new URLSearchParams({ month });
    if (academyId) p.set("academyId", academyId);
    api<Data>(`/api/admin/ranking?${p}`)
      .then((d) => { setData(d); setTopN(d.rankingTopN); })
      .catch((e) => { setData(null); setError(e instanceof Error ? e.message : "불러오기 실패"); });
  }, [month, academyId, academies.length]);
  useEffect(load, [load]);

  async function save() {
    await api("/api/admin/ranking", { method: "PATCH", body: JSON.stringify({ rankingTopN: topN, academyId: academyId || undefined }) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    load();
  }

  const thisMonth = kstMonth();
  const academySelector = academies.length > 0 && (
    <select className="input !w-auto" value={academyId} onChange={(e) => setAcademyId(e.target.value)}>
      {academies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );

  if (!data) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-black text-[#16204a]">🏆 랭킹 관리</h1>
        {academySelector}
        <p className="text-slate-400 text-center py-16">{error || "불러오는 중..."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-black text-[#16204a]">🏆 랭킹 관리 <span className="text-sm text-slate-400 font-semibold">— {data.academyName}</span></h1>
          {academySelector}
        </div>
        <p className="text-xs text-slate-400 mt-1">학생들이 보는 &ldquo;학원 전체 랭킹&rdquo;에 몇 위까지 보여줄지 정합니다. (매달 자동 집계)</p>
      </div>

      <div className="card p-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">학원 전체 랭킹 표시 순위 수</label>
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={100} className="input !w-28" value={topN} onChange={(e) => setTopN(Number(e.target.value))} />
            <span className="text-sm text-slate-500">위까지 표시</span>
          </div>
        </div>
        <button className="btn-primary" onClick={save}>저장</button>
        {saved && <span className="text-sm font-bold text-emerald-600 pop-in">✓ 저장됨</span>}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-black text-[#16204a]">월별 미리보기</h2>
        <div className="flex items-center gap-3">
          <button className="btn-ghost !py-1.5 !px-3 text-sm" onClick={() => setMonth(shiftMonth(month, -1))}>← 지난달</button>
          <span className="font-black text-[#16204a] text-sm">{month.replace("-", "년 ")}월</span>
          <button className="btn-ghost !py-1.5 !px-3 text-sm" disabled={month >= thisMonth} onClick={() => setMonth(shiftMonth(month, 1))}>다음달 →</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
              <th className="p-3">순위</th><th className="p-3">이름</th><th className="p-3">반</th><th className="p-3">이달 뱃지</th><th className="p-3">이달 포인트</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id} className={"border-b border-slate-50 " + (r.rank <= topN ? "" : "opacity-40")}>
                <td className="p-3 font-black text-[#16204a]">{["🥇", "🥈", "🥉"][r.rank - 1] ?? r.rank}</td>
                <td className="p-3 font-bold">{r.name}</td>
                <td className="p-3 text-slate-500">{r.className}</td>
                <td className="p-3 font-bold text-amber-500">{r.badges > 0 ? `🏅${r.badges}` : "-"}</td>
                <td className="p-3 font-black text-[#16204a]">{r.points.toLocaleString()}P</td>
              </tr>
            ))}
            {data.rows.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">이 달 데이터가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">흐리게 표시된 순위는 학생 화면에 노출되지 않습니다 (표시 순위 수 밖).</p>
      <p className="text-[11px] text-slate-400">🏅 뱃지: 3일 연속 통과부터 매 통과일 1개씩 지급, 뱃지 1개 = 10P로 포인트에 자동 합산됩니다. 하루라도 끊기면 다시 3일 연속 통과부터 지급됩니다.</p>
    </div>
  );
}
