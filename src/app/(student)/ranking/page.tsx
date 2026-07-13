"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type Row = { rank: number; id: number; name: string; points: number; badges: number };
type Data = { scope: string; month: string; scopeName: string; me: number; rows: Row[] };

const MEDAL = ["🥇", "🥈", "🥉"];

function kstMonth(): string {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function RankingPage() {
  const [scope, setScope] = useState<"class" | "academy">("class");
  const [month, setMonth] = useState(kstMonth());
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    setData(null);
    api<Data>(`/api/student/ranking?scope=${scope}&month=${month}`).then(setData);
  }, [scope, month]);

  const thisMonth = kstMonth();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-black text-[#16204a]">🏆 랭킹</h1>
        <p className="text-xs text-slate-400 mt-1">매달 시험 통과·정답으로 포인트를 모아요! 3일 연속 통과부터는 매일 🏅뱃지 +10P!</p>
      </div>

      {/* 반 / 학원 전체 탭 */}
      <div className="flex gap-1.5">
        <button onClick={() => setScope("class")}
          className={"chip !py-2 !px-4 " + (scope === "class" ? "bg-[#16204a] text-white" : "bg-white border border-slate-200 text-slate-500")}>
          🏫 우리 반
        </button>
        <button onClick={() => setScope("academy")}
          className={"chip !py-2 !px-4 " + (scope === "academy" ? "bg-[#16204a] text-white" : "bg-white border border-slate-200 text-slate-500")}>
          🏛️ 학원 전체
        </button>
      </div>

      {/* 월 선택 */}
      <div className="flex items-center justify-center gap-3">
        <button className="btn-ghost !py-1.5 !px-3 text-sm" onClick={() => setMonth(shiftMonth(month, -1))}>← 지난달</button>
        <span className="font-black text-[#16204a]">{month.replace("-", "년 ")}월</span>
        <button className="btn-ghost !py-1.5 !px-3 text-sm" disabled={month >= thisMonth} onClick={() => setMonth(shiftMonth(month, 1))}>다음달 →</button>
      </div>

      {!data ? (
        <p className="text-slate-400 text-center py-16">불러오는 중...</p>
      ) : (
        <>
          <p className="text-center text-xs font-bold text-slate-400">{data.scopeName}</p>
          {data.rows.length === 0 ? (
            <div className="card p-8 text-center text-slate-400">이 달의 랭킹 데이터가 없어요.</div>
          ) : (
            <ul className="space-y-2">
              {data.rows.map((r) => (
                <li key={r.id}
                  className={"card p-4 flex items-center gap-3 " + (r.id === data.me ? "!border-2 !border-[#c9a227]" : "")}>
                  <span className="w-8 text-center text-lg font-black">
                    {MEDAL[r.rank - 1] ?? <span className="text-slate-400 text-sm">{r.rank}</span>}
                  </span>
                  <span className="flex-1 font-bold text-[#16204a]">
                    {r.name} {r.id === data.me && <span className="text-[10px] text-[#c9a227] font-black">나</span>}
                  </span>
                  {r.badges > 0 && (
                    <span className="text-xs font-black text-amber-500" title="이달 연속통과 뱃지">🏅{r.badges}</span>
                  )}
                  <span className="font-black text-[#16204a]">{r.points.toLocaleString()}P</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
