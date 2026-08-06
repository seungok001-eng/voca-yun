"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";

type LessonRow = {
  id: number; area: string; order: number; name: string;
  isReview: boolean; bookLabel: string | null; hasPassage: boolean;
  basicWords: number; advancedWords: number;
  dialogueCount: number; lineCount: number; aCount: number; bCount: number;
  audioReady: boolean;
};
type Detail = {
  id: number; course: string; name: string; order: number;
  parts: { id: number; order: number; lessons: LessonRow[] }[];
};

const AREA_KO: Record<string, string> = { TOON: "🗣️ Toon World", READING: "📖 Book Club" };

export default function TextbookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<Detail>(`/api/admin/curriculum/textbooks/${id}`).then(setD);
  }, [id]);
  useEffect(load, [load]);

  async function upload(file: File) {
    setBusy(true);
    setResult("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/admin/curriculum/textbooks/${id}/upload`, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "업로드 실패");
      setResult(
        `✅ 등록 완료 — 레슨 ${json.lessons}개 · 단어 ${json.words}개(심화 ${json.advancedWords}) · 대화 ${json.dialogues}세트(${json.lines}문장) · 본문 ${json.passages}개`
      );
      load();
    } catch (e) {
      setResult(`⚠️ ${e instanceof Error ? e.message : "업로드 실패"}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (!d) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/textbooks" className="text-xs font-bold text-slate-400">← 교재 목록</Link>
        <h1 className="text-xl font-black text-[#16204a]">{d.name}</h1>
        <p className="text-xs text-slate-400">{d.course === "KEM" ? "SKY (KEM)" : "PLANET (FEM)"} · PART 1·2</p>
      </div>

      {/* 업로드 */}
      <div className="card p-5 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-black text-[#16204a]">📥 콘텐츠 업로드</h2>
          <a className="text-xs font-bold text-indigo-600 hover:underline" href="/api/admin/curriculum/template">업로드 양식 받기</a>
        </div>
        <p className="text-xs text-slate-400">
          엑셀 한 파일에 <b>레슨·단어·문장·본문</b> 시트를 담아 올리면 PART와 레슨을 알아서 찾아 넣습니다.
          같은 레슨을 다시 올리면 그 레슨만 새 내용으로 바뀝니다.
        </p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" disabled={busy}
          className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-[#16204a] file:px-4 file:py-2 file:text-white file:font-bold"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        {busy && <p className="text-sm text-slate-400">업로드 중...</p>}
        {result && <p className="text-sm font-bold text-[#16204a]">{result}</p>}
      </div>

      {/* PART별 레슨 현황 */}
      {d.parts.map((p) => (
        <div key={p.id} className="space-y-2">
          <h2 className="font-black text-[#16204a]">PART {p.order}</h2>
          {(["TOON", "READING"] as const).map((area) => {
            const list = p.lessons.filter((l) => l.area === area);
            return (
              <div key={area} className="card overflow-x-auto">
                <p className="px-3 pt-3 font-bold text-sm text-[#16204a]">{AREA_KO[area]}</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
                      <th className="p-2.5">레슨</th><th className="p-2.5">이름</th>
                      <th className="p-2.5">단어(기본/심화)</th><th className="p-2.5">대화</th>
                      <th className="p-2.5">A역/B역</th><th className="p-2.5">본문</th><th className="p-2.5">음성</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((l) => (
                      <tr key={l.id} className="border-b border-slate-50">
                        <td className="p-2.5 font-black text-[#16204a] whitespace-nowrap">
                          L{l.order}
                          {l.isReview && <span className="chip bg-amber-50 text-amber-600 ml-1">복습</span>}
                          {l.bookLabel && <span className="chip bg-indigo-50 text-indigo-600 ml-1">{l.bookLabel}</span>}
                        </td>
                        <td className="p-2.5 text-slate-600">{l.name}</td>
                        <td className="p-2.5">{l.basicWords}<span className="text-slate-300"> / </span><span className="text-[#c9a227] font-bold">{l.advancedWords}</span></td>
                        <td className="p-2.5">{l.dialogueCount > 0 ? `${l.dialogueCount}세트 (${l.lineCount}문장)` : <span className="text-slate-300">-</span>}</td>
                        <td className="p-2.5 text-xs">{l.aCount || "-"} / {l.bCount || "-"}</td>
                        <td className="p-2.5">{l.hasPassage ? "✓" : <span className="text-slate-300">-</span>}</td>
                        <td className="p-2.5">
                          {l.lineCount === 0 ? <span className="text-slate-300">-</span>
                            : l.audioReady ? <span className="chip bg-emerald-50 text-emerald-600">준비됨</span>
                            : <span className="chip bg-slate-100 text-slate-400">생성 전</span>}
                        </td>
                      </tr>
                    ))}
                    {list.length === 0 && (
                      <tr><td colSpan={7} className="p-5 text-center text-slate-400 text-xs">아직 등록된 레슨이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
