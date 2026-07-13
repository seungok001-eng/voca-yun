"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

type Pending = {
  id: number; name: string; username: string; role: string; birthdate: string | null;
  gender: string | null; school: string | null; parentPhone: string | null;
  academyName: string; createdAt: string;
};
type ClassRow = { id: number; name: string };

const GENDER: Record<string, string> = { M: "남", F: "여", OTHER: "기타" };

export default function ApprovalsPage() {
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [pick, setPick] = useState<Record<number, string>>({});

  const load = useCallback(() => {
    api<{ pending: Pending[] }>("/api/admin/pending").then((d) => setPending(d.pending));
  }, []);
  useEffect(() => {
    load();
    api<{ classes: ClassRow[] }>("/api/admin/classes").then((d) => setClasses(d.classes)).catch(() => {});
  }, [load]);

  async function act(id: number, action: "approve" | "reject") {
    try {
      await api(`/api/admin/pending/${id}`, {
        method: "POST",
        body: JSON.stringify({ action, classId: action === "approve" ? pick[id] : undefined }),
      });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "처리 실패");
    }
  }

  if (!pending) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-[#16204a]">✅ 가입 승인</h1>
        <p className="text-xs text-slate-400 mt-1">가입을 신청한 학생·선생님을 승인하거나 거절합니다. 학생은 승인 시 반을 함께 배정할 수 있고, 선생님은 승인 후 반 관리에서 담당 반을 지정하세요.</p>
      </div>

      {pending.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">승인 대기 중인 회원이 없습니다.</div>
      ) : (
        <div className="space-y-3">
          {pending.map((p) => {
            const isTeacher = p.role === "TEACHER";
            return (
            <div key={p.id} className="card p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px]">
                <p className="font-black text-[#16204a] flex items-center gap-2">
                  <span className={"chip !py-0.5 text-white text-[10px] " + (isTeacher ? "bg-[#c9a227]" : "bg-[#16204a]")}>
                    {isTeacher ? "🧑‍🏫 선생님" : "🎓 학생"}
                  </span>
                  {p.name}
                  <span className="text-xs text-slate-400 font-normal">{p.username}</span>
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isTeacher
                    ? (p.parentPhone ? `연락처 ${p.parentPhone}` : "연락처 -")
                    : <>{p.birthdate ?? "생년월일 -"} · {p.gender ? GENDER[p.gender] : "-"} · {p.school ?? "학교 -"}{p.parentPhone && ` · 학부모 ${p.parentPhone}`}</>}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">신청: {new Date(p.createdAt).toLocaleString("ko-KR")}</p>
              </div>
              {isTeacher ? (
                <span className="text-[11px] text-slate-400">승인 후 반 관리에서 담당 반 지정</span>
              ) : (
                <select className="input !w-auto text-sm" value={pick[p.id] ?? ""} onChange={(e) => setPick({ ...pick, [p.id]: e.target.value })}>
                  <option value="">반 미배정</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <button className="btn-primary text-sm" onClick={() => act(p.id, "approve")}>승인</button>
              <button className="btn-ghost text-sm !border-rose-200 !text-rose-500" onClick={() => act(p.id, "reject")}>거절</button>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
