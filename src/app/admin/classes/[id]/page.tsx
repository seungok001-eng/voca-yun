"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import SettingsForm, { type SettingsValues } from "@/components/SettingsForm";

type Detail = {
  id: number; name: string;
  teacher: { id: number; name: string } | null;
  setting: SettingsValues | null;
  assignment: { id: number; sourceType: string; levelId: number | null; wordbookId: number | null; name: string } | null;
  students: {
    id: number; username: string; name: string; points: number; streak: number;
    parentPhone: string | null; hasOverride: boolean;
    lastTest: { id: number; status: string; kind: string; attemptNo: number; finishedAt: string } | null;
  }[];
};
type LevelRow = { id: number; order: number; nameKo: string; groupKo: string; wordCount: number };
type WordbookRow = { id: number; name: string; wordCount: number };

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [wordbooks, setWordbooks] = useState<WordbookRow[]>([]);
  const [tab, setTab] = useState<"students" | "settings" | "assign">("students");
  const [newStudent, setNewStudent] = useState({ username: "", password: "", name: "", parentPhone: "", school: "", grade: "" });
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(() => {
    api<Detail>(`/api/admin/classes/${id}`).then(setD);
  }, [id]);
  useEffect(() => {
    load();
    api<{ levels: LevelRow[] }>("/api/admin/levels").then((r) => setLevels(r.levels));
    api<{ wordbooks: WordbookRow[] }>("/api/admin/wordbooks").then((r) => setWordbooks(r.wordbooks));
  }, [load]);

  if (!d) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  async function addStudent() {
    try {
      await api("/api/admin/students", {
        method: "POST",
        body: JSON.stringify({ ...newStudent, classId: d!.id }),
      });
      setNewStudent({ username: "", password: "", name: "", parentPhone: "", school: "", grade: "" });
      setShowNew(false);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "생성 실패");
    }
  }

  async function assign(sourceType: string, levelId?: number, wordbookId?: number) {
    await api("/api/admin/assignments", {
      method: "POST",
      body: JSON.stringify({ classId: d!.id, sourceType, levelId, wordbookId }),
    });
    load();
    alert("배정되었습니다. 학생들의 진도는 처음부터 시작됩니다.");
  }

  const statusChip = (t: Detail["students"][number]["lastTest"]) => {
    if (!t) return <span className="chip bg-slate-100 text-slate-400">시험 전</span>;
    return t.status === "PASSED"
      ? <span className="chip bg-emerald-50 text-emerald-600">통과 ✓</span>
      : <span className="chip bg-rose-50 text-rose-500">탈락 ({t.attemptNo}차)</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Link href="/admin/classes" className="text-xs font-bold text-slate-400">← 반 목록</Link>
          <h1 className="text-xl font-black text-[#16204a]">{d.name}</h1>
          <p className="text-xs text-slate-400">담당 {d.teacher?.name ?? "미지정"} · 현재 학습: <b className="text-[#c9a227]">{d.assignment?.name ?? "미배정"}</b></p>
        </div>
        <div className="flex gap-1.5">
          {(["students", "settings", "assign"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={"chip !py-2 !px-4 " + (tab === t ? "bg-[#16204a] text-white" : "bg-white border border-slate-200 text-slate-500")}>
              {{ students: "👨‍🎓 학생", settings: "⚙️ 시험 설정", assign: "📚 학습 배정" }[t]}
            </button>
          ))}
        </div>
      </div>

      {tab === "students" && (
        <div className="space-y-3">
          <button className="btn-ghost text-sm" onClick={() => setShowNew(!showNew)}>+ 학생 추가</button>
          {showNew && (
            <div className="card p-4 grid gap-2 sm:grid-cols-4 pop-in">
              <input className="input" placeholder="아이디" value={newStudent.username}
                onChange={(e) => setNewStudent({ ...newStudent, username: e.target.value })} />
              <input className="input" placeholder="비밀번호" value={newStudent.password}
                onChange={(e) => setNewStudent({ ...newStudent, password: e.target.value })} />
              <input className="input" placeholder="이름" value={newStudent.name}
                onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })} />
              <input className="input" placeholder="학부모 연락처" value={newStudent.parentPhone}
                onChange={(e) => setNewStudent({ ...newStudent, parentPhone: e.target.value })} />
              <input className="input" placeholder="학교" value={newStudent.school}
                onChange={(e) => setNewStudent({ ...newStudent, school: e.target.value })} />
              <input className="input" placeholder="학년 (예: 중1)" value={newStudent.grade}
                onChange={(e) => setNewStudent({ ...newStudent, grade: e.target.value })} />
              <button className="btn-primary sm:col-span-2" onClick={addStudent}>추가</button>
            </div>
          )}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
                  <th className="p-3">이름</th><th className="p-3">아이디</th><th className="p-3">최근 시험</th>
                  <th className="p-3">포인트</th><th className="p-3">스트릭</th><th className="p-3">개별 설정</th><th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {d.students.map((st) => (
                  <tr key={st.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="p-3 font-bold text-[#16204a]">{st.name}</td>
                    <td className="p-3 text-slate-500">{st.username}</td>
                    <td className="p-3">{statusChip(st.lastTest)}</td>
                    <td className="p-3">{st.points.toLocaleString()}P</td>
                    <td className="p-3">🔥 {st.streak}</td>
                    <td className="p-3">{st.hasOverride ? <span className="chip bg-amber-50 text-amber-600">개별 ⚙️</span> : <span className="text-xs text-slate-300">반 설정</span>}</td>
                    <td className="p-3"><Link className="text-xs font-bold text-indigo-600 hover:underline" href={`/admin/students/${st.id}`}>관리 →</Link></td>
                  </tr>
                ))}
                {d.students.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-400">학생이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="card p-5">
          <h2 className="font-black text-[#16204a] mb-1">반 기본 시험 설정</h2>
          <p className="text-xs text-slate-400 mb-4">이 반 모든 학생에게 적용됩니다. 학생별 개별 설정이 있으면 그 값이 우선합니다.</p>
          <SettingsForm
            initial={d.setting}
            onSave={async (v) => {
              await api(`/api/admin/classes/${id}`, { method: "PATCH", body: JSON.stringify({ setting: v }) });
              load();
            }}
          />
        </div>
      )}

      {tab === "assign" && (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-black text-[#16204a] mb-3">20단계 레벨 배정</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {levels.map((l) => (
                <button key={l.id}
                  onClick={() => assign("LEVEL", l.id)}
                  className={"card !rounded-xl p-3 text-left hover:!border-[#c9a227] transition-colors " +
                    (d.assignment?.levelId === l.id ? "!border-2 !border-[#c9a227]" : "")}>
                  <p className="text-[10px] font-bold text-slate-400">Lv.{l.order} · {l.groupKo}</p>
                  <p className="font-black text-[#16204a] text-sm">{l.nameKo}</p>
                  <p className="text-[10px] text-slate-400">{l.wordCount}단어</p>
                </button>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h2 className="font-black text-[#16204a] mb-3">커스텀 단어장 배정</h2>
            {wordbooks.length === 0 ? (
              <p className="text-sm text-slate-400">단어장이 없습니다. <Link href="/admin/wordbooks" className="text-indigo-600 font-bold">단어장 메뉴</Link>에서 엑셀로 업로드하세요.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                {wordbooks.map((w) => (
                  <button key={w.id} onClick={() => assign("WORDBOOK", undefined, w.id)}
                    className={"card !rounded-xl p-3 text-left hover:!border-[#c9a227] " +
                      (d.assignment?.wordbookId === w.id ? "!border-2 !border-[#c9a227]" : "")}>
                    <p className="font-black text-[#16204a] text-sm">{w.name}</p>
                    <p className="text-[10px] text-slate-400">{w.wordCount}단어</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
