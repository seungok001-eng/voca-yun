"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { useLiveRefresh } from "@/lib/use-live";

type Line = { id: number; order: number; speaker: string; text: string; textKo: string | null; audioUrl: string | null };
type Dialogue = { id: number; order: number; lines: Line[] };
export type LessonData = {
  id: number; name: string; area: string; order: number; isReview: boolean;
  bookLabel: string | null; partOrder: number; textbookName: string;
  courseTrack: string; matchRate: number; passCount: number;
  wordbookId: number | null; wordCount: number;
  dialogues: Dialogue[]; passage: Dialogue | null;
  passedRoles: string[];
};

export default function LessonHubPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<LessonData | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<LessonData>(`/api/textbook/lessons/${id}`).then(setD).catch(() => { /* 일시적 실패는 화면 유지 */ });
  }, [id]);
  useEffect(load, [load]);
  useLiveRefresh(load, 30000);

  async function goWords(to: "study" | "test") {
    setBusy(true);
    try {
      // 이 레슨의 단어장을 학습 대상으로 걸고 기존 단어 학습·시험 화면으로 보낸다
      await api(`/api/textbook/lessons/${id}/words`, { method: "POST", body: JSON.stringify({ mode: to }) });
      if (to === "study") {
        router.push("/study");
        return;
      }
      // 시험은 세션을 먼저 만들어야 한다 (/test/<세션id>)
      const res = await api<{ sessionId: number }>("/api/test/start", {
        method: "POST",
        body: JSON.stringify({ kind: "DAILY" }),
      });
      router.push(`/test/${res.sessionId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "단어 학습을 시작할 수 없습니다.");
      setBusy(false);
    }
  }

  if (!d) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  const dialogueRoles = ["A", "B"].filter((r) => d.dialogues.some((dl) => dl.lines.some((l) => l.speaker === r)));
  const hasPassage = !!d.passage && d.passage.lines.length > 0;
  const passed = (r: string) => d.passedRoles.includes(r);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <Link href="/textbook" className="btn-back">← 교재 목록</Link>
          <Link href="/home" className="btn-back">🏠 홈으로</Link>
        </div>
        <h1 className="text-xl font-black text-[#16204a]">
          L{d.order}. {d.name}
          {d.isReview && <span className="chip bg-amber-50 text-amber-600 ml-1.5">복습</span>}
        </h1>
        <p className="text-xs text-slate-400">
          {d.textbookName} · PART {d.partOrder} · {d.area === "TOON" ? "Toon World" : "Book Club"}
          {d.bookLabel && ` · ${d.bookLabel}`}
        </p>
      </div>

      {/* 단어 */}
      {d.wordCount > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-black text-[#16204a]">📚 단어 {d.wordCount}개</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {d.courseTrack === "ADVANCED" ? "심화반 단어까지 모두 학습합니다." : "기본 단어를 학습합니다."}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button className="btn-ghost" disabled={busy} onClick={() => goWords("study")}>단어 공부</button>
            <button className="btn-primary" disabled={busy} onClick={() => goWords("test")}>단어 시험</button>
          </div>
        </div>
      )}

      {/* 대화 */}
      {d.dialogues.length > 0 && (
        <div className="card p-5">
          <h2 className="font-black text-[#16204a]">🗣️ 대화 {d.dialogues.length}세트</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            듣고 따라 말한 다음, A·B 역할을 모두 연습하세요. 시험은 두 역할 모두 통과해야 합니다.
          </p>
          <div className="mt-3 space-y-2">
            <Link href={`/textbook/${d.id}/practice`} className="btn-ghost w-full block text-center">
              🎧 대화 공부하기 (듣기 · 따라 말하기 · 역할 연습)
            </Link>
            <div className="grid grid-cols-2 gap-2">
              {dialogueRoles.map((r) => (
                <Link key={r} href={`/textbook/${d.id}/exam?role=${r}`}
                  className={"btn-primary text-center " + (passed(r) ? "!bg-emerald-500" : "")}>
                  {r}역 시험{passed(r) && " ✓"}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 본문 */}
      {hasPassage && (
        <div className="card p-5">
          <h2 className="font-black text-[#16204a]">📖 리딩 본문 {d.passage!.lines.length}문장</h2>
          <p className="text-xs text-slate-400 mt-0.5">본문을 듣고 소리 내어 읽어 보세요.</p>
          <div className="mt-3 space-y-2">
            <Link href={`/textbook/${d.id}/practice?kind=passage`} className="btn-ghost w-full block text-center">
              🎧 본문 공부하기 (듣기 · 따라 읽기)
            </Link>
            <Link href={`/textbook/${d.id}/exam?role=N`}
              className={"btn-primary w-full block text-center " + (passed("N") ? "!bg-emerald-500" : "")}>
              본문 읽기 시험{passed("N") && " ✓"}
            </Link>
          </div>
        </div>
      )}

      {d.wordCount === 0 && d.dialogues.length === 0 && !hasPassage && (
        <div className="card p-8 text-center text-slate-400">
          <p className="text-3xl mb-2">🚧</p>
          이 레슨은 아직 준비 중이에요.
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        💡 문장은 {d.matchRate}% 이상 정확하게 말하면 통과예요.
        {d.passCount > 0 && ` 역할마다 ${d.passCount}문장 이상 맞히면 시험 통과!`}
      </p>
    </div>
  );
}
