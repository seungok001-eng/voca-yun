"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { EXAM_LEVELS, CLOZE_LEVELS } from "@/lib/exam-levels";
import { parseCloze, buildCloze, sentenceOf, blankAt, type Token, type Blank } from "@/lib/cloze-edit";

type Kind = "VOCAB" | "GRAMMAR" | "CLOZE" | "COMPOSITION";
type WordPair = { text: string; meaning: string };
type Q = {
  no: number; prompt: string; promptKo?: string;
  choices?: string[]; answer: string; explanation: string; points?: string[];
};
type Paper = {
  id?: number; orgName?: string; kind: Kind; title: string; levelLabel: string; instruction: string;
  passage?: string; passageKo?: string; wordBank?: string[];
  questions: Q[];
  teacherNotes: { heading: string; body: string }[];
  vocabNotes: { word: string; meaning: string; note?: string }[];
};
type SavedRow = { id: number; kind: Kind; title: string; level: string; author: string; createdAt: string };

const KIND_INFO: Record<Kind, { label: string; icon: string; desc: string; want: "WORDS" | "TEXT" }> = {
  VOCAB: { label: "단어 시험", icon: "🔤", desc: "단어와 뜻이 적힌 사진이나 엑셀을 올리세요.", want: "WORDS" },
  GRAMMAR: { label: "문법 시험", icon: "📐", desc: "문법 항목 이름과 학년을 넣으면 만들어 드려요.", want: "TEXT" },
  CLOZE: { label: "빈칸 채우기", icon: "✏️", desc: "독해 본문을 올리면 중요한 곳에 빈칸을 뚫어 드려요.", want: "TEXT" },
  COMPOSITION: { label: "영작 시험", icon: "🖊️", desc: "우리말이나 영어 문장을 올리면 영작 문제로 만들어 드려요.", want: "TEXT" },
};
const CIRCLED = ["①", "②", "③", "④", "⑤"];

