"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

type Org = {
  id: number; name: string; type: string; phone: string | null; address: string | null;
  visible: boolean; status: string; memberCount: number; classCount: number;
  director: { name: string; username: string } | null;
  breakdown: { directors: number; teachers: number; students: number; pending: number };
};

export default function AcademiesPage() {
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "", adminName: "", adminUsername: "", adminPassword: "" });
  const [staffFor, setStaffFor] = useState<Org | null>(null);
  const [staff, setStaff] = useState({ role: "DIRECTOR", name: "", username: "", password: "", phone: "" });

  const load = useCallback(() => {
    api<{ organizations: Org[] }>("/api/admin/organizations").then((d) => setOrgs(d.organizations)).catch(() => setOrgs([]));
  }, []);
  useEffect(load, [load]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function create() {
    try {
      await api("/api/admin/organizations", { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", phone: "", address: "", adminName: "", adminUsername: "", adminPassword: "" });
      setShowNew(false);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "등록 실패");
    }
  }

  async function createStaff() {
    if (!staffFor) return;
    try {
      await api(`/api/admin/organizations/${staffFor.id}/staff`, { method: "POST", body: JSON.stringify(staff) });
      alert(`${staffFor.name}에 ${staff.role === "DIRECTOR" ? "원장" : "선생님"} 계정(${staff.username})을 만들었습니다. 바로 로그인할 수 있습니다.`);
      setStaff({ role: "DIRECTOR", name: "", username: "", password: "", phone: "" });
      setStaffFor(null);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "계정 생성 실패");
    }
  }

  async function toggleVisible(o: Org) {
    await api(`/api/admin/organizations/${o.id}`, { method: "PATCH", body: JSON.stringify({ visible: !o.visible }) });
    load();
  }

  if (!orgs) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-black text-[#16204a]">🏛️ 학원 관리 <span className="chip bg-[#c9a227] text-white ml-1">총관리자</span></h1>
          <p className="text-xs text-slate-400 mt-1">학원을 등록하면 회원가입 화면의 학원 선택칸에 노출됩니다. 원장 계정도 함께 생성됩니다.</p>
        </div>
        <button className="btn-primary text-sm" onClick={() => setShowNew(!showNew)}>+ 학원 등록</button>
      </div>

      {showNew && (
        <div className="card p-5 space-y-3 pop-in">
          <h2 className="font-black text-[#16204a]">새 학원 등록</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            <input className="input" placeholder="학원 이름" value={form.name} onChange={(e) => set("name", e.target.value)} />
            <input className="input" placeholder="전화번호" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            <input className="input" placeholder="주소" value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <p className="text-xs font-bold text-slate-500 pt-1">원장(관리자) 계정</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <input className="input" placeholder="원장 이름" value={form.adminName} onChange={(e) => set("adminName", e.target.value)} />
            <input className="input" placeholder="원장 아이디" value={form.adminUsername} onChange={(e) => set("adminUsername", e.target.value)} autoCapitalize="none" />
            <input className="input" placeholder="원장 비밀번호" value={form.adminPassword} onChange={(e) => set("adminPassword", e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={create}>등록</button>
            <button className="btn-ghost" onClick={() => setShowNew(false)}>취소</button>
          </div>
        </div>
      )}

      {staffFor && (
        <div className="card p-5 space-y-3 pop-in border-2 border-[#c9a227]/40">
          <h2 className="font-black text-[#16204a]">👤 {staffFor.name} — 원장/선생님 계정 만들기</h2>
          <p className="text-xs text-slate-400">생성 즉시 승인되어 바로 로그인할 수 있습니다. 아이디·비밀번호를 전달하고, 첫 로그인 후 비밀번호를 변경하도록 안내하세요.</p>
          <div className="grid gap-2 sm:grid-cols-5">
            <select className="input" value={staff.role} onChange={(e) => setStaff((f) => ({ ...f, role: e.target.value }))}>
              <option value="DIRECTOR">원장</option>
              <option value="TEACHER">선생님</option>
            </select>
            <input className="input" placeholder="이름" value={staff.name} onChange={(e) => setStaff((f) => ({ ...f, name: e.target.value }))} />
            <input className="input" placeholder="아이디" value={staff.username} onChange={(e) => setStaff((f) => ({ ...f, username: e.target.value }))} autoCapitalize="none" />
            <input className="input" placeholder="비밀번호" value={staff.password} onChange={(e) => setStaff((f) => ({ ...f, password: e.target.value }))} />
            <input className="input" placeholder="연락처 (선택)" value={staff.phone} onChange={(e) => setStaff((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={createStaff}>계정 생성</button>
            <button className="btn-ghost" onClick={() => setStaffFor(null)}>취소</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
              <th className="p-3">학원</th><th className="p-3">원장</th><th className="p-3">인원</th>
              <th className="p-3">반</th><th className="p-3">가입 노출</th><th className="p-3">연락처</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} className="border-b border-slate-50">
                <td className="p-3 font-black text-[#16204a]">
                  {o.name}
                  {o.type === "ACADEMY" && o.name.includes("정철") && <span className="chip bg-indigo-50 text-indigo-700 ml-1">본원</span>}
                  {o.address && <div className="text-[10px] text-slate-400 font-normal">{o.address}</div>}
                </td>
                <td className="p-3 text-slate-500">{o.director ? `${o.director.name} (${o.director.username})` : "-"}</td>
                <td className="p-3">
                  <span className="font-bold text-[#16204a]">{o.memberCount}명</span>
                  <div className="text-[10px] text-slate-400">원장 {o.breakdown.directors} · 선생님 {o.breakdown.teachers} · 학생 {o.breakdown.students}{o.breakdown.pending > 0 && <span className="text-amber-500"> (대기 {o.breakdown.pending})</span>}</div>
                </td>
                <td className="p-3">{o.classCount}개</td>
                <td className="p-3">
                  <button onClick={() => toggleVisible(o)}
                    className={"chip " + (o.visible ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400")}>
                    {o.visible ? "노출 ON" : "노출 OFF"}
                  </button>
                </td>
                <td className="p-3 text-xs text-slate-400">{o.phone ?? "-"}</td>
                <td className="p-3">
                  <button className="chip bg-[#16204a] text-white whitespace-nowrap"
                    onClick={() => { setStaffFor(o); setShowNew(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                    ＋ 계정
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
