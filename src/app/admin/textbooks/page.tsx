"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

type Book = {
  id: number; course: string; name: string; order: number;
  partCount: number; lessonCount: number; toonCount: number; readingCount: number;
  wordCount: number; dialogueCount: number;
};

const COURSE_KO: Record<string, string> = { KEM: "SKY (KEM)", FEM: "PLANET (FEM)" };

export default function TextbooksPage() {
  const [books, setBooks] = useState<Book[] | null>(null);

  const load = useCallback(() => {
    api<{ textbooks: Book[] }>("/api/admin/curriculum/textbooks").then((d) => setBooks(d.textbooks));
  }, []);
  useEffect(load, [load]);

  if (!books) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  const groups = ["KEM", "FEM"].map((c) => ({ course: c, list: books.filter((b) => b.course === c) }));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-black text-[#16204a]">📕 교재 관리 <span className="text-sm text-slate-400 font-semibold">— 교재 과정</span></h1>
          <p className="text-xs text-slate-400 mt-1">
            정철 교재(SKY·PLANET)의 단어·문장·본문을 등록합니다. 1권 = PART 1·2, PART마다 Toon World 8레슨 + Book Club 8레슨.
          </p>
        </div>
        <a className="btn-ghost text-sm whitespace-nowrap" href="/api/admin/curriculum/template">⬇️ 업로드 양식 받기</a>
      </div>

      {groups.map((g) => (
        <div key={g.course} className="space-y-2">
          <h2 className="font-black text-[#16204a] text-sm">{COURSE_KO[g.course]}</h2>
          {g.list.length === 0 ? (
            <div className="card p-6 text-center text-slate-400 text-sm">교재가 아직 없습니다. 배포 시 자동으로 등록됩니다.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.list.map((b) => {
                const filled = b.lessonCount > 0;
                return (
                  <Link key={b.id} href={`/admin/textbooks/${b.id}`}
                    className="card p-5 block hover:shadow-lg transition-shadow">
                    <div className="flex items-start justify-between">
                      <h3 className="font-black text-[#16204a] text-lg">{b.name}</h3>
                      <span className={"chip " + (filled ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400")}>
                        {filled ? `${b.lessonCount}레슨` : "비어 있음"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                      <span className="chip bg-slate-100 text-slate-500">🗣️ Toon {b.toonCount}</span>
                      <span className="chip bg-slate-100 text-slate-500">📖 Book Club {b.readingCount}</span>
                      <span className="chip bg-slate-100 text-slate-500">단어 {b.wordCount}</span>
                      <span className="chip bg-slate-100 text-slate-500">대화 {b.dialogueCount}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
