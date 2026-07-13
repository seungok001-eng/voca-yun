"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

type Member = {
  id: number; name: string; username: string; plainPassword: string | null;
  role: string; status: string; classId: number | null; className: string | null;
  school: string | null; grade: string | null; parentPhone: string | null; birthdate: string | null;
  level: string | null; behindDays: number | null; cursor: number | null; total: number | null;
};
type ClassRow = { id: number; name: string };
type Academy = { id: number; name: string };
type Data = {
  academyName: string | null; classes: ClassRow[]; total: number;
  roleCounts: { director: number; teacher: number; student: number; pending: number };
  members: Member[];
};

const ROLE_KO: Record<string, string> = { SUPER_ADMIN: "원장", DIRECTOR: "원장", TEACHER: "선생님", STUDENT: "학생", INDIVIDUAL: "개인" };

export default function MembersPage() {
  const [data, setData] = useState<Data | null>(null);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [academyId, setAcademyId] = useState("");
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");
  const [detail, setDetail] = useState<{ member: Member } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [moveTo, setMoveTo] = useState("");

  // 총관리자면 학원 목록 (아니면 403 → 무시)
  useEffect(() => {
    api<{ organizations: Academy[] }>("/api/admin/organizations")
      .then((r) => setAcademies(r.organizations)).catch(() => setAcademies([]));
  }, []);

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (classId) p.set("classId", classId);
    if (academyId) p.set("academyId", academyId);
    api<Data>(`/api/admin/members?${p}`).then((d) => { setData(d); setSelected(new Set()); });
  }, [q, classId, academyId]);
  useEffect(load, [load]);

  async function assignClass(m: Member, newClassId: string) {
    await api(`/api/admin/students/${m.id}`, { method: "PATCH", body: JSON.stringify({ classId: newClassId || null }) });
    load();
  }

  function toggle(id: number) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  async function moveSelected() {
    if (selected.size === 0) return;
    const clsName = moveTo ? data?.classes.find((c) => String(c.id) === moveTo)?.name ?? "선택한 반" : "미배정";
    if (!confirm(`선택한 학생 ${selected.size}명을 "${clsName}"(으)로 이동할까요?`)) return;
    try {
      await api("/api/admin/students/batch", { method: "PATCH", body: JSON.stringify({ ids: [...selected], classId: moveTo || null }) });
      setMoveTo("");
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "이동 실패");
    }
  }
  async function resetPw(m: Member) {
    const np = prompt(`${m.name} 학생의 새 비밀번호를 입력하세요`, "1234");
    if (!np) return;
    await api(`/api/admin/students/${m.id}`, { method: "PATCH", body: JSON.stringify({ password: np }) });
    load();
  }
  async function setProgress(m: Member) {
    const cur = (m.cursor ?? 0) + 1;
    const input = prompt(
      `${m.name} 학생이 몇 번 단어부터 학습할지 입력하세요.\n(현재 ${m.cursor ?? 0}번까지 완료 / 전체 ${m.total ?? "?"}개)\n※ 설정하면 밀림 계산도 오늘·이 번호 기준으로 다시 시작됩니다.`,
      String(cur)
    );
    if (!input) return;
    try {
      await api(`/api/admin/students/${m.id}/progress`, { method: "POST", body: JSON.stringify({ startNumber: Number(input) }) });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "진도 설정 실패");
    }
  }

  if (!data) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  const studentRows = data.members.filter((m) => m.role === "STUDENT");
  const allSelected = studentRows.length > 0 && studentRows.every((m) => selected.has(m.id));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(studentRows.map((m) => m.id)));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-black text-[#16204a]">👥 전체 명단 {data.academyName && <span className="text-sm text-slate-400 font-semibold">— {data.academyName}</span>}</h1>
          <p className="text-xs text-slate-400 mt-1">
            총 {data.total}명 · 원장·선생님 {data.roleCounts.director + data.roleCounts.teacher}명 · 학생 {data.roleCounts.student}명
            {data.roleCounts.pending > 0 && <span className="text-amber-600"> (승인대기 {data.roleCounts.pending}명)</span>}
          </p>
        </div>
      </div>

      {/* 필터 */}
      <div className="card p-4 grid gap-2 sm:grid-cols-4">
        <input className="input" placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">전체 반</option>
          {data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {academies.length > 0 && (
          <select className="input" value={academyId} onChange={(e) => { setAcademyId(e.target.value); setClassId(""); }}>
            <option value="">내 학원</option>
            {academies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {/* 선택 이동 바 */}
      {selected.size > 0 && (
        <div className="card p-3 flex items-center gap-3 flex-wrap bg-indigo-50/60 border-indigo-100 pop-in">
          <span className="font-bold text-[#16204a] text-sm">✔ {selected.size}명 선택됨</span>
          <span className="text-slate-400 text-sm">→</span>
          <select className="input !w-auto !py-1.5" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            <option value="">미배정으로</option>
            {data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}(으)로</option>)}
          </select>
          <button className="btn-primary !py-1.5 text-sm" onClick={moveSelected}>반 이동</button>
          <button className="btn-ghost !py-1.5 text-sm" onClick={() => setSelected(new Set())}>선택 해제</button>
        </div>
      )}

      {/* 명단 */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
              <th className="p-2.5">
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  disabled={studentRows.length === 0} title="학생 전체 선택" />
              </th>
              <th className="p-2.5">이름</th><th className="p-2.5">역할</th><th className="p-2.5">아이디</th>
              <th className="p-2.5">비번</th><th className="p-2.5">현재 반</th><th className="p-2.5">레벨</th>
              <th className="p-2.5">진도</th>
              <th className="p-2.5">학교</th><th className="p-2.5">학년</th><th className="p-2.5">학부모</th>
              <th className="p-2.5">전날까지</th><th className="p-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.id} className={"border-b border-slate-50 hover:bg-slate-50/50 " + (selected.has(m.id) ? "bg-indigo-50/40" : "")}>
                <td className="p-2.5">
                  {m.role === "STUDENT"
                    ? <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                    : null}
                </td>
                <td className="p-2.5 font-bold text-[#16204a]">
                  {m.name}
                  {m.status === "PENDING" && <span className="chip bg-amber-50 text-amber-600 ml-1">대기</span>}
                </td>
                <td className="p-2.5 text-slate-500">{ROLE_KO[m.role] ?? m.role}</td>
                <td className="p-2.5 text-slate-500">{m.username}</td>
                <td className="p-2.5">
                  {m.role === "STUDENT"
                    ? <span className="font-mono text-slate-600">{m.plainPassword ?? <button className="text-indigo-600 text-xs" onClick={() => resetPw(m)}>재설정</button>}</span>
                    : <span className="text-slate-300">-</span>}
                </td>
                <td className="p-2.5">
                  {m.role === "STUDENT"
                    ? <select className="input !py-1 !text-xs !w-auto" value={m.classId ?? ""} onChange={(e) => assignClass(m, e.target.value)}>
                        <option value="">미배정</option>
                        {data.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    : <span className="text-slate-300">-</span>}
                </td>
                <td className="p-2.5 text-xs text-slate-500">{m.level ?? "-"}</td>
                <td className="p-2.5">
                  {m.role === "STUDENT" && m.total !== null ? (
                    <button className="text-xs font-bold text-[#16204a] hover:underline whitespace-nowrap"
                      onClick={() => setProgress(m)} title="클릭해서 시작 번호 변경">
                      {m.cursor ?? 0}<span className="text-slate-300">/{m.total}</span> ✏️
                    </button>
                  ) : <span className="text-slate-300">-</span>}
                </td>
                <td className="p-2.5 text-slate-500">{m.school ?? "-"}</td>
                <td className="p-2.5 text-slate-500">{m.grade ?? "-"}</td>
                <td className="p-2.5 text-xs text-slate-400">{m.parentPhone ?? "-"}</td>
                <td className="p-2.5">
                  {m.role !== "STUDENT" || m.behindDays === null
                    ? <span className="text-slate-300">-</span>
                    : m.behindDays === 0
                      ? <span className="chip bg-emerald-50 text-emerald-600">✓ 통과</span>
                      : <button className="chip bg-rose-50 text-rose-600" onClick={() => setDetail({ member: m })}>
                          ⚠ {m.behindDays}일 밀림
                        </button>}
                </td>
                <td className="p-2.5">
                  <Link href={`/admin/students/${m.id}`} className="text-xs font-bold text-indigo-600 hover:underline">상세</Link>
                </td>
              </tr>
            ))}
            {data.members.length === 0 && <tr><td colSpan={13} className="p-8 text-center text-slate-400">해당하는 사람이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">💡 &ldquo;전날까지&rdquo;는 하루 목표 단어수 × 학습 경과일 대비 실제 진도로 계산합니다. 밀린 것을 누르면 안 한 부분을 자세히 볼 수 있어요.</p>

      {detail && <BehindModal member={detail.member} onClose={() => setDetail(null)} />}
    </div>
  );
}

type Chunk = { studyDay: number; dueDate: string; words: { no: number; text: string; meaning: string; emoji: string | null }[] };

function BehindModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const [data, setData] = useState<{ summary: { behindDays: number; cursor: number; expected: number; total: number; dailyWordCount: number }; chunks: Chunk[] } | null>(null);
  useEffect(() => {
    api<{ summary: { behindDays: number; cursor: number; expected: number; total: number; dailyWordCount: number }; chunks: Chunk[] }>(`/api/admin/members/${member.id}/behind`).then(setData);
  }, [member.id]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto pop-in" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-black text-[#16204a] text-lg">{member.name} — 밀린 학습</h2>
        {!data ? <p className="text-slate-400 py-6 text-center">불러오는 중...</p> : (
          <>
            <p className="text-sm text-slate-500 mt-1 mb-3">
              어제까지 <b className="text-[#16204a]">{data.summary.expected}단어</b>를 했어야 하는데
              현재 <b>{data.summary.cursor}단어</b> 완료 → <b className="text-rose-600">{data.summary.behindDays}일치</b> 밀림
            </p>
            <div className="space-y-3">
              {data.chunks.map((c) => (
                <div key={c.studyDay} className="rounded-xl border border-slate-200 p-3">
                  <p className="font-bold text-sm text-[#16204a]">
                    {c.studyDay}일차 <span className="text-xs text-slate-400 font-normal">({c.dueDate}까지 했어야 함)</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {c.words.map((w, i) => (
                      <span key={i} className="chip bg-slate-100 text-slate-600">
                        <span className="text-slate-400 font-normal">{w.no}.</span> {w.emoji && <span>{w.emoji}</span>} {w.text} <span className="text-slate-400">{w.meaning}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {data.chunks.length === 0 && <p className="text-emerald-600 text-center py-4">밀린 부분이 없습니다.</p>}
            </div>
          </>
        )}
        <button className="btn-ghost w-full mt-4" onClick={onClose}>닫기</button>
      </div>
    </div>
  );
}
