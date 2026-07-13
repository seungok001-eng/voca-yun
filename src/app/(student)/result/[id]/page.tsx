"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, speak, POS_KO } from "@/lib/client";

type Result = {
  id: number; kind: string; status: string; attemptNo: number; wrongCount: number;
  failThreshold: number; retestScope: string; total: number; pronEnabled: boolean;
  answers: {
    word: string; pos: string; meanings: string[]; direction: string; given: string;
    textCorrect: boolean; pronScore: number | null; pronPassed: boolean | null; correct: boolean;
  }[];
};

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [r, setR] = useState<Result | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api<Result>(`/api/test/${id}/result`).then(setR).catch(() => router.replace("/home"));
  }, [id, router]);

  if (!r) return <p className="text-slate-400 text-center py-20">결과 확인 중...</p>;

  const passed = r.status === "PASSED";
  const wrongAnswers = r.answers.filter((a) => !a.correct);

  async function retest() {
    setStarting(true);
    try {
      const res = await api<{ sessionId: number }>("/api/test/start", {
        method: "POST",
        body: JSON.stringify({ kind: "RETEST", retestOf: r!.id }),
      });
      router.push(`/test/${res.sessionId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "재시험 시작 실패");
      setStarting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div className={"card p-8 text-center space-y-3 border-2 " + (passed ? "!border-emerald-300" : "!border-rose-300")}>
        <p className="text-6xl">{passed ? "🎉" : "😢"}</p>
        <h1 className={"text-2xl font-black " + (passed ? "text-emerald-600" : "text-rose-600")}>
          {passed ? "통과했습니다!" : "탈락했습니다"}
        </h1>
        <p className="text-sm text-slate-500">
          {r.attemptNo > 1 && <>({r.attemptNo}차 시험) </>}
          오답 {r.wrongCount}개 / 탈락 기준 {r.failThreshold}개
        </p>
        {passed ? (
          <Link href="/home" className="btn-primary inline-block px-8">홈으로</Link>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-400">
              {r.retestScope === "ALL" ? "전체 단어를 랜덤 순서로 다시 시험 봐요." : "틀린 단어만 다시 시험 봐요."}
            </p>
            <button className="btn-primary w-full" onClick={retest} disabled={starting}>
              🔄 바로 재시험 ({r.attemptNo + 1}차)
            </button>
            <Link href="/study" className="btn-ghost block">📖 다시 외우고 오기</Link>
          </div>
        )}
      </div>

      {wrongAnswers.length > 0 && (
        <section className="card p-5">
          <h2 className="font-black text-[#16204a] mb-3">❌ 틀린 단어 ({wrongAnswers.length}개) — 오답노트에 저장됨</h2>
          <ul className="divide-y divide-slate-100">
            {wrongAnswers.map((a, i) => (
              <li key={i} className="py-2.5 flex items-center justify-between gap-2">
                <div>
                  <p className="font-black text-[#16204a]">{a.word}
                    <button className="ml-2 text-xs" onClick={() => speak(a.word)}>🔊</button>
                  </p>
                  <p className="text-xs text-[color:var(--brand-gold)] font-bold">
                    [{POS_KO[a.pos] ?? a.pos}] {a.meanings.join(", ")}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    내 답: {a.given || "(빈칸)"}
                    {a.textCorrect && a.pronPassed === false && ` · 발음 ${a.pronScore}점 미달`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5">
        <h2 className="font-black text-[#16204a] mb-3">전체 답안</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {r.answers.map((a, i) => (
            <li key={i} className="py-2 flex items-center gap-2">
              <span>{a.correct ? "⭕" : "❌"}</span>
              <span className="font-bold text-[#16204a]">{a.word}</span>
              <span className="text-xs text-slate-400 flex-1 truncate">{a.meanings[0]}</span>
              {a.pronScore !== null && <span className="text-[10px] text-slate-400">🎤{a.pronScore}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
