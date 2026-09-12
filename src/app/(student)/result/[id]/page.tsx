"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, speak, POS_KO } from "@/lib/client";
import { sfx, confetti } from "@/lib/fx";
import Mascot from "@/components/Mascot";

type Result = {
  id: number; kind: string; status: string; attemptNo: number; wrongCount: number;
  failThreshold: number; retestScope: string; total: number; pronEnabled: boolean;
  earned: number; streak: number; bestStreak: number; points: number;
  answers: {
    word: string; pos: string; meanings: string[]; direction: string; given: string;
    textCorrect: boolean; pronScore: number | null; pronPassed: boolean | null; correct: boolean;
  }[];
};

const KIND_KO: Record<string, string> = { DAILY: "오늘의 단어시험", RETEST: "재시험", WRONG_NOTE: "오답노트 시험", REVIEW: "누적 복습시험" };

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [r, setR] = useState<Result | null>(null);
  const [starting, setStarting] = useState(false);
  const played = useRef(false);

  useEffect(() => {
    api<Result>(`/api/test/${id}/result`).then(setR).catch(() => router.replace("/home"));
  }, [id, router]);

  // 결과가 뜨는 순간 한 번만 연출
  useEffect(() => {
    if (!r || played.current) return;
    played.current = true;
    if (r.status === "PASSED") { sfx("pass"); confetti(); }
    else sfx("fail");
  }, [r]);

  if (!r) return <p className="text-slate-400 text-center py-20">결과 확인 중...</p>;

  const passed = r.status === "PASSED";
  const correctCount = r.answers.filter((a) => a.correct).length;
  const wrongAnswers = r.answers.filter((a) => !a.correct);
  const perfect = passed && r.wrongCount === 0;

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
      {/* 결과 히어로 */}
      <section className={"card p-6 text-center space-y-3 bounce-in border-2 " + (passed ? "tone-review" : "tone-test")}>
        <div className="flex justify-center"><Mascot mood={passed ? "cheer" : "sad"} size={130} bounce={passed} /></div>
        <h1 className={"text-3xl " + (passed ? "text-emerald-700" : "text-rose-600")}>
          {perfect ? "만점이에요! 💯" : passed ? "통과했어요! 🎉" : "아쉬워요, 다시 해봐요!"}
        </h1>
        <p className="text-sm text-slate-500">
          {KIND_KO[r.kind] ?? "시험"}{r.attemptNo > 1 && ` · ${r.attemptNo}차`} · {r.total}문제 중 {correctCount}개 정답
          {!passed && ` · 오답 ${r.wrongCount}개 (기준 ${r.failThreshold}개)`}
        </p>

        {/* 오늘 얻은 것 */}
        {passed && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="rounded-2xl bg-white/80 p-3 count-up" style={{ animationDelay: ".1s" }}>
              <p className="text-2xl font-black text-[#c9a227]">+{r.earned}P</p>
              <p className="text-[10px] text-slate-500">포인트</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-3 count-up" style={{ animationDelay: ".25s" }}>
              <p className="text-2xl font-black text-orange-500">🔥 {r.streak}일</p>
              <p className="text-[10px] text-slate-500">연속 통과{r.streak >= r.bestStreak && r.streak > 1 ? " · 최고 기록!" : ""}</p>
            </div>
            <div className="rounded-2xl bg-white/80 p-3 count-up" style={{ animationDelay: ".4s" }}>
              <p className="text-2xl font-black text-[#16204a]">{r.points.toLocaleString()}</p>
              <p className="text-[10px] text-slate-500">총 포인트</p>
            </div>
          </div>
        )}

        {passed ? (
          <div className="space-y-2 pt-1">
            <Link href="/home" className="btn-big">🏠 홈으로</Link>
            <Link href="/badges" className="text-xs font-bold text-[#16204a] underline block">🏅 내 뱃지 보러 가기</Link>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <button className="btn-big" onClick={retest} disabled={starting}>
              🔄 바로 재시험 ({r.attemptNo + 1}차)
            </button>
            <p className="text-[11px] text-slate-500">
              {r.retestScope === "ALL" ? "전체 단어를 랜덤 순서로 다시 봐요." : "틀린 단어만 다시 봐요."}
            </p>
            <Link href="/study" className="btn-ghost block">📖 다시 외우고 오기</Link>
          </div>
        )}
      </section>

      {wrongAnswers.length > 0 && (
        <section className="card p-5">
          <h2 className="text-[#16204a] mb-3">❌ 틀린 단어 {wrongAnswers.length}개 <span className="text-xs text-slate-400 font-normal">오답노트에 저장됐어요</span></h2>
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
        <h2 className="text-[#16204a] mb-3">전체 답안</h2>
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
