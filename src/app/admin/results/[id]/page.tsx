"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, POS_KO } from "@/lib/client";

type Result = {
  id: number; kind: string; mode: string; status: string; attemptNo: number;
  wrongCount: number; failThreshold: number; cheatCount: number; total: number;
  studentName: string; startedAt: string; finishedAt: string | null;
  answers: {
    wordId: number; word: string; pos: string; meanings: string[]; direction: string;
    given: string; textCorrect: boolean; pronScore: number | null; pronPassed: boolean | null; correct: boolean;
  }[];
};

// 선생님용 답안 상세 — 틀린 한글 답을 '정답 인정'하면 이후 자동 정답 처리
export default function AdminResultPage() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<Result | null>(null);

  const load = useCallback(() => {
    api<Result>(`/api/test/${id}/result`).then(setR);
  }, [id]);
  useEffect(load, [load]);

  if (!r) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  async function accept(wordId: number, text: string) {
    if (!confirm(`"${text}"를 이 단어의 정답으로 추가 인정할까요?\n앞으로 모든 학생에게 정답 처리됩니다.`)) return;
    await api("/api/admin/aliases", { method: "POST", body: JSON.stringify({ wordId, text }) });
    alert("추가되었습니다. (이미 끝난 시험의 결과는 바뀌지 않습니다)");
  }

  return (
    <div className="space-y-4">
      <div>
        <button className="text-xs font-bold text-slate-400" onClick={() => history.back()}>← 뒤로</button>
        <h1 className="text-xl font-black text-[#16204a]">
          {r.studentName} — 답안 상세
          {r.status === "PASSED"
            ? <span className="chip bg-emerald-50 text-emerald-600 ml-2">통과</span>
            : <span className="chip bg-rose-50 text-rose-500 ml-2">탈락</span>}
        </h1>
        <p className="text-xs text-slate-400">
          오답 {r.wrongCount}/{r.failThreshold} · {r.attemptNo}차
          {r.cheatCount > 0 && <span className="text-amber-600 font-bold"> · ⚠️ 화면 이탈 {r.cheatCount}회</span>}
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
              <th className="p-3">결과</th><th className="p-3">단어</th><th className="p-3">정답(등록된 뜻)</th>
              <th className="p-3">방향</th><th className="p-3">학생 답</th><th className="p-3">발음</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {r.answers.map((a, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="p-3">{a.correct ? "⭕" : "❌"}</td>
                <td className="p-3 font-bold text-[#16204a]">{a.word} <span className="text-[10px] text-slate-400">[{POS_KO[a.pos] ?? a.pos}]</span></td>
                <td className="p-3 text-xs text-slate-500">{a.meanings.join(", ")}</td>
                <td className="p-3 text-xs text-slate-400">{a.direction === "KO_TO_EN" ? "한→영" : "영→한"}</td>
                <td className={"p-3 font-semibold " + (a.textCorrect ? "text-emerald-600" : "text-rose-500")}>{a.given || "(빈칸)"}</td>
                <td className="p-3 text-xs">
                  {a.pronScore !== null ? (
                    <span className={a.pronPassed ? "text-emerald-600" : "text-rose-500"}>🎤 {a.pronScore}점</span>
                  ) : <span className="text-slate-300">-</span>}
                </td>
                <td className="p-3">
                  {!a.textCorrect && a.direction === "EN_TO_KO" && a.given && (
                    <button className="text-[11px] font-bold text-indigo-600 hover:underline whitespace-nowrap"
                      onClick={() => accept(a.wordId, a.given)}>
                      ✓ 정답으로 인정
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
