"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, POS_KO } from "@/lib/client";

type Detail = {
  id: number; name: string; username: string; className: string | null;
  parentPhone: string | null; points: number; streak: number; bestStreak: number; accuracy: number | null;
  sessions: { id: number; kind: string; status: string; attemptNo: number; wrongCount: number; finishedAt: string }[];
  wrongNotes: { word: string; pos: string; meanings: string[]; wrongCount: number }[];
  resolvedWrongCount: number;
};

const KIND_KO: Record<string, string> = { DAILY: "일일시험", RETEST: "재시험", WRONG_NOTE: "오답시험", REVIEW: "복습시험" };

export default function StudentReportPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);
  const today = new Date().toLocaleDateString("ko-KR");

  useEffect(() => {
    api<Detail>(`/api/admin/students/${id}`).then(setD);
  }, [id]);

  if (!d) return <p className="p-10 text-center text-slate-400">리포트 준비 중...</p>;

  const recentPass = d.sessions.filter((s) => s.status === "PASSED").length;
  const recentFail = d.sessions.filter((s) => s.status === "FAILED").length;

  return (
    <div className="min-h-screen bg-white text-[#1a1f36]">
      <style>{`@media print { .no-print { display:none !important; } @page { margin: 16mm; } }`}</style>
      <div className="mx-auto max-w-3xl p-8">
        {/* 헤더 */}
        <div className="flex items-start justify-between border-b-2 border-[#16204a] pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-[#16204a]">학습 리포트</h1>
            <p className="text-sm text-slate-500 mt-1">정철어학원 청당국제캠퍼스 · 정철 VOCA</p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>발행일: {today}</p>
            <p>{d.className ?? "반 미배정"}</p>
          </div>
        </div>

        {/* 학생 요약 */}
        <div className="mb-6">
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="text-xl font-black text-[#16204a]">{d.name}</h2>
            <span className="text-sm text-slate-400">({d.username})</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <ReportStat label="누적 정답률" value={d.accuracy !== null ? `${d.accuracy}%` : "-"} />
            <ReportStat label="포인트" value={`${d.points.toLocaleString()}P`} />
            <ReportStat label="연속 학습" value={`${d.streak}일`} />
            <ReportStat label="미해결 오답" value={`${d.wrongNotes.length}개`} />
          </div>
        </div>

        {/* 최근 시험 */}
        <section className="mb-6">
          <h3 className="font-black text-[#16204a] border-l-4 border-[#c9a227] pl-2 mb-2">최근 시험 기록 (최근 {recentPass + recentFail}회 중 통과 {recentPass} · 탈락 {recentFail})</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-1.5">일시</th><th className="py-1.5">종류</th><th className="py-1.5">결과</th><th className="py-1.5">오답</th>
              </tr>
            </thead>
            <tbody>
              {d.sessions.slice(0, 12).map((s) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-1.5 text-slate-500">{new Date(s.finishedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="py-1.5">{KIND_KO[s.kind]}{s.attemptNo > 1 && ` ${s.attemptNo}차`}</td>
                  <td className={"py-1.5 font-bold " + (s.status === "PASSED" ? "text-emerald-600" : "text-rose-500")}>{s.status === "PASSED" ? "통과" : "탈락"}</td>
                  <td className="py-1.5">{s.wrongCount}개</td>
                </tr>
              ))}
              {d.sessions.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-slate-400">시험 기록이 없습니다.</td></tr>}
            </tbody>
          </table>
        </section>

        {/* 오답 단어 */}
        <section className="mb-6">
          <h3 className="font-black text-[#16204a] border-l-4 border-[#c9a227] pl-2 mb-2">집중 복습이 필요한 단어 (미해결 오답 {d.wrongNotes.length}개)</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {d.wrongNotes.slice(0, 30).map((n, i) => (
              <div key={i} className="flex justify-between border-b border-slate-100 py-1">
                <span><b className="text-[#16204a]">{n.word}</b> <span className="text-xs text-slate-400">[{POS_KO[n.pos] ?? n.pos}]</span> {n.meanings[0]}</span>
                <span className="text-rose-500 text-xs">{n.wrongCount}회</span>
              </div>
            ))}
          </div>
          {d.wrongNotes.length === 0 && <p className="text-sm text-emerald-600">미해결 오답이 없습니다. 훌륭합니다! 👏</p>}
        </section>

        {/* 코멘트란 */}
        <section className="mb-8">
          <h3 className="font-black text-[#16204a] border-l-4 border-[#c9a227] pl-2 mb-2">선생님 코멘트</h3>
          <div className="border border-slate-200 rounded-lg h-24"></div>
        </section>

        <div className="text-center text-[11px] text-slate-400 border-t border-slate-200 pt-3">
          정철어학원 청당국제캠퍼스 · 충청남도 천안시 동남구 청당5로 36, 3층 · ☎ 0507-1434-5569 · Jay by Jay
        </div>

        <div className="no-print mt-6 text-center">
          <button className="btn-primary" onClick={() => window.print()}>🖨️ 인쇄 / PDF로 저장</button>
        </div>
      </div>
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 text-center">
      <p className="text-lg font-black text-[#16204a]">{value}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}