const SHEET_CSS = `
.esheet { background:#fff; color:#111; font-family:'Pretendard','Malgun Gothic',sans-serif; padding:32px 36px; max-width:794px; margin:0 auto; }
.esheet + .esheet { page-break-before: always; }
.e-org { text-align:center; font-size:12px; letter-spacing:3px; color:#555; font-weight:700; }
.e-title { text-align:center; font-size:22px; font-weight:900; margin:6px 0 2px; color:#16204a; }
.e-sub { text-align:center; font-size:12px; color:#666; margin-bottom:14px; }
.e-info { display:flex; border:1.5px solid #16204a; border-radius:8px; margin-bottom:16px; }
.e-info > div { flex:1; padding:8px 12px; font-size:13px; border-right:1px solid #d5d9e5; }
.e-info > div:last-child { border-right:none; }
.e-info b { color:#16204a; margin-right:8px; font-size:12px; }
.e-inst { background:#f4f6fb; border-left:4px solid #16204a; padding:9px 13px; font-size:13px; font-weight:700; color:#16204a; margin-bottom:14px; border-radius:0 6px 6px 0; }
.e-passage { border:1.2px solid #ccd; border-radius:8px; padding:14px 16px; font-size:14px; line-height:2.15; margin-bottom:16px; white-space:pre-wrap; }
.e-bank { border:1.5px dashed #c9a227; border-radius:8px; padding:10px 14px; margin-bottom:16px; font-size:13px; }
.e-bank b { color:#c9a227; margin-right:8px; }
.e-blank { display:inline-block; min-width:74px; border-bottom:1.5px solid #333; text-align:center; font-weight:700; color:#16204a; }
.e-q { padding:9px 2px; border-bottom:1px dashed #e2e5ee; break-inside:avoid; font-size:14px; }
.e-q-head { display:flex; gap:8px; align-items:baseline; }
.e-no { font-weight:800; color:#16204a; min-width:26px; }
.e-prompt { flex:1; line-height:1.75; white-space:pre-wrap; }
.e-ko { color:#333; font-weight:700; }
.e-choices { margin:6px 0 0 34px; font-size:13px; line-height:1.95; }
.e-choices span { display:inline-block; margin-right:16px; }
.e-write { margin:8px 0 2px 34px; border-bottom:1.5px solid #aab; height:20px; }
.e-write2 { margin:8px 0 2px 34px; }
.e-write2 div { border-bottom:1.5px solid #aab; height:20px; margin-bottom:10px; }
.e-ans-title { font-size:15px; font-weight:900; color:#16204a; border-bottom:2px solid #16204a; padding-bottom:6px; margin-bottom:10px; }
.e-ans-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:3px 18px; font-size:13px; }
.e-ans-grid div { padding:3px 0; border-bottom:1px dotted #dde; }
.e-ans-grid b { color:#16204a; margin-right:6px; }
.e-exp { break-inside:avoid; padding:9px 0; border-bottom:1px solid #eef; font-size:13px; }
.e-exp-q { font-weight:700; color:#16204a; }
.e-exp-a { color:#0a7d43; font-weight:700; margin:3px 0; }
.e-exp-b { color:#333; line-height:1.7; }
.e-points { margin-top:4px; }
.e-points span { display:inline-block; background:#f4f6fb; border-radius:4px; padding:2px 7px; font-size:11px; color:#3a4a7d; margin:2px 4px 0 0; }
.e-note { break-inside:avoid; margin-bottom:11px; }
.e-note b { color:#16204a; display:block; font-size:13.5px; margin-bottom:2px; }
.e-note p { font-size:12.5px; color:#333; line-height:1.75; white-space:pre-wrap; }
.e-vocab { display:grid; grid-template-columns:repeat(2,1fr); gap:2px 18px; font-size:12.5px; }
.e-vocab div { padding:3px 0; border-bottom:1px dotted #dde; break-inside:avoid; }
.e-vocab b { color:#16204a; }
.e-vocab i { color:#777; font-style:normal; font-size:11.5px; display:block; }
.e-foot { margin-top:20px; text-align:center; font-size:10px; color:#999; }
.ed-passage { font-size:15px; line-height:2.4; white-space:pre-wrap; }
.ed-w { cursor:pointer; border-radius:4px; padding:1px 2px; transition:background .1s; }
.ed-w:hover { background:#e9edf8; }
.ed-b { cursor:pointer; display:inline-block; background:#16204a; color:#fff; border-radius:6px; padding:0 8px; margin:0 1px; font-weight:700; }
.ed-b:hover { background:#c9a227; }
.ed-b small { opacity:.75; font-weight:400; margin-right:4px; }
@media print { body{margin:0} .esheet{padding:10mm 12mm; max-width:none} }
`;

