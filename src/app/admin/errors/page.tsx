"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

type Err = { id: number; message: string; stack: string | null; createdAt: string };

export default function ErrorsPage() {
  const [errors, setErrors] = useState<Err[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(() => {
    api<{ errors: Err[] }>("/api/admin/errors").then((d) => setErrors(d.errors));
  }, []);
  useEffect(load, [load]);

  async function clearAll() {
    if (!confirm("오류 로그를 모두 삭제할까요?")) return;
    await api("/api/admin/errors", { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-black text-[#16204a]">🚨 서버 오류 로그</h1>
          <p className="text-xs text-slate-400 mt-1">예상하지 못한 서버 오류가 자동으로 기록됩니다. 최근 200건 표시. (권한 오류·안내 메시지는 기록되지 않음)</p>
        </div>
        {errors && errors.length > 0 && (
          <button className="btn-ghost text-sm text-rose-500" onClick={clearAll}>전체 비우기</button>
        )}
      </div>

      {!errors ? (
        <p className="text-slate-400 text-center py-16">불러오는 중...</p>
      ) : errors.length === 0 ? (
        <div className="card p-10 text-center text-slate-400">✅ 기록된 오류가 없습니다.</div>
      ) : (
        <ul className="space-y-2">
          {errors.map((e) => (
            <li key={e.id} className="card p-4">
              <button className="w-full text-left" onClick={() => setOpen(open === e.id ? null : e.id)}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-bold text-rose-600 text-sm break-all">{e.message}</p>
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString("ko-KR")}
                  </span>
                </div>
              </button>
              {open === e.id && e.stack && (
                <pre className="mt-3 p-3 bg-slate-50 rounded-lg text-[11px] text-slate-500 overflow-x-auto whitespace-pre-wrap">{e.stack}</pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
