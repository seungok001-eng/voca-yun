"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

type C = {
  id: number; name: string; teacherName: string | null; studentCount: number;
  assignment: { name: string } | null;
  setting: { testMode: string; dailyWordCount: number; failThreshold: number; pronEnabled: boolean } | null;
};
type Academy = { id: number; name: string };

export default function ClassesPage() {
  const [classes, setClasses] = useState<C[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [academyId, setAcademyId] = useState("");

  // 총관리자면 학원 목록 (아니면 403 → 무시)
  useEffect(() => {
    api<{ organizations: Academy[] }>("/api/admin/organizations")
      .then((r) => {
        setAcademies(r.organizations);
        if (r.organizations.length > 0) setAcademyId((cur) => cur || String(r.organizations[0].id));
      })
      .catch(() => setAcademies([]));
  }, []);

  const load = useCallback(() => {
    if (academies.length > 0 && !academyId) return; // 총관리자는 학원 선택 후 조회
    const qs = academyId ? `?academyId=${academyId}` : "";
    api<{ classes: C[] }>(`/api/admin/classes${qs}`).then((d) => setClasses(d.classes));
  }, [academyId, academies.length]);
  useEffect(load, [load]);

  async function create() {
    if (!name.trim()) return;
    await api("/api/admin/classes", { method: "POST", body: JSON.stringify({ name, academyId: academyId || undefined }) });
    setName("");
    setShowNew(false);
    load();
  }

  async function remove(e: React.MouseEvent, c: C) {
    e.preventDefault();
    e.stopPropagation();
    const msg = c.studentCount > 0
      ? `"${c.name}" 반을 삭제할까요?\n\n소속 학생 ${c.studentCount}명은 '미배정' 상태가 되고, 반 설정·학습 배정이 함께 삭제됩니다. 학생 계정과 학습 기록은 지워지지 않습니다.\n\n이 작업은 되돌릴 수 없습니다.`
      : `"${c.name}" 반을 삭제할까요?\n\n이 작업은 되돌릴 수 없습니다.`;
    if (!confirm(msg)) return;
    try {
      await api(`/api/admin/classes/${c.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  if (!classes) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-black text-[#16204a]">🏫 반 관리
          {academies.length > 0 && <span className="text-sm text-slate-400 font-semibold"> — {academies.find((a) => String(a.id) === academyId)?.name ?? ""}</span>}
        </h1>
        <div className="flex items-center gap-2">
          {academies.length > 0 && (
            <select className="input !w-auto" value={academyId} onChange={(e) => setAcademyId(e.target.value)}>
              {academies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          <button className="btn-primary text-sm whitespace-nowrap" onClick={() => setShowNew(!showNew)}>+ 새 반 만들기</button>
        </div>
      </div>

      {showNew && (
        <div className="card p-4 flex gap-2 pop-in">
          <input className="input" placeholder="반 이름 (예: 수능정복반 B)" value={name}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          <button className="btn-primary whitespace-nowrap" onClick={create}>만들기</button>
        </div>
      )}

      {classes.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">아직 반이 없습니다. 새 반을 만들어 보세요.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Link key={c.id} href={`/admin/classes/${c.id}`} className="card p-5 block hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-black text-[#16204a] text-lg">{c.name}</h2>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="chip bg-indigo-50 text-indigo-700">{c.studentCount}명</span>
                  <button className="text-slate-300 hover:text-rose-500 text-sm" title="반 삭제"
                    onClick={(e) => remove(e, c)}>🗑️</button>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1">담당: {c.teacherName ?? "미지정"}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                <span className="chip bg-slate-100 text-slate-500">
                  📚 {c.assignment?.name ?? "학습 미배정"}
                </span>
                {c.setting && (
                  <>
                    <span className="chip bg-slate-100 text-slate-500">하루 {c.setting.dailyWordCount}단어</span>
                    <span className="chip bg-slate-100 text-slate-500">{c.setting.failThreshold}개↑ 탈락</span>
                    {c.setting.pronEnabled && <span className="chip bg-amber-50 text-amber-600">🎤 발음</span>}
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
