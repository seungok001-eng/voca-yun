"use client";

import { useCallback, useEffect, useState } from "react";
import { api, playClip, audioUrlFor, POS_KO } from "@/lib/client";

type Alias = { id: number; text: string };
type W = {
  id: number; no: number | null; text: string; pos: string; meanings: string[]; example: string | null;
  exampleKo: string | null; emoji: string | null; day: number; levelOrder: number | null; levelName: string | null; aliases: Alias[];
};
type LevelRow = { id: number; order: number; nameKo: string; wordCount: number };
type WordbookRow = { id: number; name: string; wordCount: number };

const POS_LIST = ["n", "v", "adj", "adv", "prep", "conj", "pron", "int", "num", "phrase"];

export default function AdminWordsPage() {
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [wordbooks, setWordbooks] = useState<WordbookRow[]>([]);
  const [levelId, setLevelId] = useState<string>("");
  const [wordbookId, setWordbookId] = useState<string>("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ words: W[]; total: number; pages: number } | null>(null);
  const [editing, setEditing] = useState<W | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api<{ levels: LevelRow[] }>("/api/admin/levels").then((r) => setLevels(r.levels));
    api<{ wordbooks: WordbookRow[] }>("/api/admin/wordbooks").then((r) => setWordbooks(r.wordbooks));
  }, []);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (levelId) p.set("levelId", levelId);
    if (wordbookId) p.set("wordbookId", wordbookId);
    p.set("page", String(page));
    api<{ words: W[]; total: number; pages: number }>(`/api/admin/words?${p}`).then(setData);
  }, [q, levelId, wordbookId, page]);
  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-black text-[#16204a]">📖 단어 관리</h1>
        <button className="btn-primary text-sm" onClick={() => setAdding(true)}>+ 단어 추가</button>
      </div>

      {/* 검색 필터 */}
      <div className="card p-4 grid gap-2 sm:grid-cols-4">
        <input className="input" placeholder="단어 검색 (영어)" value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="input" value={levelId} onChange={(e) => { setLevelId(e.target.value); setWordbookId(""); setPage(1); }}>
          <option value="">전체 레벨</option>
          {levels.map((l) => <option key={l.id} value={l.id}>Lv.{l.order} {l.nameKo} ({l.wordCount})</option>)}
        </select>
        <select className="input" value={wordbookId} onChange={(e) => { setWordbookId(e.target.value); setLevelId(""); setPage(1); }}>
          <option value="">단어장 선택</option>
          {wordbooks.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.wordCount})</option>)}
        </select>
        <div className="flex items-center text-sm text-slate-500 font-semibold">
          {data ? `총 ${data.total.toLocaleString()}개` : "..."}
        </div>
      </div>

      {/* 목록 */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
              <th className="p-3">단어</th><th className="p-3">품사</th><th className="p-3">뜻</th>
              <th className="p-3">예문</th><th className="p-3">추가정답</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {data?.words.map((w) => (
              <tr key={w.id} className="border-b border-slate-50 align-top">
                <td className="p-3 font-black text-[#16204a] whitespace-nowrap">
                  {w.emoji && <span className="text-lg mr-1">{w.emoji}</span>}
                  {w.text}
                  <button className="ml-1.5 text-xs" title="단어 듣기"
                    onClick={() => playClip(audioUrlFor(w.levelOrder, w.no, "word"), w.text)}>🔊</button>
                  <div className="text-[10px] text-slate-400 font-normal">
                    {w.levelOrder && <>Lv.{w.levelOrder}</>}
                    {w.no && <span className="text-[#c9a227] font-bold"> · {w.no}번</span>}
                  </div>
                </td>
                <td className="p-3 text-slate-500">{POS_KO[w.pos] ?? w.pos}</td>
                <td className="p-3 text-[color:var(--brand-gold)] font-semibold">{w.meanings.join(", ")}</td>
                <td className="p-3 text-xs text-slate-500 max-w-xs">
                  {w.example && (
                    <button className="mr-1 text-xs align-middle" title="예문 듣기"
                      onClick={() => playClip(audioUrlFor(w.levelOrder, w.no, "ex"), w.example!)}>🔊</button>
                  )}
                  {w.example}<br /><span className="text-slate-400">{w.exampleKo}</span>
                </td>
                <td className="p-3 text-xs">
                  {w.aliases.length > 0
                    ? w.aliases.map((a) => <span key={a.id} className="chip bg-emerald-50 text-emerald-600 mr-1 mb-1">{a.text}</span>)
                    : <span className="text-slate-300">-</span>}
                </td>
                <td className="p-3"><button className="text-xs font-bold text-indigo-600 hover:underline" onClick={() => setEditing(w)}>편집</button></td>
              </tr>
            ))}
            {data?.words.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">검색 결과가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className="btn-ghost text-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← 이전</button>
          <span className="text-sm font-bold text-slate-500">{page} / {data.pages}</span>
          <button className="btn-ghost text-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>다음 →</button>
        </div>
      )}

      {editing && <EditModal word={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {adding && <AddModal levels={levels} wordbooks={wordbooks} defaultLevelId={levelId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function EditModal({ word, onClose, onSaved }: { word: W; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(word.text);
  const [pos, setPos] = useState(word.pos);
  const [meanings, setMeanings] = useState(word.meanings.join(", "));
  const [emoji, setEmoji] = useState(word.emoji ?? "");
  const [example, setExample] = useState(word.example ?? "");
  const [exampleKo, setExampleKo] = useState(word.exampleKo ?? "");
  const [aliases, setAliases] = useState(word.aliases);
  const [newAlias, setNewAlias] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api(`/api/admin/words/${word.id}`, {
        method: "PATCH",
        body: JSON.stringify({ text, pos, meanings: meanings.split(",").map((m) => m.trim()).filter(Boolean), example, exampleKo, emoji }),
      });
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 실패");
      setSaving(false);
    }
  }
  async function addAlias() {
    if (!newAlias.trim()) return;
    await api("/api/admin/aliases", { method: "POST", body: JSON.stringify({ wordId: word.id, text: newAlias.trim() }) });
    setAliases([...aliases, { id: Date.now(), text: newAlias.trim() }]);
    setNewAlias("");
  }
  async function delAlias(a: Alias) {
    await api(`/api/admin/aliases/${a.id}`, { method: "DELETE" });
    setAliases(aliases.filter((x) => x.id !== a.id));
  }
  async function delWord() {
    if (!confirm(`"${word.text}" 단어를 삭제할까요?`)) return;
    await api(`/api/admin/words/${word.id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="font-black text-[#16204a] text-lg mb-3">단어 편집</h2>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">단어</label>
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">품사</label>
            <select className="input" value={pos} onChange={(e) => setPos(e.target.value)}>
              {POS_LIST.map((p) => <option key={p} value={p}>{POS_KO[p]} ({p})</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">뜻 (쉼표로 여러 개 = 모두 정답)</label>
          <input className="input" value={meanings} onChange={(e) => setMeanings(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">그림(이모지) — 저학년 학습 보조 {emoji && <span className="text-lg">{emoji}</span>}</label>
          <input className="input" value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="예: 🍎 (비우면 표시 안 함)" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">예문</label>
          <input className="input" value={example} onChange={(e) => setExample(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">예문 해석</label>
          <input className="input" value={exampleKo} onChange={(e) => setExampleKo(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">추가 정답 (학생이 입력해도 정답 처리)</label>
          <div className="flex flex-wrap gap-1 mb-2">
            {aliases.map((a) => (
              <span key={a.id} className="chip bg-emerald-50 text-emerald-600">
                {a.text}<button className="ml-1 text-rose-400" onClick={() => delAlias(a)}>✕</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input" placeholder="예: 거대한" value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addAlias()} />
            <button className="btn-ghost whitespace-nowrap" onClick={addAlias}>추가</button>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button className="btn-primary flex-1" onClick={save} disabled={saving}>{saving ? "저장 중..." : "저장"}</button>
          <button className="btn-ghost !border-rose-200 !text-rose-500" onClick={delWord}>삭제</button>
          <button className="btn-ghost" onClick={onClose}>닫기</button>
        </div>
      </div>
    </Modal>
  );
}

function AddModal({ levels, wordbooks, defaultLevelId, onClose, onSaved }: {
  levels: LevelRow[]; wordbooks: WordbookRow[]; defaultLevelId: string; onClose: () => void; onSaved: () => void;
}) {
  const [target, setTarget] = useState(defaultLevelId ? `L${defaultLevelId}` : levels[0] ? `L${levels[0].id}` : "");
  const [text, setText] = useState("");
  const [pos, setPos] = useState("n");
  const [meanings, setMeanings] = useState("");
  const [example, setExample] = useState("");
  const [exampleKo, setExampleKo] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!text.trim() || !meanings.trim()) { alert("단어와 뜻은 필수입니다."); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        text, pos, meanings: meanings.split(",").map((m) => m.trim()).filter(Boolean), example, exampleKo,
      };
      if (target.startsWith("L")) body.levelId = Number(target.slice(1));
      else body.wordbookId = Number(target.slice(1));
      await api("/api/admin/words", { method: "POST", body: JSON.stringify(body) });
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "추가 실패");
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="font-black text-[#16204a] text-lg mb-3">단어 추가</h2>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">추가할 위치</label>
          <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
            <optgroup label="레벨">
              {levels.map((l) => <option key={l.id} value={`L${l.id}`}>Lv.{l.order} {l.nameKo}</option>)}
            </optgroup>
            {wordbooks.length > 0 && (
              <optgroup label="단어장">
                {wordbooks.map((w) => <option key={w.id} value={`W${w.id}`}>{w.name}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">단어</label>
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 block mb-1">품사</label>
            <select className="input" value={pos} onChange={(e) => setPos(e.target.value)}>
              {POS_LIST.map((p) => <option key={p} value={p}>{POS_KO[p]} ({p})</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">뜻 (쉼표로 여러 개)</label>
          <input className="input" value={meanings} onChange={(e) => setMeanings(e.target.value)} placeholder="거대한, 엄청난" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">예문</label>
          <input className="input" value={example} onChange={(e) => setExample(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">예문 해석</label>
          <input className="input" value={exampleKo} onChange={(e) => setExampleKo(e.target.value)} />
        </div>
        <div className="flex gap-2 pt-2">
          <button className="btn-primary flex-1" onClick={save} disabled={saving}>{saving ? "추가 중..." : "추가"}</button>
          <button className="btn-ghost" onClick={onClose}>닫기</button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto pop-in" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
