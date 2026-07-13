"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client";

type L = { id: number; order: number; nameKo: string; wordCount: number };
type WB = { id: number; name: string; wordCount: number };
type Q = {
  no: number; type: "EN_KO" | "KO_EN" | "EN_DEF";
  text: string; pos: string; meanings: string[];
  choices?: string[]; answerIndex?: number;
};
type Paper = { orgName: string; sourceName: string; from: number; to: number; total: number; questions: Q[] };

const POS_KO: Record<string, string> = {
  n: "명", v: "동", adj: "형", adv: "부", prep: "전", conj: "접", pron: "대", int: "감", num: "수", phrase: "숙어",
};
const CIRCLED = ["①", "②", "③", "④"];

// 시험지 전용 스타일 — 화면 미리보기와 인쇄 창에서 동일하게 사용
const SHEET_CSS = `
.sheet { background: #fff; color: #111; font-family: 'Pretendard', 'Malgun Gothic', sans-serif; padding: 34px 38px; max-width: 794px; margin: 0 auto; }
.sheet-org { text-align: center; font-size: 12px; letter-spacing: 3px; color: #555; font-weight: 700; }
.sheet-title { text-align: center; font-size: 24px; font-weight: 900; margin: 6px 0 2px; color: #16204a; }
.sheet-sub { text-align: center; font-size: 12px; color: #666; margin-bottom: 14px; }
.sheet-info { display: flex; border: 1.5px solid #16204a; border-radius: 8px; margin-bottom: 18px; }
.sheet-info > div { flex: 1; padding: 8px 12px; font-size: 13px; border-right: 1px solid #d5d9e5; }
.sheet-info > div:last-child { border-right: none; }
.sheet-info b { color: #16204a; margin-right: 8px; font-size: 12px; }
.q-list { display: grid; grid-template-columns: 1fr 1fr; column-gap: 26px; }
.q { display: flex; align-items: baseline; gap: 8px; padding: 7px 2px; border-bottom: 1px dashed #e2e5ee; break-inside: avoid; }
.q.q-full { grid-column: 1 / -1; }  /* 4지선다(영어풀이)는 한 줄 전체 */
.q-no { font-weight: 800; color: #16204a; min-width: 26px; font-size: 14px; }
.q-body { flex: 1; }
.q-prompt { font-size: 15px; font-weight: 600; }
.q-pos { font-size: 11px; color: #888; font-weight: 400; margin-left: 4px; }
.q-line { flex: 1; border-bottom: 1.5px solid #aab; min-width: 70px; align-self: flex-end; margin-bottom: 3px; }
.q-choices { margin-top: 5px; font-size: 13px; line-height: 1.9; color: #222; }
.q-choices span { margin-right: 14px; white-space: nowrap; display: inline-block; }
.answer-sheet { page-break-before: always; margin-top: 30px; }
.answer-title { font-size: 16px; font-weight: 900; color: #16204a; border-bottom: 2px solid #16204a; padding-bottom: 6px; margin-bottom: 10px; }
.answer-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 18px; font-size: 13px; }
.answer-grid div { padding: 3px 0; border-bottom: 1px dotted #dde; }
.answer-grid b { color: #16204a; margin-right: 6px; }
.sheet-footer { margin-top: 22px; text-align: center; font-size: 10px; color: #999; }
@media print { body { margin: 0; } .sheet { padding: 10mm 12mm; max-width: none; } }
`;

