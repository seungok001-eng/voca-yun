"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, playClip, playClipAsync, recognizeOnce, speechRecognitionSupported } from "@/lib/client";
import type { LessonData } from "../page";

type Line = { id: number; order: number; speaker: string; text: string; textKo: string | null; audioUrl: string | null };
type Judged = { score: number; passed: boolean; missed: string[]; feedback: string };

const SPEAKER_KO: Record<string, string> = { A: "A", B: "B", N: "본문" };

export default function PracticePage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const isPassage = params.get("kind") === "passage";
  const [d, setD] = useState<LessonData | null>(null);
  const [mode, setMode] = useState<"listen" | "repeat" | "role">("listen");
  const [role, setRole] = useState<"A" | "B">("A");

  useEffect(() => {
    api<LessonData>(`/api/textbook/lessons/${id}`).then(setD).catch(() => setD(null));
  }, [id]);

  if (!d) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  const sets = isPassage ? (d.passage ? [d.passage] : []) : d.dialogues;
  if (sets.length === 0) {
    return (
      <div className="card p-8 text-center text-slate-400">
        <p className="text-3xl mb-2">🚧</p>
        {isPassage ? "본문이 아직 없어요." : "대화가 아직 없어요."}
        <div className="mt-3"><Link href={`/textbook/${id}`} className="btn-ghost">돌아가기</Link></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/textbook/${id}`} className="text-xs font-bold text-slate-400">← {d.name}</Link>
        <h1 className="text-lg font-black text-[#16204a]">
          {isPassage ? "📖 본문 공부" : "🗣️ 대화 공부"}
        </h1>
      </div>

      {/* 모드 선택 */}
      <div className="flex gap-1.5 flex-wrap">
        {(isPassage ? (["listen", "repeat"] as const) : (["listen", "repeat", "role"] as const)).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={"chip !py-2 !px-4 " + (mode === m ? "bg-[#16204a] text-white" : "bg-white border border-slate-200 text-slate-500")}>
            {{ listen: "🎧 전체 듣기", repeat: "🔁 따라 말하기", role: "🎭 역할 연습" }[m]}
          </button>
        ))}
      </div>

      {mode === "role" && !isPassage && (
        <div className="card p-3 flex items-center gap-2">
          <span className="text-xs font-bold text-slate-600">내 역할</span>
          {(["A", "B"] as const).map((r) => (
            <button key={r} onClick={() => setRole(r)}
              className={"chip !py-1.5 !px-4 " + (role === r ? "bg-[#c9a227] text-white" : "bg-slate-100 text-slate-500")}>
              {r}역
            </button>
          ))}
          <span className="text-[11px] text-slate-400 ml-auto">상대는 자동으로 말해줘요</span>
        </div>
      )}

      {sets.map((set, i) => (
        <DialogueCard key={set.id} lines={set.lines} index={i} total={sets.length}
          mode={mode} myRole={isPassage ? "N" : role} isPassage={isPassage} matchRate={d.matchRate} />
      ))}
    </div>
  );
}

function DialogueCard({ lines, index, total, mode, myRole, isPassage, matchRate }: {
  lines: Line[]; index: number; total: number;
  mode: "listen" | "repeat" | "role"; myRole: string; isPassage: boolean; matchRate: number;
}) {
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [judged, setJudged] = useState<Record<number, Judged>>({});
  const [listening, setListening] = useState<number | null>(null);
  const [showKo, setShowKo] = useState<Record<number, boolean>>({});
  const stopped = useRef(false);

  // 전체 듣기 — 순서대로 재생
  const playAll = useCallback(async () => {
    stopped.current = false;
    for (const l of lines) {
      if (stopped.current) break;
      setPlayingId(l.id);
      await playClipAsync(l.audioUrl, l.text);
      await new Promise((r) => setTimeout(r, 250));
    }
    setPlayingId(null);
  }, [lines]);

  useEffect(() => () => { stopped.current = true; }, []);

  // 역할 연습: 내 차례 전까지 상대 대사를 자동 재생
  const playUntilMyTurn = useCallback(async (target: Line) => {
    stopped.current = false;
    for (const l of lines) {
      if (l.id === target.id) break;
      if (l.speaker === myRole) continue;
      if (stopped.current) return;
      setPlayingId(l.id);
      await playClipAsync(l.audioUrl, l.text);
      await new Promise((r) => setTimeout(r, 200));
    }
    setPlayingId(null);
  }, [lines, myRole]);

  async function speakLine(l: Line, withLeadIn = false) {
    if (!speechRecognitionSupported()) {
      alert("이 브라우저는 음성 인식을 지원하지 않아요. 크롬으로 접속해 주세요.");
      return;
    }
    if (withLeadIn) await playUntilMyTurn(l);
    setListening(l.id);
    try {
      const { transcript } = await recognizeOnce(7000);
      const res = await api<Judged>("/api/textbook/grade", {
        method: "POST",
        body: JSON.stringify({ lineId: l.id, recognized: transcript }),
      });
      setJudged((p) => ({ ...p, [l.id]: res }));
    } catch (e) {
      setJudged((p) => ({ ...p, [l.id]: { score: 0, passed: false, missed: [], feedback: e instanceof Error ? e.message : "인식 실패" } }));
    } finally {
      setListening(null);
    }
  }

  const myTurn = (l: Line) => mode === "role" && l.speaker === myRole;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-400">
          {isPassage ? "본문" : `대화 ${index + 1}/${total}`}
        </p>
        {mode === "listen" && (
          <div className="flex gap-1.5">
            <button className="chip bg-[#16204a] text-white !py-1.5 !px-3" onClick={playAll}>▶ 전체 듣기</button>
            <button className="chip bg-slate-100 text-slate-500 !py-1.5 !px-3"
              onClick={() => { stopped.current = true; setPlayingId(null); }}>■ 정지</button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {lines.map((l) => {
          const j = judged[l.id];
          const hidden = myTurn(l); // 역할 연습: 내 대사는 영어를 감추고 한국어만 보여준다
          return (
            <div key={l.id}
              className={"rounded-xl p-3 " +
                (playingId === l.id ? "bg-amber-50 ring-2 ring-amber-200" :
                 hidden ? "bg-indigo-50/60" : "bg-slate-50")}>
              <div className="flex items-start gap-2">
                {!isPassage && (
                  <span className={"chip shrink-0 " + (l.speaker === "A" ? "bg-[#16204a] text-white" : "bg-[#c9a227] text-white")}>
                    {SPEAKER_KO[l.speaker]}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  {hidden ? (
                    <>
                      <p className="font-bold text-[#16204a]">{l.textKo ?? "(뜻 없음)"}</p>
                      <p className="text-[11px] text-indigo-500 font-bold mt-0.5">↑ 이 뜻을 영어로 말해보세요</p>
                      {j && <p className="text-xs text-slate-500 mt-1">정답: {l.text}</p>}
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-[#16204a]">{l.text}</p>
                      {showKo[l.id] && l.textKo && <p className="text-xs text-slate-500 mt-0.5">{l.textKo}</p>}
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {!hidden && (
                  <>
                    <button className="chip bg-white border border-slate-200 text-slate-600 !py-1.5"
                      onClick={() => playClip(l.audioUrl, l.text)}>🔊 듣기</button>
                    <button className="chip bg-white border border-slate-200 text-slate-600 !py-1.5"
                      onClick={() => playClip(l.audioUrl, l.text, true)}>🐢 천천히</button>
                    {l.textKo && (
                      <button className="chip bg-white border border-slate-200 text-slate-500 !py-1.5"
                        onClick={() => setShowKo((p) => ({ ...p, [l.id]: !p[l.id] }))}>
                        {showKo[l.id] ? "해석 숨기기" : "해석 보기"}
                      </button>
                    )}
                  </>
                )}
                {(mode === "repeat" || myTurn(l)) && (
                  <button className="chip bg-rose-500 text-white !py-1.5 !px-4"
                    disabled={listening !== null}
                    onClick={() => speakLine(l, myTurn(l))}>
                    {listening === l.id ? "🎙️ 듣는 중..." : "🎤 말하기"}
                  </button>
                )}
              </div>

              {j && (
                <div className={"mt-2 rounded-lg p-2.5 text-xs " + (j.passed ? "bg-emerald-50" : "bg-rose-50")}>
                  <p className={"font-black " + (j.passed ? "text-emerald-600" : "text-rose-500")}>
                    {j.passed ? "통과" : "다시"} · 정확도 {j.score}% <span className="font-normal text-slate-400">(기준 {matchRate}%)</span>
                  </p>
                  <p className="text-slate-600 mt-0.5">{j.feedback}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
