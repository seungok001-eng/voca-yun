"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton({ name }: { name: string }) {
  const router = useRouter();
  return (
    <button
      className="text-xs font-semibold text-slate-500 hover:text-slate-800"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
      }}
    >
      {name} · 로그아웃
    </button>
  );
}
