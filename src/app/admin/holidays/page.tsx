"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

type Holiday = { id: number; name: string; startDate: string; endDate: string; classId: number | null; className: string | null };
type ClassRow = { id: number; name: string };
type Data = { academyName: string; skipKoreanHolidays: boolean; classes: ClassRow[]; holidays: Holiday[] };

export default function HolidaysPage() {
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "", classId: "" });

  const load = useCallback(() => {
    api<Data>("/api/admin/holidays").then(setData);
  }, []);
  useEffect(load, [load]);

  async function add() {
    if (!form.name.trim() || !form.startDate) { alert("이름과 시작일을 입력하세요."); return; }
    try {
      await api("/api/admin/holidays", {
        method: "POST",
        body: JSON.stringify({ ...form, endDate: form.endDate || form.startDate, classId: form.classId || null }),
      });
      setForm({ name: "", startDate: "", endDate: "", classId: "" });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "추가 실패");
    }
  }

  async function remove(h: Holiday) {
    if (!confirm(`"${h.name}" 휴무를 삭제할까요?`)) return;
    await api(`/api/admin/holidays/${h.id}`, { method: "DELETE" });
    load();
  }

  async function toggleKr() {
    if (!data) return;
    await api("/api/admin/holidays", { method: "PATCH", body: JSON.stringify({ skipKoreanHolidays: !data.skipKoreanHolidays }) });
    load();
  }

  if (!data) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-[#16204a]">🏖️ 휴무 관리 <span className="text-sm text-slate-400 font-semibold">— {data.academyName}</span></h1>
        <p className="text-xs text-slate-400 mt-1">
          방학·시험기간·행사 등 숙제를 내지 않을 기간을 등록합니다. 휴무 기간은 &ldquo;밀린 학습&rdquo; 계산에서도 제외되고, 학생 스트릭도 끊기지 않습니다.
        </p>
      </div>

      {/* 공휴일 자동 휴무 */}
      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="font-bold text-[#16204a]">🇰🇷 국경일·공휴일 자동 휴무</p>
          <p className="text-xs text-slate-400 mt-0.5">한국 공휴일(설·추석·어린이날 등, 대체공휴일 포함 2040년까지 내장)에는 숙제를 내지 않습니다.</p>
        </div>
        <button onClick={toggleKr}
          className={"chip !py-2 !px-4 " + (data.skipKoreanHolidays ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500")}>
          {data.skipKoreanHolidays ? "켜짐 ✓" : "꺼짐"}
        </button>
      </div>

      {/* 휴무 추가 */}
      <div className="card p-4">
        <p className="font-bold text-[#16204a] text-sm mb-2">휴무 기간 추가</p>
        <div className="grid gap-2 sm:grid-cols-5">
          <input className="input" placeholder="이름 (예: 여름방학)" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="input" type="date" value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <input className="input" type="date" value={form.endDate} placeholder="종료일"
            onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          <select className="input" value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
            <option value="">학원 전체</option>
            {data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}만</option>)}
          </select>
          <button className="btn-primary" onClick={add}>추가</button>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">하루짜리 휴무는 종료일을 비우면 됩니다. 특정 반만 쉬면(예: 중등부 시험기간) 반을 선택하세요.</p>
      </div>

      {/* 목록 */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
              <th className="p-3">이름</th><th className="p-3">기간</th><th className="p-3">적용 대상</th><th className="p-3">상태</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.holidays.map((h) => (
              <tr key={h.id} className="border-b border-slate-50">
                <td className="p-3 font-bold text-[#16204a]">{h.name}</td>
                <td className="p-3 text-slate-500">{h.startDate}{h.endDate !== h.startDate && ` ~ ${h.endDate}`}</td>
                <td className="p-3">{h.className ? <span className="chip bg-indigo-50 text-indigo-700">{h.className}</span> : <span className="chip bg-slate-100 text-slate-500">학원 전체</span>}</td>
                <td className="p-3">
                  {h.endDate < today
                    ? <span className="text-xs text-slate-300">지남</span>
                    : h.startDate <= today
                      ? <span className="chip bg-amber-50 text-amber-600">진행 중</span>
                      : <span className="chip bg-emerald-50 text-emerald-600">예정</span>}
                </td>
                <td className="p-3"><button className="text-xs font-bold text-rose-500 hover:underline" onClick={() => remove(h)}>삭제</button></td>
              </tr>
            ))}
            {data.holidays.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">등록된 휴무가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
