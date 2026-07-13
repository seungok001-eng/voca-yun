"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

type Log = {
  id: number; type: string; message: string; sentAt: string;
  studentName: string; className: string; parentPhone: string;
};
type Academy = { id: number; name: string };

const TYPE_CHIP: Record<string, { label: string; cls: string }> = {
  TEST_PASS: { label: "통과", cls: "bg-emerald-50 text-emerald-600" },
  TEST_FAIL: { label: "탈락", cls: "bg-rose-50 text-rose-500" },
  REPEAT_FAIL: { label: "연속 탈락 ⚠️", cls: "bg-amber-50 text-amber-600" },
};

export default function NotificationsPage() {
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [academyId, setAcademyId] = useState("");

  // 총관리자면 학원 목록 (아니면 403 → 무시)
  useEffect(() => {
    api<{ organizations: Academy[] }>("/api/admin/organizations")
      .then((r) => setAcademies(r.organizations)).catch(() => setAcademies([]));
  }, []);

  const load = useCallback(() => {
    const qs = academyId ? `?academyId=${academyId}` : "";
    api<{ logs: Log[] }>(`/api/admin/notifications${qs}`).then((d) => setLogs(d.logs));
  }, [academyId]);
  useEffect(load, [load]);

  async function removeOne(l: Log) {
    if (!confirm(`${l.studentName} 학생의 이 알림을 삭제할까요?`)) return;
    await api(`/api/admin/notifications/${l.id}`, { method: "DELETE" });
    setLogs((cur) => cur?.filter((x) => x.id !== l.id) ?? null);
  }
  async function clearAll() {
    const scope = academyId ? academies.find((a) => String(a.id) === academyId)?.name ?? "선택한 학원" : (academies.length > 0 ? "전체 학원" : "");
    if (!confirm(`${scope ? scope + "의 " : ""}학부모 알림을 모두 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await api(`/api/admin/notifications${academyId ? `?academyId=${academyId}` : ""}`, { method: "DELETE" });
    load();
  }

  if (!logs) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-[#16204a]">💬 학부모 알림</h1>
          <p className="text-xs text-slate-400 mt-1">
            시험 통과/탈락 시 자동 생성되는 알림 메시지입니다. 카카오 알림톡·SMS 발송 서비스와 연동하면 학부모 휴대폰으로 자동 발송됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {academies.length > 0 && (
            <select className="input !w-auto" value={academyId} onChange={(e) => setAcademyId(e.target.value)}>
              <option value="">전체 학원</option>
              {academies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          {logs.length > 0 && (
            <button className="btn-ghost !border-rose-200 !text-rose-500 whitespace-nowrap" onClick={clearAll}>🗑️ 전체 삭제</button>
          )}
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
              <th className="p-3">시각</th><th className="p-3">학생</th><th className="p-3">유형</th>
              <th className="p-3">메시지</th><th className="p-3">수신번호</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => {
              const t = TYPE_CHIP[l.type] ?? { label: l.type, cls: "bg-slate-100 text-slate-500" };
              return (
                <tr key={l.id} className="border-b border-slate-50">
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{new Date(l.sentAt).toLocaleString("ko-KR")}</td>
                  <td className="p-3 font-bold text-[#16204a] whitespace-nowrap">{l.studentName} <span className="text-[10px] text-slate-400">({l.className})</span></td>
                  <td className="p-3"><span className={"chip " + t.cls}>{t.label}</span></td>
                  <td className="p-3 text-xs text-slate-600">{l.message}</td>
                  <td className="p-3 text-xs text-slate-400 whitespace-nowrap">{l.parentPhone}</td>
                  <td className="p-3 whitespace-nowrap">
                    <button className="text-xs text-slate-400 hover:text-rose-500" title="삭제" onClick={() => removeOne(l)}>🗑️</button>
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">알림이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
