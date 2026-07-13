"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

type WB = { id: number; name: string; wordCount: number; createdBy: string; createdAt: string };

export default function WordbooksPage() {
  const [wordbooks, setWordbooks] = useState<WB[] | null>(null);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<{ wordbooks: WB[] }>("/api/admin/wordbooks").then((d) => setWordbooks(d.wordbooks));
  }, []);
  useEffect(load, [load]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!name.trim() || !file) {
      alert("단어장 이름과 파일을 선택하세요.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("file", file);
      const res = await fetch("/api/admin/wordbooks", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "업로드 실패");
      alert(`"${name}" 단어장에 ${data.count}개 단어가 등록되었습니다.`);
      setName("");
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black text-[#16204a]">📚 커스텀 단어장</h1>

      <div className="card p-5 space-y-3">
        <h2 className="font-black text-sm text-slate-600">엑셀(xlsx/csv)로 단어장 만들기</h2>
        <p className="text-xs text-slate-400">
          컬럼 순서: <b>단어 | 품사(n/v/adj/adv...) | 뜻(쉼표로 여러 개 = 모두 정답) | 예문 | 예문해석</b><br />
          예: <code className="bg-slate-100 px-1 rounded">huge | adj | 거대한, 엄청난, 막대한 | The elephant is huge. | 코끼리는 거대하다.</code>
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className="input" placeholder="단어장 이름 (예: 중간고사 대비)" value={name} onChange={(e) => setName(e.target.value)} />
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="input !py-2" />
          <button className="btn-primary" onClick={upload} disabled={uploading}>
            {uploading ? "업로드 중..." : "업로드"}
          </button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
              <th className="p-3">단어장</th><th className="p-3">단어 수</th><th className="p-3">만든 사람</th><th className="p-3">생성일</th>
            </tr>
          </thead>
          <tbody>
            {(wordbooks ?? []).map((w) => (
              <tr key={w.id} className="border-b border-slate-50">
                <td className="p-3 font-bold text-[#16204a]">{w.name}</td>
                <td className="p-3">{w.wordCount}개</td>
                <td className="p-3 text-slate-500">{w.createdBy}</td>
                <td className="p-3 text-xs text-slate-400">{new Date(w.createdAt).toLocaleDateString("ko-KR")}</td>
              </tr>
            ))}
            {wordbooks?.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-slate-400">단어장이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">업로드한 단어장은 <b>반 관리 → 학습 배정</b>에서 반이나 학생에게 배정할 수 있습니다.</p>
    </div>
  );
}
