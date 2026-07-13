"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type C = { id: number; name: string; studentCount: number };
type Row = {
  id: number; name: string; className: string;
  dueDays: number; passedDays: number;
  weekPoints: number; weekBadges: number; streak: number; behindDays: number;
};
type Data = { start: string; end: string; today: string; rows: Row[] };

function kstToday(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}
function fmt(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

export default function WeeklyPage() {
  const [classes, setClasses] = useState<C[]>([]);
  const [classId, setClassId] = useState("");
  const [start, setStart] = useState(mondayOf(kstToday()));
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    api<{ classes: C[] }>("/api/admin/classes").then((r) => setClasses(r.classes));
  }, []);

  useEffect(() => {
    setData(null);
    const p = new URLSearchParams({ start });
    if (classId) p.set("classId", classId);
    api<Data>(`/api/admin/weekly?${p}`).then(setData);
  }, [classId, start]);

  const thisMonday = mondayOf(kstToday());

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-[#16204a]">🗓️ 주간 요약</h1>
        <p className="text-xs text-slate-400 mt-1">이번 주 학생별 통과 현황을 한눈에 봅니다. 통과일은 학습일(요일·휴무 반영) 기준입니다.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select className="input max-w-xs" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">전체 반</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.studentCount}명)</option>)}
        </select>
        <div className="flex items-center gap-2 ml-auto">
          <button className="btn-ghost !py-1.5 !px-3 text-sm" onClick={() => setStart(addDays(start, -7))}>← 지난주</button>
          <span className="font-black text-[#16204a] text-sm">{fmt(start)} ~ {fmt(addDays(start, 6))}</span>
          <button className="btn-ghost !py-1.5 !px-3 text-sm" disabled={start >= thisMonday} onClick={() => setStart(addDays(start, 7))}>다음주 →</button>
          {start !== thisMonday && (
            <button className="chip bg-[#16204a] text-white !py-1.5" onClick={() => setStart(thisMonday)}>이번주</button>
          )}
        </div>
      </div>

      {!data ? (
        <p className="text-slate-400 text-center py-16">불러오는 중...</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
                <th className="p-3">이름</th>
                <th className="p-3">반</th>
                <th className="p-3">통과 (통과일/학습일)</th>
                <th className="p-3">주간 포인트</th>
                <th className="p-3">주간 뱃지</th>
                <th className="p-3">연속 통과</th>
                <th className="p-3">밀림</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const rate = r.dueDays > 0 ? Math.round((r.passedDays / r.dueDays) * 100) : null;
                return (
                  <tr key={r.id} className="border-b border-slate-50">
                    <td className="p-3 font-bold text-[#16204a]">{r.name}</td>
                    <td className="p-3 text-slate-500">{r.className}</td>
                    <td className="p-3">
                      {r.dueDays === 0 ? (
                        <span className="text-slate-300">학습일 없음</span>
                      ) : (
                        <span className={"font-black " + (rate! >= 100 ? "text-emerald-600" : rate! >= 50 ? "text-amber-500" : "text-rose-500")}>
                          {r.passedDays}/{r.dueDays}일 ({rate}%)
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-bold text-[#16204a]">{r.weekPoints.toLocaleString()}P</td>
                    <td className="p-3 font-bold text-amber-500">{r.weekBadges > 0 ? `🏅${r.weekBadges}` : "-"}</td>
                    <td className="p-3">{r.streak > 0 ? <span className="font-bold text-orange-500">🔥{r.streak}일</span> : "-"}</td>
                    <td className="p-3">
                      {r.behindDays > 0
                        ? <span className="chip bg-rose-50 text-rose-600 font-black">{r.behindDays}일 밀림</span>
                        : <span className="text-emerald-600 font-bold">✓</span>}
                    </td>
                  </tr>
                );
              })}
              {data.rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-slate-400">학생이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-400">밀림은 어제까지의 전체 진도 기준(주간과 무관), 나머지는 선택한 주의 기록입니다.</p>
    </div>
  );
}
