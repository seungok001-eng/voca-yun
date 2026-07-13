"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LogoutButton({ name }: { name: string }) {
  const router = useRouter();
  return (
    <span className="flex items-center gap-2 text-xs font-semibold text-slate-500">
      <span>{name}</span>
      <span className="text-slate-300">·</span>
      <Link href="/password" className="hover:text-slate-800" title="비밀번호 변경">🔒 비번변경</Link>
      <span className="text-slate-300">·</span>
      <button
        className="hover:text-slate-800"
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.replace("/login");
        }}
      >
        로그아웃
      </button>
    </span>
  );
}