export default function PaperPage() {
  const [levels, setLevels] = useState<L[]>([]);
  const [wordbooks, setWordbooks] = useState<WB[]>([]);
  const [target, setTarget] = useState("");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(30);
  const [count, setCount] = useState(20);
  const [order, setOrder] = useState<"RANDOM" | "SEQ">("RANDOM");
  const [mode, setMode] = useState<"EN_KO" | "KO_EN" | "EN_DEF" | "MIX">("EN_KO");
  const [mixIncludeDef, setMixIncludeDef] = useState(false);
  const [withAnswers, setWithAnswers] = useState(true);
  const [title, setTitle] = useState("");
  const [paper, setPaper] = useState<Paper | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ levels: L[] }>("/api/admin/levels").then((d) => setLevels(d.levels));
    api<{ wordbooks: WB[] }>("/api/admin/wordbooks").then((d) => setWordbooks(d.wordbooks)).catch(() => setWordbooks([]));
  }, []);

  const maxNo = useMemo(() => {
    if (target.startsWith("L")) return levels.find((l) => l.id === Number(target.slice(1)))?.wordCount ?? 0;
    if (target.startsWith("W")) return wordbooks.find((w) => w.id === Number(target.slice(1)))?.wordCount ?? 0;
    return 0;
  }, [target, levels, wordbooks]);
  const rangeSize = Math.max(0, Math.min(to, maxNo) - Math.max(1, from) + 1);
  const isWordbook = target.startsWith("W");

  async function generate() {
    if (!target) { alert("레벨 또는 단어장을 선택하세요."); return; }
    setBusy(true);
    setPaper(null);
    try {
      const body: Record<string, unknown> = { from, to, count, order, mode, mixIncludeDef };
      if (target.startsWith("L")) body.levelId = Number(target.slice(1));
      else body.wordbookId = Number(target.slice(1));
      const p = await api<Paper>("/api/admin/paper", { method: "POST", body: JSON.stringify(body) });
      setPaper(p);
      setShowPreview(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : "문제 생성 실패");
    } finally {
      setBusy(false);
    }
  }

  function printSheet() {
    const el = sheetRef.current;
    if (!el) return;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) { alert("팝업이 차단됐어요. 팝업 허용 후 다시 눌러주세요."); return; }
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>단어 시험지</title><style>${SHEET_CSS}</style></head><body>${el.outerHTML}</body></html>`
    );
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  const modeKo = { EN_KO: "영어 → 한국어", KO_EN: "한국어 → 영어", EN_DEF: "영어단어 → 영어풀이 (4지선다)", MIX: "혼합" }[mode];

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: SHEET_CSS }} />
      <div>
        <h1 className="text-xl font-black text-[#16204a]">📝 시험지 출제</h1>
        <p className="text-xs text-slate-400 mt-1">범위·문항 수·유형을 정하면 학원 이름이 들어간 인쇄용 시험지가 만들어집니다.</p>
      </div>

      <div className="card p-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">1. 레벨 / 단어장</label>
            <select className="input" value={target} onChange={(e) => { setTarget(e.target.value); setFrom(1); setTo(30); }}>
              <option value="">선택하세요</option>
              <optgroup label="레벨">
                {levels.map((l) => <option key={l.id} value={`L${l.id}`}>Lv.{l.order} {l.nameKo} ({l.wordCount}단어)</option>)}
              </optgroup>
              {wordbooks.length > 0 && (
                <optgroup label="커스텀 단어장">
                  {wordbooks.map((w) => <option key={w.id} value={`W${w.id}`}>{w.name} ({w.wordCount}단어)</option>)}
                </optgroup>
              )}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">시험지 제목 (비우면 자동)</label>
            <input className="input" placeholder="예: 3월 2주차 단어시험" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">2. 단어 번호 범위 {maxNo > 0 && <span className="text-slate-400">(1 ~ {maxNo})</span>}</label>
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={maxNo || undefined} className="input" value={from} onChange={(e) => setFrom(Number(e.target.value))} />
              <span className="text-slate-400">~</span>
              <input type="number" min={1} max={maxNo || undefined} className="input" value={to} onChange={(e) => setTo(Number(e.target.value))} />
            </div>
            {rangeSize > 0 && <p className="text-[11px] text-slate-400 mt-1">범위 안 단어 {rangeSize}개</p>}
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">3. 출제 문항 수</label>
            <input type="number" min={1} max={rangeSize || undefined} className="input" value={count} onChange={(e) => setCount(Number(e.target.value))} />
            {rangeSize > 0 && count < rangeSize && <p className="text-[11px] text-slate-400 mt-1">{rangeSize}개 중 무작위 {count}문제</p>}
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">4. 문제 순서</label>
            <div className="flex gap-2">
              {([["RANDOM", "랜덤"], ["SEQ", "번호순"]] as const).map(([v, label]) => (
                <button key={v} onClick={() => setOrder(v)}
                  className={"chip flex-1 justify-center " + (order === v ? "bg-[#16204a] text-white" : "bg-slate-100 text-slate-500")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">5. 출제 방식</label>
          <div className="flex flex-wrap gap-2">
            {([["EN_KO", "영어 → 한국어"], ["KO_EN", "한국어 → 영어"], ["EN_DEF", "영어 → 영어풀이 (4지선다)"], ["MIX", "혼합"]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setMode(v)}
                className={"chip " + (mode === v ? "bg-[#16204a] text-white" : "bg-slate-100 text-slate-500")}>
                {label}
              </button>
            ))}
          </div>
          {mode === "MIX" && (
            <div className="mt-2 flex flex-wrap gap-2 items-center pl-1">
              <span className="text-xs text-slate-500">혼합 범위:</span>
              <button onClick={() => setMixIncludeDef(false)}
                className={"chip text-xs " + (!mixIncludeDef ? "bg-[#c9a227] text-white" : "bg-slate-100 text-slate-500")}>
                영→한 + 한→영만
              </button>
              <button onClick={() => setMixIncludeDef(true)}
                className={"chip text-xs " + (mixIncludeDef ? "bg-[#c9a227] text-white" : "bg-slate-100 text-slate-500")}>
                영어풀이(4지선다)도 포함
              </button>
            </div>
          )}
          {(mode === "EN_DEF" || (mode === "MIX" && mixIncludeDef)) && isWordbook && (
            <p className="text-[11px] text-amber-600 mt-1">⚠️ 커스텀 단어장에는 영어풀이 데이터가 없어 해당 유형이 빠질 수 있어요.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <label className="flex items-center gap-2 text-sm text-slate-600 font-bold">
            <input type="checkbox" checked={withAnswers} onChange={(e) => setWithAnswers(e.target.checked)} />
            정답지(교사용) 함께 만들기
          </label>
          <div className="ml-auto flex gap-2">
            <button className="btn-primary" onClick={generate} disabled={busy || !target}>
              {busy ? "만드는 중..." : "🔍 미리보기"}
            </button>
            {paper && (
              <button className="btn-ghost border border-slate-200" onClick={printSheet}>🖨️ 인쇄하기</button>
            )}
          </div>
        </div>
      </div>

      {/* 시험지 (항상 렌더 — 미리보기 모달과 인쇄에 공용) */}
      {paper && (
        <div className={showPreview ? "fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4 sm:p-8" : "hidden"} onClick={() => setShowPreview(false)}>
          <div className="max-w-[840px] mx-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end gap-2 mb-2">
              <button className="chip bg-[#c9a227] text-white !py-2 !px-4 font-black" onClick={printSheet}>🖨️ 인쇄하기</button>
              <button className="chip bg-white text-slate-600 !py-2 !px-4" onClick={() => setShowPreview(false)}>✕ 닫기</button>
            </div>
            <div className="rounded-xl overflow-hidden shadow-2xl">
              <div ref={sheetRef}>
                <div className="sheet">
                  <p className="sheet-org">{paper.orgName}</p>
                  <h2 className="sheet-title">{title.trim() || "단어 시험"}</h2>
                  <p className="sheet-sub">{paper.sourceName} · {paper.from}번 ~ {paper.to}번 · {paper.questions.length}문항 · {modeKo}</p>
                  <div className="sheet-info">
                    <div><b>반</b></div>
                    <div><b>이름</b></div>
                    <div><b>날짜</b>&nbsp;&nbsp;&nbsp;&nbsp;.&nbsp;&nbsp;&nbsp;&nbsp;.</div>
                    <div><b>점수</b>&nbsp;&nbsp;&nbsp;&nbsp;/ {paper.questions.length}</div>
                  </div>
                  <div className="q-list">
                    {paper.questions.map((q, i) => (
                      <div className={"q" + (q.type === "EN_DEF" ? " q-full" : "")} key={i}>
                        <span className="q-no">{i + 1}.</span>
                        <div className="q-body">
                          <span className="q-prompt">
                            {q.type === "KO_EN" ? q.meanings.slice(0, 2).join(", ") : q.text}
                            <span className="q-pos">({POS_KO[q.pos] ?? q.pos})</span>
                          </span>
                          {q.type === "EN_DEF" && q.choices && (
                            <div className="q-choices">
                              {q.choices.map((c, ci) => <span key={ci}>{CIRCLED[ci]} {c}</span>)}
                            </div>
                          )}
                        </div>
                        {q.type !== "EN_DEF" && <span className="q-line" />}
                        {q.type === "EN_DEF" && <span className="q-no" style={{ minWidth: 40, textAlign: "right", color: "#aab" }}>(&nbsp;&nbsp;&nbsp;)</span>}
                      </div>
                    ))}
                  </div>
                  {withAnswers && (
                    <div className="answer-sheet">
                      <p className="answer-title">✂ 정답지 (교사용) — {title.trim() || "단어 시험"} · {paper.sourceName}</p>
                      <div className="answer-grid">
                        {paper.questions.map((q, i) => (
                          <div key={i}>
                            <b>{i + 1}.</b>
                            {q.type === "EN_KO" && q.meanings.join(", ")}
                            {q.type === "KO_EN" && q.text}
                            {q.type === "EN_DEF" && `${CIRCLED[q.answerIndex ?? 0]} (${q.text})`}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="sheet-footer">{paper.orgName} · 정철 VOCA</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {paper && !showPreview && (
        <div className="card p-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">✅ <b className="text-[#16204a]">{paper.questions.length}문항</b> 시험지가 준비됐습니다. ({paper.sourceName} {paper.from}~{paper.to}번)</p>
          <div className="flex gap-2">
            <button className="chip bg-slate-100 text-slate-600 !py-2 !px-4" onClick={() => setShowPreview(true)}>🔍 미리보기</button>
            <button className="chip bg-[#c9a227] text-white !py-2 !px-4 font-black" onClick={printSheet}>🖨️ 인쇄하기</button>
          </div>
        </div>
      )}
    </div>
  );
}