export default function ExamMakerPage() {
  const [kind, setKind] = useState<Kind>("VOCAB");
  const [level, setLevel] = useState("M1");
  const [quality, setQuality] = useState<"FLASH" | "PRO">("FLASH");
  const [title, setTitle] = useState("");

  const [words, setWords] = useState<WordPair[]>([]);
  const [text, setText] = useState("");
  const [topics, setTopics] = useState("");
  const [count, setCount] = useState(15);
  const [vocabMode, setVocabMode] = useState("EN_KO");
  const [clozeLevel, setClozeLevel] = useState("C2");
  const [hint, setHint] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [paper, setPaper] = useState<Paper | null>(null);
  const [show, setShow] = useState<"none" | "student" | "answer" | "explain" | "edit">("none");
  // 빈칸 편집: 본문을 낱말로 쪼개 들고 있다가 저장할 때 다시 합친다
  const [edit, setEdit] = useState<{ tokens: Token[]; blanks: Blank[]; bank: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const loadSaved = () =>
    api<{ papers: SavedRow[] }>("/api/admin/exam/saved").then((d) => setSaved(d.papers)).catch(() => setSaved([]));
  useEffect(() => { loadSaved(); }, []);

  // 사진은 업로드 전에 화면 크기로 줄인다 (휴대폰 사진이 너무 큰 경우)
  async function shrink(file: File): Promise<File> {
    if (!file.type.startsWith("image/") || file.size < 1.2 * 1024 * 1024) return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(bmp.width * scale);
      cv.height = Math.round(bmp.height * scale);
      cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/jpeg", 0.9));
      return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
    } catch { return file; }
  }

  async function onFile(f: File | null) {
    if (!f) return;
    setExtracting(true);
    setNote("");
    try {
      const fd = new FormData();
      fd.append("file", await shrink(f));
      fd.append("want", KIND_INFO[kind].want);
      const res = await fetch("/api/admin/exam/extract", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "읽지 못했습니다.");
      if (KIND_INFO[kind].want === "WORDS") {
        if (!d.words?.length) throw new Error("단어를 찾지 못했습니다. 사진이 선명한지 확인해 주세요.");
        setWords(d.words);
      } else {
        if (!d.text?.trim()) throw new Error("글을 찾지 못했습니다.");
        setText((prev) => (prev.trim() ? `${prev}\n\n${d.text}` : d.text));
      }
      setNote(d.note || "");
    } catch (e) {
      alert(e instanceof Error ? e.message : "파일을 읽지 못했습니다.");
    } finally {
      setExtracting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function generate() {
    setBusy(true);
    setPaper(null);
    try {
      const body: Record<string, unknown> = { kind, level, quality, title };
      if (kind === "VOCAB") { body.words = words; body.mode = vocabMode; body.count = count; }
      if (kind === "GRAMMAR") { body.topics = topics; body.count = count; }
      if (kind === "CLOZE") { body.passage = text; body.clozeLevel = clozeLevel; }
      if (kind === "COMPOSITION") { body.source = text; body.count = count; body.hint = hint; }
      const p = await api<Paper>("/api/admin/exam/generate", { method: "POST", body: JSON.stringify(body) });
      setPaper(p);
      setShow("student");
      loadSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "시험지를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function openSaved(id: number) {
    try {
      const p = await api<Paper>(`/api/admin/exam/saved?id=${id}`);
      setPaper(p); setKind(p.kind); setShow("student");
    } catch (e) { alert(e instanceof Error ? e.message : "불러오지 못했습니다."); }
  }
  async function removeSaved(id: number) {
    if (!confirm("이 시험지를 삭제할까요?")) return;
    try { await api(`/api/admin/exam/saved?id=${id}`, { method: "DELETE" }); loadSaved(); }
    catch (e) { alert(e instanceof Error ? e.message : "삭제하지 못했습니다."); }
  }

  // ── 빈칸 편집 ──
  function startEdit() {
    if (!paper?.passage) return;
    const answers = new Map(paper.questions.map((q) => [q.no, q.answer]));
    const { tokens, blanks } = parseCloze(paper.passage, answers);
    setEdit({ tokens, blanks, bank: !!paper.wordBank?.length });
    setShow("edit");
  }

  function toggleToken(i: number) {
    setEdit((e) => {
      if (!e) return e;
      const at = blankAt(e.blanks, i);
      if (at >= 0) return { ...e, blanks: e.blanks.filter((_, k) => k !== at) };  // 빈칸 → 낱말로
      if (!e.tokens[i].core) return e;                                            // 문장부호만 있는 조각
      return { ...e, blanks: [...e.blanks, { start: i, end: i + 1 }] };            // 낱말 → 빈칸으로
    });
  }

  async function saveEdit() {
    if (!paper || !edit) return;
    setSaving(true);
    try {
      const sorted = [...edit.blanks].sort((a, b) => a.start - b.start);
      const { passage, answers } = buildCloze(edit.tokens, sorted);

      // 원래 있던 빈칸은 해설을 그대로 물려받고, 새로 만든 빈칸만 표시해 둔다
      const old = parseCloze(paper.passage!, new Map(paper.questions.map((q) => [q.no, q.answer])));
      const oldQ = new Map(old.blanks.map((b, k) => [`${b.start}-${b.end}`, paper.questions[k]]));
      const questions: Q[] = sorted.map((b, k) => {
        const prev = oldQ.get(`${b.start}-${b.end}`);
        return {
          no: k + 1,
          prompt: sentenceOf(edit.tokens, b),
          answer: answers[k],
          explanation: prev?.explanation ?? "",
          points: prev?.points,
        };
      });

      // 새 빈칸 해설은 AI에게 받는다 (실패해도 저장은 된다)
      const fresh = questions.filter((q) => !q.explanation);
      if (fresh.length > 0) {
        try {
          const full = edit.tokens.map((t) => t.lead + t.core + t.trail + t.ws).join("");
          const got = await api<{ items: { no: number; explanation: string; points?: string[] }[] }>(
            "/api/admin/exam/explain",
            { method: "POST", body: JSON.stringify({ passage: full, level: paper.levelLabel,
              items: fresh.map((q) => ({ no: q.no, answer: q.answer, sentence: q.prompt })) }) }
          );
          for (const it of got.items) {
            const q = questions.find((x) => x.no === it.no);
            if (q) { q.explanation = it.explanation; q.points = it.points; }
          }
        } catch { /* 해설 없이 저장 */ }
        for (const q of questions) if (!q.explanation) q.explanation = "선생님이 추가한 빈칸입니다.";
      }

      // <보기>: 정답은 모두 넣고, 원래 있던 오답 낱말은 그대로 둔다
      let wordBank: string[] | undefined;
      if (edit.bank) {
        const oldAnswers = new Set(paper.questions.map((q) => q.answer));
        const distractors = (paper.wordBank ?? []).filter((w) => !oldAnswers.has(w));
        wordBank = [...new Set([...answers, ...distractors])].sort(() => Math.random() - 0.5);
      }

      const next: Paper = { ...paper, passage, questions, wordBank };
      if (paper.id) await api("/api/admin/exam/saved", { method: "PUT", body: JSON.stringify({ id: paper.id, paper: next }) });
      setPaper(next);
      setEdit(null);
      setShow("student");
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function printSheet() {
    const el = sheetRef.current;
    if (!el) return;
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) { alert("팝업이 차단됐어요. 팝업 허용 후 다시 눌러주세요."); return; }
    win.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${paper?.title ?? "시험지"}</title><style>${SHEET_CSS}</style></head><body>${el.innerHTML}</body></html>`
    );
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  // 본문의 {{1}} 을 번호가 붙은 빈칸으로 그린다
  function renderPassage(s: string) {
    return s.split(/(\{\{\d+\}\})/g).map((part, i) => {
      const m = part.match(/^\{\{(\d+)\}\}$/);
      return m
        ? <span className="e-blank" key={i}>({m[1]})</span>
        : <span key={i}>{part}</span>;
    });
  }

  const ready =
    kind === "VOCAB" ? words.length >= 2 :
    kind === "GRAMMAR" ? topics.trim().length > 0 :
    text.trim().length >= 20;

  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: SHEET_CSS }} />
      <div>
        <h1 className="text-xl font-black text-[#16204a]">🤖 AI 시험지 만들기</h1>
        <p className="text-xs text-slate-400 mt-1">
          사진이나 엑셀을 올리면 단어·문법·빈칸 채우기·영작 시험지를 만들어 드립니다. 정답지와 해설지도 함께 나옵니다.
        </p>
      </div>

      {/* 1. 종류 */}
      <div className="card p-5 space-y-4">
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1.5">1. 어떤 시험지를 만들까요?</label>
          <div className="grid gap-2 sm:grid-cols-4">
            {(Object.keys(KIND_INFO) as Kind[]).map((k) => (
              <button key={k} onClick={() => { setKind(k); setPaper(null); setNote(""); }}
                className={"rounded-xl border-2 p-3 text-left transition-colors " +
                  (kind === k ? "border-[#16204a] bg-[#f4f6fb]" : "border-slate-200 hover:border-slate-300")}>
                <p className="font-black text-[#16204a] text-sm">{KIND_INFO[k].icon} {KIND_INFO[k].label}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{KIND_INFO[k].desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* 2. 재료 */}
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1.5">2. 자료 넣기</label>

          {kind === "GRAMMAR" ? (
            <input className="input" placeholder="예: 현재완료, 관계대명사 주격·목적격 (쉼표로 여러 개)"
              value={topics} onChange={(e) => setTopics(e.target.value)} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <input ref={fileRef} type="file" className="hidden"
                  accept="image/*,.xlsx,.xlsm,.xls,.csv,.txt"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
                <button className="btn-primary !py-2 text-sm" disabled={extracting}
                  onClick={() => fileRef.current?.click()}>
                  {extracting ? "읽는 중..." : "📎 사진 · 엑셀 올리기"}
                </button>
                <span className="text-[11px] text-slate-400">
                  {KIND_INFO[kind].want === "WORDS" ? "단어와 뜻이 보이게 찍은 사진 또는 엑셀" : "본문이 보이게 찍은 사진, 엑셀, 텍스트 파일"}
                  · 8MB 이하
                </span>
              </div>
              {note && <p className="text-[11px] text-amber-600 mb-2">⚠️ {note}</p>}

              {KIND_INFO[kind].want === "WORDS" ? (
                words.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 max-h-72 overflow-y-auto">
                    <div className="sticky top-0 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 flex justify-between">
                      <span>읽어온 단어 {words.length}개 — 틀린 곳은 고쳐주세요</span>
                      <button className="text-rose-500" onClick={() => setWords([])}>전체 지우기</button>
                    </div>
                    {words.map((w, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-t border-slate-100">
                        <span className="text-[11px] text-slate-400 w-6">{i + 1}</span>
                        <input className="input !py-1.5 flex-1" value={w.text}
                          onChange={(e) => setWords((ws) => ws.map((x, k) => k === i ? { ...x, text: e.target.value } : x))} />
                        <input className="input !py-1.5 flex-1" value={w.meaning}
                          onChange={(e) => setWords((ws) => ws.map((x, k) => k === i ? { ...x, meaning: e.target.value } : x))} />
                        <button className="text-slate-300 hover:text-rose-500 px-1"
                          onClick={() => setWords((ws) => ws.filter((_, k) => k !== i))}>✕</button>
                      </div>
                    ))}
                    <button className="w-full py-2 text-xs font-bold text-slate-400 hover:text-[#16204a] border-t border-slate-100"
                      onClick={() => setWords((ws) => [...ws, { text: "", meaning: "" }])}>+ 단어 추가</button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 rounded-xl border border-dashed border-slate-200 p-6 text-center">
                    사진이나 엑셀을 올리면 여기에 단어 목록이 나옵니다.
                  </p>
                )
              ) : (
                <textarea className="input min-h-[180px] font-mono text-[13px] leading-relaxed"
                  placeholder={kind === "CLOZE"
                    ? "독해 본문을 붙여넣거나 사진을 올리세요."
                    : "우리말 문장이나 영어 문장을 붙여넣거나 사진을 올리세요. 둘 다 있어도 됩니다."}
                  value={text} onChange={(e) => setText(e.target.value)} />
              )}
            </>
          )}
        </div>

        {/* 3. 조건 */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">3. 학년 (난이도)</label>
            <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
              {EXAM_LEVELS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>

          {kind === "CLOZE" ? (
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">빈칸 난이도</label>
              <select className="input" value={clozeLevel} onChange={(e) => setClozeLevel(e.target.value)}>
                {CLOZE_LEVELS.map((c) => <option key={c.code} value={c.code}>{c.label} · {c.rate}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1">
                문항 수 {kind === "VOCAB" && words.length > 0 && <span className="text-slate-400">(최대 {words.length})</span>}
              </label>
              <input type="number" min={1} max={kind === "VOCAB" ? words.length || 100 : 40}
                className="input" value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">문제 품질</label>
            <div className="flex gap-2">
              {([["FLASH", "표준 (빠름)"], ["PRO", "고급 (느림)"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => setQuality(v)}
                  className={"chip flex-1 justify-center " + (quality === v ? "bg-[#16204a] text-white" : "bg-slate-100 text-slate-500")}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {kind === "VOCAB" && (
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">출제 방식</label>
            <div className="flex flex-wrap gap-2">
              {([["EN_KO", "뜻 쓰기"], ["KO_EN", "영어로 쓰기"], ["CHOICE", "4지선다"], ["SENTENCE", "예문 빈칸"], ["MIX", "혼합"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => setVocabMode(v)}
                  className={"chip " + (vocabMode === v ? "bg-[#16204a] text-white" : "bg-slate-100 text-slate-500")}>{l}</button>
              ))}
            </div>
          </div>
        )}
        {kind === "COMPOSITION" && (
          <label className="flex items-center gap-2 text-sm text-slate-600 font-bold">
            <input type="checkbox" checked={hint} onChange={(e) => setHint(e.target.checked)} />
            낱말 &lt;보기&gt; 주기 (쉽게)
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <input className="input flex-1 min-w-[220px]" placeholder="시험지 제목 (비우면 자동)"
            value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn-primary" onClick={generate} disabled={busy || !ready || extracting}>
            {busy ? "만드는 중... (30초~2분)" : "✨ 시험지 만들기"}
          </button>
        </div>
        {busy && <p className="text-[11px] text-slate-400">AI가 문항과 해설을 쓰고 있습니다. 창을 닫지 마세요.</p>}
      </div>

      {/* 결과 */}
      {paper && (
        <div className="card p-4 flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[200px]">
            <p className="font-black text-[#16204a]">✅ {paper.title}</p>
            <p className="text-xs text-slate-400">{paper.levelLabel} · {paper.questions.length}문항</p>
          </div>
          <button className="chip bg-slate-100 text-slate-600 !py-2 !px-4" onClick={() => setShow("student")}>📄 문제지</button>
          <button className="chip bg-slate-100 text-slate-600 !py-2 !px-4" onClick={() => setShow("answer")}>✅ 정답지</button>
          <button className="chip bg-slate-100 text-slate-600 !py-2 !px-4" onClick={() => setShow("explain")}>📚 해설지</button>
          {paper.kind === "CLOZE" && paper.passage && (
            <button className="chip bg-[#c9a227] text-white !py-2 !px-4 font-black" onClick={startEdit}>✏️ 빈칸 편집</button>
          )}
        </div>
      )}

      {/* 미리보기 · 인쇄 */}
      {paper && (
        <div className={show !== "none" ? "fixed inset-0 z-50 bg-black/50 overflow-y-auto p-3 sm:p-8" : "hidden"}
          onClick={() => setShow("none")}>
          <div className="max-w-[860px] mx-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap justify-end gap-2 mb-2">
              {show === "edit" ? (
                <>
                  <span className="text-white text-sm font-bold self-center mr-auto">
                    ✏️ 낱말을 누르면 빈칸이 되고, 빈칸을 누르면 낱말로 돌아옵니다
                    · 빈칸 {edit?.blanks.length ?? 0}개
                    {edit && ` (${Math.round((edit.blanks.length / Math.max(1, edit.tokens.filter((t) => t.core).length)) * 100)}%)`}
                  </span>
                  <label className="chip bg-white/80 text-slate-600 !py-2 !px-3 cursor-pointer">
                    <input type="checkbox" className="mr-1.5" checked={edit?.bank ?? false}
                      onChange={(e) => setEdit((x) => x && { ...x, bank: e.target.checked })} />
                    &lt;보기&gt; 넣기
                  </label>
                  <button className="chip bg-[#c9a227] text-white !py-2 !px-4 font-black" disabled={saving} onClick={saveEdit}>
                    {saving ? "저장 중..." : "💾 저장"}
                  </button>
                  <button className="chip bg-white text-slate-600 !py-2 !px-4" disabled={saving}
                    onClick={() => { setEdit(null); setShow("student"); }}>취소</button>
                </>
              ) : (
                <>
                  {([["student", "📄 문제지"], ["answer", "✅ 정답지"], ["explain", "📚 해설지"]] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setShow(v)}
                      className={"chip !py-2 !px-4 " + (show === v ? "bg-white text-[#16204a] font-black" : "bg-white/70 text-slate-500")}>{l}</button>
                  ))}
                  {paper.kind === "CLOZE" && paper.passage && (
                    <button className="chip bg-white/70 text-slate-500 !py-2 !px-4" onClick={startEdit}>✏️ 빈칸 편집</button>
                  )}
                  <button className="chip bg-[#c9a227] text-white !py-2 !px-4 font-black" onClick={printSheet}>🖨️ 인쇄</button>
                  <button className="chip bg-white text-slate-600 !py-2 !px-4" onClick={() => setShow("none")}>✕ 닫기</button>
                </>
              )}
            </div>
            <div className="rounded-xl overflow-hidden shadow-2xl" ref={sheetRef}>
              {/* 빈칸 편집 */}
              {show === "edit" && edit && (
                <div className="esheet">
                  <p className="e-org">{paper.orgName ?? "정철 VOCA"} · 빈칸 편집</p>
                  <h2 className="e-title">{paper.title}</h2>
                  <p className="e-sub">{paper.levelLabel}</p>
                  <div className="ed-passage">
                    {edit.tokens.map((t, i) => {
                      const at = blankAt(edit.blanks, i);
                      if (at >= 0) {
                        const b = edit.blanks[at];
                        if (i !== b.start) return null; // 여러 낱말 빈칸은 첫 낱말에서 한 번만 그린다
                        const no = [...edit.blanks].sort((x, y) => x.start - y.start).indexOf(b) + 1;
                        const last = edit.tokens[b.end - 1];
                        return (
                          <span key={i}>
                            {t.lead}
                            <span className="ed-b" title="누르면 낱말로 돌아갑니다" onClick={() => toggleToken(i)}>
                              <small>{no}</small>{edit.tokens.slice(b.start, b.end).map((x) => x.core).join(" ")}
                            </span>
                            {last.trail}{last.ws}
                          </span>
                        );
                      }
                      return (
                        <span key={i}>
                          {t.lead}
                          {t.core
                            ? <span className="ed-w" title="누르면 빈칸이 됩니다" onClick={() => toggleToken(i)}>{t.core}</span>
                            : null}
                          {t.trail}{t.ws}
                        </span>
                      );
                    })}
                  </div>
                  <p className="e-foot">저장하면 번호가 순서대로 다시 매겨지고, 새 빈칸에는 해설이 자동으로 붙습니다.</p>
                </div>
              )}

              {/* 문제지 */}
              {show === "student" && (
                <div className="esheet">
                  <p className="e-org">{paper.orgName ?? "정철 VOCA"}</p>
                  <h2 className="e-title">{paper.title}</h2>
                  <p className="e-sub">{paper.levelLabel} · {paper.questions.length}문항</p>
                  <div className="e-info">
                    <div><b>반</b></div><div><b>이름</b></div>
                    <div><b>날짜</b>&nbsp;&nbsp;.&nbsp;&nbsp;.</div>
                    <div><b>점수</b>&nbsp;&nbsp;/ {paper.questions.length}</div>
                  </div>
                  <p className="e-inst">{paper.instruction}</p>
                  {paper.passage && <div className="e-passage">{renderPassage(paper.passage)}</div>}
                  {paper.wordBank && paper.wordBank.length > 0 && (
                    <div className="e-bank"><b>&lt;보기&gt;</b>{paper.wordBank.join(" · ")}</div>
                  )}
                  {paper.questions.map((q) => (
                    <div className="e-q" key={q.no}>
                      <div className="e-q-head">
                        <span className="e-no">{q.no}.</span>
                        <span className="e-prompt">
                          {q.promptKo && <span className="e-ko">{q.promptKo}<br /></span>}
                          {q.prompt}
                        </span>
                      </div>
                      {q.choices && q.choices.length > 0 && (
                        <div className="e-choices">
                          {q.choices.map((c, i) => <span key={i}>{CIRCLED[i]} {c}</span>)}
                        </div>
                      )}
                      {(!q.choices || q.choices.length === 0) && (
                        paper.kind === "COMPOSITION"
                          ? <div className="e-write2"><div /><div /></div>
                          : <div className="e-write" />
                      )}
                    </div>
                  ))}
                  <p className="e-foot">{paper.orgName ?? "정철 VOCA"} · 정철 VOCA</p>
                </div>
              )}

              {/* 정답지 */}
              {show === "answer" && (
                <div className="esheet">
                  <p className="e-org">{paper.orgName ?? "정철 VOCA"} · 교사용</p>
                  <h2 className="e-title">{paper.title} — 정답</h2>
                  <p className="e-sub">{paper.levelLabel} · {paper.questions.length}문항</p>
                  {paper.passage && (
                    <>
                      <p className="e-ans-title">본문 (정답 표시)</p>
                      <div className="e-passage">
                        {paper.passage.split(/(\{\{\d+\}\})/g).map((part, i) => {
                          const m = part.match(/^\{\{(\d+)\}\}$/);
                          if (!m) return <span key={i}>{part}</span>;
                          const q = paper.questions.find((x) => x.no === Number(m[1]));
                          return <span className="e-blank" key={i} style={{ color: "#0a7d43" }}>{q?.answer ?? `(${m[1]})`}</span>;
                        })}
                      </div>
                    </>
                  )}
                  <p className="e-ans-title">정답</p>
                  <div className="e-ans-grid">
                    {paper.questions.map((q) => (
                      <div key={q.no}><b>{q.no}.</b>{q.answer}</div>
                    ))}
                  </div>
                  <p className="e-foot">{paper.orgName ?? "정철 VOCA"} · 정철 VOCA</p>
                </div>
              )}

              {/* 해설지 */}
              {show === "explain" && (
                <div className="esheet">
                  <p className="e-org">{paper.orgName ?? "정철 VOCA"} · 교사용</p>
                  <h2 className="e-title">{paper.title} — 해설</h2>
                  <p className="e-sub">{paper.levelLabel} · {paper.questions.length}문항</p>

                  {paper.teacherNotes?.length > 0 && (
                    <>
                      <p className="e-ans-title">📚 이 시험지 지도 포인트</p>
                      {paper.teacherNotes.map((n, i) => (
                        <div className="e-note" key={i}><b>{n.heading}</b><p>{n.body}</p></div>
                      ))}
                    </>
                  )}

                  {paper.passageKo && (
                    <>
                      <p className="e-ans-title" style={{ marginTop: 18 }}>📖 본문 해석</p>
                      <div className="e-passage" style={{ lineHeight: 1.85 }}>{paper.passageKo}</div>
                    </>
                  )}

                  <p className="e-ans-title" style={{ marginTop: 18 }}>✏️ 문항별 해설</p>
                  {paper.questions.map((q) => (
                    <div className="e-exp" key={q.no}>
                      <p className="e-exp-q">{q.no}. {q.promptKo ? `${q.promptKo} / ` : ""}{q.prompt}</p>
                      <p className="e-exp-a">정답: {q.answer}</p>
                      <p className="e-exp-b">{q.explanation}</p>
                      {q.points && q.points.length > 0 && (
                        <div className="e-points">{q.points.map((p, i) => <span key={i}>{p}</span>)}</div>
                      )}
                    </div>
                  ))}

                  {paper.vocabNotes?.length > 0 && (
                    <>
                      <p className="e-ans-title" style={{ marginTop: 18 }}>🔤 중요 어휘</p>
                      <div className="e-vocab">
                        {paper.vocabNotes.map((v, i) => (
                          <div key={i}>
                            <b>{v.word}</b> — {v.meaning}
                            {v.note && <i>{v.note}</i>}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <p className="e-foot">{paper.orgName ?? "정철 VOCA"} · 정철 VOCA</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 만들어 둔 시험지 */}
      {saved.length > 0 && (
        <div className="card p-5">
          <h2 className="font-black text-[#16204a] mb-2">🗂️ 만들어 둔 시험지</h2>
          <div className="space-y-1.5">
            {saved.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <span className="chip bg-white text-slate-500 shrink-0">{KIND_INFO[r.kind]?.icon} {KIND_INFO[r.kind]?.label}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[#16204a] truncate">{r.title}</p>
                  <p className="text-[11px] text-slate-400">
                    {r.level} · {r.author} · {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <button className="chip bg-white text-slate-600 !py-1.5 shrink-0" onClick={() => openSaved(r.id)}>열기</button>
                <button className="chip bg-white text-rose-500 !py-1.5 shrink-0" onClick={() => removeSaved(r.id)}>삭제</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
