"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";

// 반의 날짜별 진도 달력
//  - 왼쪽: 진도 단위 (VOCA 범위 / 교재 레슨). 끌어서 날짜에 놓거나, 눌러서 고른 뒤 날짜를 누른다
//  - 오른쪽: 달력 (2026~2040). 주말·공휴일·학원/반 휴무가 표시된다
//  - 순서대로 채우기: 시작 날짜부터 학습일에만 차례로 놓는다

type Unit = { key: string; kind: "WORDS" | "LESSON"; label: string; sub?: string; wordFrom?: number; wordTo?: number; lessonId?: number };
type Plan = { date: string; kind: string; label: string; lessonId: number | null; wordFrom: number | null; wordTo: number | null };
type Data = {
  units: { words: Unit[]; lessons: Unit[]; wordTotal: number; sourceName: string; textbookName: string; perDay: number; program: string };
  days: Record<string, { off: string | null; kr: string | null }>;
  studyDays: string[];
  plans: Plan[];
};

const MIN_YEAR = 2026, MAX_YEAR = 2040;
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const todayKst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export default function PlanCalendar({ classId }: { classId: number }) {
  const t = todayKst();
  const [year, setYear] = useState(Math.min(MAX_YEAR, Math.max(MIN_YEAR, Number(t.slice(0, 4)))));
  const [month, setMonth] = useState(Number(t.slice(5, 7)));
  const [data, setData] = useState<Data | null>(null);
  const [side, setSide] = useState<"WORDS" | "LESSON">("WORDS");
  const [selected, setSelected] = useState<Unit | null>(null);
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [fill, setFill] = useState({ open: false, startDate: "", fromUnit: "", count: "", overwrite: false });

  const from = ymd(year, month, 1);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = ymd(year, month, lastDay);

  const load = useCallback(() => {
    api<Data>(`/api/admin/classes/${classId}/plan?from=${from}&to=${to}`).then((d) => {
      setData(d);
      // 반 과정에 맞는 쪽을 보여준다 (교재 과정 반에는 VOCA 범위가 의미 없다)
      const showWords = d.units.program !== "TEXTBOOK" && d.units.words.length > 0;
      const showLessons = d.units.lessons.length > 0;
      setSide(showLessons && (!showWords || d.units.program === "TEXTBOOK") ? "LESSON" : "WORDS");
    }).catch((e) => alert(e instanceof Error ? e.message : "불러오지 못했습니다."));
  }, [classId, from, to]);
  useEffect(load, [load]);

  const planByDate = useMemo(() => new Map((data?.plans ?? []).map((p) => [p.date, p])), [data]);
  const units = data ? (side === "WORDS" ? data.units.words : data.units.lessons) : [];

  async function assign(date: string, unitKey: string) {
    setBusy(true);
    try {
      await api(`/api/admin/classes/${classId}/plan`, { method: "PUT", body: JSON.stringify({ date, unit: unitKey }) });
      load();
    } catch (e) { alert(e instanceof Error ? e.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function clear(date: string) {
    setBusy(true);
    try { await api(`/api/admin/classes/${classId}/plan?date=${date}`, { method: "DELETE" }); load(); }
    catch (e) { alert(e instanceof Error ? e.message : "지우지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function move(fromDate: string, toDate: string) {
    const p = planByDate.get(fromDate);
    if (!p || fromDate === toDate) return;
    const key = p.kind === "LESSON" ? `L:${p.lessonId}` : `W:${p.wordFrom}:${p.wordTo}`;
    setBusy(true);
    try {
      await api(`/api/admin/classes/${classId}/plan`, { method: "PUT", body: JSON.stringify({ date: toDate, unit: key }) });
      await api(`/api/admin/classes/${classId}/plan?date=${fromDate}`, { method: "DELETE" });
      load();
    } catch (e) { alert(e instanceof Error ? e.message : "옮기지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function clearMonth() {
    if (!confirm(`${year}년 ${month}월의 진도를 모두 지울까요?`)) return;
    setBusy(true);
    try { await api(`/api/admin/classes/${classId}/plan?from=${from}&to=${to}`, { method: "DELETE" }); load(); }
    catch (e) { alert(e instanceof Error ? e.message : "지우지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function runFill() {
    if (!fill.startDate) { alert("시작 날짜를 고르세요."); return; }
    setBusy(true);
    try {
      const r = await api<{ placed: number; requested: number; lastDate: string | null }>(`/api/admin/classes/${classId}/plan`, {
        method: "POST",
        body: JSON.stringify({ startDate: fill.startDate, fromUnit: fill.fromUnit, kind: side, count: fill.count ? Number(fill.count) : undefined, overwrite: fill.overwrite }),
      });
      alert(`${r.placed}개 진도를 놓았습니다.${r.lastDate ? ` (마지막 날: ${r.lastDate})` : ""}${r.placed < r.requested ? "\n2040년을 넘거나 빈 학습일이 모자라 일부는 놓지 못했습니다." : ""}`);
      setFill((f) => ({ ...f, open: false }));
      load();
    } catch (e) { alert(e instanceof Error ? e.message : "채우지 못했습니다."); }
    finally { setBusy(false); }
  }

  function onDayClick(date: string) {
    if (!selected) return;
    void assign(date, selected.key);
  }
  function onDrop(e: React.DragEvent, date: string) {
    e.preventDefault();
    setHover(null);
    const raw = e.dataTransfer.getData("text/plain");
    if (raw.startsWith("move:")) void move(raw.slice(5), date);
    else if (raw) void assign(date, raw);
  }

  function addCustom() {
    const a = Number(custom.from), b = Number(custom.to);
    if (!a || !b || a > b) { alert("시작·끝 번호를 확인하세요."); return; }
    if (data && data.units.wordTotal && b > data.units.wordTotal) { alert(`이 반의 단어는 ${data.units.wordTotal}번까지입니다.`); return; }
    setSelected({ key: `W:${a}:${b}`, kind: "WORDS", label: `${a}~${b}번`, wordFrom: a, wordTo: b });
  }

  const prevMonth = () => { if (month === 1) { if (year > MIN_YEAR) { setYear(year - 1); setMonth(12); } } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 12) { if (year < MAX_YEAR) { setYear(year + 1); setMonth(1); } } else setMonth(month + 1); };

  if (!data) return <p className="text-slate-400 text-center py-16">불러오는 중...</p>;

  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const cells: (string | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: lastDay }, (_, i) => ymd(year, month, i + 1))];
  while (cells.length % 7) cells.push(null);
  const noUnits = (data.units.program === "TEXTBOOK" || data.units.words.length === 0) && data.units.lessons.length === 0;

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <h2 className="font-black text-[#16204a]">📅 날짜별 진도</h2>
        <p className="text-xs text-slate-400 mt-1">
          왼쪽 진도 단위를 <b>끌어서 날짜에 놓거나</b>, 단위를 누른 뒤 날짜를 누르세요. 날짜에 놓인 진도는 다른 날로 끌어 옮길 수 있고, × 로 지웁니다.
          여기서 정한 진도가 그날 학생 홈과 시험에 <b>최우선</b>으로 적용됩니다. 정하지 않은 날은 기존 방식(순서대로)으로 나갑니다.
        </p>
      </div>

      {noUnits && (
        <div className="card p-6 text-center text-slate-400 text-sm">
          이 반에 배정된 VOCA 학습이나 교재가 없어요. 먼저 <b>VOCA 배정</b> 또는 <b>교재 배정</b> 탭에서 배정하세요.
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        {/* 진도 단위 */}
        <div className="card p-3 space-y-2 self-start lg:sticky lg:top-24">
          {(() => {
            const showWords = data.units.program !== "TEXTBOOK" && data.units.words.length > 0;
            const showLessons = data.units.lessons.length > 0;
            if (!(showWords && showLessons)) return (
              <p className="text-xs font-black text-[#16204a]">{side === "LESSON" ? "📕 교재 레슨" : "📚 VOCA 단어 범위"}</p>
            );
            return (
              <div className="flex gap-1">
                <button onClick={() => setSide("WORDS")} className={"chip flex-1 justify-center " + (side === "WORDS" ? "bg-[#16204a] text-white" : "bg-slate-100 text-slate-500")}>📚 VOCA</button>
                <button onClick={() => setSide("LESSON")} className={"chip flex-1 justify-center " + (side === "LESSON" ? "bg-[#16204a] text-white" : "bg-slate-100 text-slate-500")}>📕 교재</button>
              </div>
            );
          })()}
          <p className="text-[11px] text-slate-400">
            {side === "WORDS" ? `${data.units.sourceName} · ${data.units.wordTotal}단어 · 하루 ${data.units.perDay}개씩` : data.units.textbookName}
          </p>
          {selected && (
            <div className="rounded-xl bg-[#fdfaf0] border border-[#c9a227] p-2 text-xs">
              <b className="text-[#c9a227]">선택됨:</b> {selected.label} — 날짜를 누르면 놓입니다
              <button className="ml-2 text-slate-400" onClick={() => setSelected(null)}>해제</button>
            </div>
          )}
          {side === "WORDS" && (
            <div className="flex items-center gap-1 text-xs">
              <input type="number" className="input !py-1 w-16 text-center" placeholder="1" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
              <span>~</span>
              <input type="number" className="input !py-1 w-16 text-center" placeholder="30" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
              <button className="chip bg-slate-100 text-slate-600 !py-1" onClick={addCustom}>직접 범위</button>
            </div>
          )}
          <div className="max-h-[420px] overflow-y-auto space-y-1 pr-1">
            {units.map((u) => (
              <div key={u.key} draggable
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", u.key); e.dataTransfer.effectAllowed = "copy"; }}
                onClick={() => setSelected(selected?.key === u.key ? null : u)}
                className={"cursor-grab active:cursor-grabbing rounded-lg px-2.5 py-1.5 text-xs border transition-colors " +
                  (selected?.key === u.key ? "bg-[#16204a] text-white border-[#16204a]" : "bg-white border-slate-200 hover:border-[#16204a]")}>
                <span className="font-bold">{u.label}</span>
                {u.sub && <span className={"block truncate " + (selected?.key === u.key ? "text-indigo-100" : "text-slate-400")}>{u.sub}</span>}
              </div>
            ))}
          </div>

          {/* 순서대로 채우기 */}
          <div className="border-t border-slate-100 pt-2">
            {!fill.open ? (
              <button className="btn-ghost w-full !py-2 text-sm" disabled={units.length === 0}
                onClick={() => setFill({ open: true, startDate: from >= t ? from : t, fromUnit: units[0]?.key ?? "", count: "", overwrite: false })}>
                ⚡ 순서대로 채우기
              </button>
            ) : (
              <div className="space-y-1.5 text-xs">
                <p className="font-bold text-[#16204a]">⚡ 순서대로 채우기</p>
                <label className="block">시작 날짜<input type="date" className="input !py-1 mt-0.5" min={`${MIN_YEAR}-01-01`} max={`${MAX_YEAR}-12-31`} value={fill.startDate} onChange={(e) => setFill({ ...fill, startDate: e.target.value })} /></label>
                <label className="block">시작 단위
                  <select className="input !py-1 mt-0.5" value={fill.fromUnit} onChange={(e) => setFill({ ...fill, fromUnit: e.target.value })}>
                    {units.map((u) => <option key={u.key} value={u.key}>{u.label}{u.sub ? ` — ${u.sub}` : ""}</option>)}
                  </select>
                </label>
                <label className="block">몇 개까지 (비우면 끝까지)<input type="number" min={1} className="input !py-1 mt-0.5" value={fill.count} onChange={(e) => setFill({ ...fill, count: e.target.value })} /></label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={fill.overwrite} onChange={(e) => setFill({ ...fill, overwrite: e.target.checked })} /> 이미 있는 날도 덮어쓰기</label>
                <p className="text-[10px] text-slate-400">주말·공휴일·휴무·학습 요일이 아닌 날은 건너뜁니다.</p>
                <div className="flex gap-1">
                  <button className="btn-primary flex-1 !py-1.5 text-xs" disabled={busy} onClick={runFill}>채우기</button>
                  <button className="btn-ghost !py-1.5 text-xs" onClick={() => setFill({ ...fill, open: false })}>취소</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 달력 */}
        <div className="card p-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <button className="chip bg-slate-100 text-slate-600" onClick={prevMonth} disabled={year === MIN_YEAR && month === 1}>←</button>
            <select className="input !py-1 w-auto text-sm font-bold" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i).map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select className="input !py-1 w-auto text-sm font-bold" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}월</option>)}
            </select>
            <button className="chip bg-slate-100 text-slate-600" onClick={nextMonth} disabled={year === MAX_YEAR && month === 12}>→</button>
            <button className="chip bg-white border border-slate-200 text-slate-500" onClick={() => { setYear(Number(t.slice(0, 4))); setMonth(Number(t.slice(5, 7))); }}>오늘</button>
            <span className="ml-auto text-[11px] text-slate-400">
              이 달 진도 {data.plans.length}일
              {data.plans.length > 0 && <button className="ml-2 text-rose-500 font-bold" onClick={clearMonth}>모두 지우기</button>}
            </span>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-bold text-slate-400 mb-1">
            {DOW.map((d, i) => <div key={d} className={i === 0 ? "text-rose-400" : i === 6 ? "text-sky-500" : ""}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((date, i) => {
              if (!date) return <div key={`b${i}`} />;
              const info = data.days[date];
              const off = info?.off ?? null;
              const kr = info?.kr ?? null;
              const plan = planByDate.get(date);
              const dow = i % 7;
              const isToday = date === t;
              return (
                <div key={date}
                  onClick={() => onDayClick(date)}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setHover(date); }}
                  onDragLeave={() => setHover((h) => (h === date ? null : h))}
                  onDrop={(e) => onDrop(e, date)}
                  className={
                    "min-h-[72px] rounded-lg border p-1 text-left transition-colors " +
                    (hover === date ? "border-[#c9a227] bg-[#fdfaf0] " :
                     off ? "border-slate-100 bg-slate-50 " : "border-slate-200 bg-white ") +
                    (selected && !off ? "cursor-pointer hover:border-[#16204a] " : "") +
                    (isToday ? "ring-2 ring-[#16204a]/30 " : "")
                  }>
                  <div className="flex items-start justify-between">
                    <span className={"text-xs font-bold " + (kr || dow === 0 ? "text-rose-500" : dow === 6 ? "text-sky-500" : "text-slate-600")}>
                      {Number(date.slice(8))}
                    </span>
                    {isToday && <span className="text-[9px] text-[#16204a] font-bold">오늘</span>}
                  </div>
                  {off && <p className="text-[10px] text-slate-400 leading-tight truncate" title={off}>{off}</p>}
                  {plan && (
                    <div draggable
                      onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData("text/plain", `move:${date}`); }}
                      onClick={(e) => e.stopPropagation()}
                      className={"mt-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white flex items-center gap-1 cursor-grab " +
                        (plan.kind === "LESSON" ? "bg-[#c9a227]" : "bg-[#16204a]")}
                      title={plan.label}>
                      <span className="truncate flex-1">{plan.label}</span>
                      <button className="opacity-70 hover:opacity-100" disabled={busy} onClick={(e) => { e.stopPropagation(); void clear(date); }}>×</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-slate-400">
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#16204a] mr-1" />VOCA 진도</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#c9a227] mr-1" />교재 레슨</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-100 border border-slate-200 mr-1" />쉬는 날 (주말·공휴일·휴무·학습 요일 아님)</span>
            <span className="text-rose-500">빨간 날짜 = 공휴일·일요일</span>
          </div>
        </div>
      </div>
    </div>
  );
}
