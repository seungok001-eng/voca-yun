"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, speak, POS_KO } from "@/lib/client";

type Note = {
  id: number; word: string; pos: string; meanings: string[]; example?: string; exampleKo?: string;
  emoji?: string | null; wrongCount: number; lastWrongAt: string; resolved: boolean;
};

export default function WrongNotePage() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [starting, setStarting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    api<{ notes: Note[] }>(`/api/student/wrong-note?all=${showAll ? 1 : 0}`).then((d) => setNotes(d.notes));
  }, [showAll]);

  async function startTest() {
    setStarting(true);
    try {
      const res = await api<{ sessionId: number }>("/api/test/start", {
        method: "POST",
        body: JSON.stringify({ kind: "WRONG_NOTE" }),
      });
      router.push(`/test/${res.sessionId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "시작 실패");
      setStarting(false);
    }
  }

  if (!notes) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;
  const unresolved = notes.filter((n) => !n.resolved);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-black text-[#16204a]">📝 오답노트</h1>
        <button className="text-xs font-bold text-slate-400" onClick={() => setShowAll(!showAll)}>
          {showAll ? "미해결만 보기" : "해결된 것도 보기"}
        </button>
      </div>

      {unresolved.length > 0 && (
        <button className="btn-primary w-full" onClick={startTest} disabled={starting}>
          ✏️ 오답 단어만 시험 보기 ({unresolved.length}개)
        </button>
      )}

      {notes.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-4xl mb-2">✨</p>
          <p className="font-bold text-slate-500">오답이 없어요! 완벽해요.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className={"card p-4 " + (n.resolved ? "opacity-50" : "")}>
              <div className="flex items-start justify-between gap-2">
                {n.emoji && <span className="text-3xl leading-none">{n.emoji}</span>}
                <div className="flex-1">
                  <p className="font-black text-[#16204a] text-lg">
                    {n.word}
                    <button className="ml-2 text-sm" onClick={() => speak(n.word)}>🔊</button>
                    {n.resolved && <span className="chip bg-emerald-50 text-emerald-600 ml-2">해결 ✓</span>}
                  </p>
                  <p className="text-sm font-bold text-[color:var(--brand-gold)]">
                    [{POS_KO[n.pos] ?? n.pos}] {n.meanings.join(", ")}
                  </p>
                  {n.example && (
                    <p className="text-xs text-slate-400 mt-1 italic">
                      {n.example}
                      <button className="mx-1 align-middle" onClick={() => speak(n.example!)} aria-label="예문 듣기">🔊</button>
                      — {n.exampleKo}
                    </p>
                  )}
                </div>
                <span className="chip bg-rose-50 text-rose-500 whitespace-nowrap">{n.wrongCount}회 틀림</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
