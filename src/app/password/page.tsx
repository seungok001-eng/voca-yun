"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import Logo from "@/components/Logo";

// 비밀번호 변경 — 모든 역할(학생·개인·선생님·원장·총관리자) 공통
export default function PasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== confirm) { setError("새 비밀번호가 서로 다릅니다."); return; }
    setBusy(true);
    try {
      await api("/api/me/password", { method: "POST", body: JSON.stringify({ current, next }) });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-6 space-y-4 pop-in">
        <div className="flex justify-center"><Logo /></div>
        {done ? (
          <div className="text-center space-y-3">
            <p className="text-3xl">✅</p>
            <p className="font-black text-[#16204a]">비밀번호가 변경되었습니다</p>
            <p className="text-xs text-slate-400">다음 로그인부터 새 비밀번호를 사용하세요.</p>
            <button className="btn-primary w-full" onClick={() => router.back()}>돌아가기</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <h1 className="text-lg font-black text-[#16204a] text-center">🔒 비밀번호 변경</h1>
            <input className="input w-full" type="password" placeholder="현재 비밀번호"
              value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            <input className="input w-full" type="password" placeholder="새 비밀번호 (4자 이상)"
              value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            <input className="input w-full" type="password" placeholder="새 비밀번호 확인"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            {error && <p className="text-xs font-bold text-rose-500">{error}</p>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? "변경 중..." : "변경하기"}</button>
            <button type="button" className="btn-ghost w-full" onClick={() => router.back()}>취소</button>
          </form>
        )}
      </div>
    </div>
  );
}
