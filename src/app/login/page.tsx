"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Footer from "@/components/Footer";
import { api } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api<{ role: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      router.replace(res.role === "STUDENT" ? "/home" : "/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 실패");
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8 space-y-3">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-[#16204a] to-[#2a3c7d] text-white text-3xl font-black shadow-xl shadow-indigo-900/20">
              正
            </div>
            <h1 className="text-3xl font-black text-[#16204a] tracking-tight">정철 VOCA</h1>
            <p className="text-sm font-bold text-[color:var(--brand-gold)] tracking-wide">
              정철어학원 청당국제캠퍼스
            </p>
            <p className="text-xs text-slate-500">파닉스부터 수능 만점까지 · 20단계 단어 학습</p>
          </div>

          <form onSubmit={submit} className="card p-6 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1.5">아이디</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="아이디를 입력하세요"
                autoCapitalize="none"
                autoComplete="username"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1.5">비밀번호</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-rose-600 font-semibold shake">{error}</p>}
            <button className="btn-primary w-full py-3" disabled={loading}>
              {loading ? "로그인 중..." : "로그인"}
            </button>
            <p className="text-center text-xs text-slate-400">
              계정이 없나요? <Link href="/signup" className="font-bold text-[#16204a]">회원가입</Link>
            </p>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  );
}
