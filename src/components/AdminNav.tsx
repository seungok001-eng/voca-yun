"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// min: 접근 최소 권한 — staff(선생님+) / director(원장+) / super(총관리자)
type Level = "staff" | "director" | "super";
type Item = { href: string; label: string; exact?: boolean; min: Level };

const ITEMS: Item[] = [
  { href: "/admin", label: "📊 대시보드", exact: true, min: "staff" },
  { href: "/admin/academies", label: "🏛️ 학원 관리", min: "super" },
  { href: "/admin/members", label: "👥 전체 명단", min: "staff" },
  { href: "/admin/approvals", label: "✅ 가입 승인", min: "director" },
  { href: "/admin/classes", label: "🏫 반 관리", min: "staff" },
  { href: "/admin/monitor", label: "👀 실시간 모니터링", min: "staff" },
  { href: "/admin/weekly", label: "🗓️ 주간 요약", min: "staff" },
  { href: "/admin/holidays", label: "🏖️ 휴무 관리", min: "director" },
  { href: "/admin/ranking", label: "🏆 랭킹 관리", min: "director" },
  { href: "/admin/words", label: "📖 단어 관리", min: "super" },
  { href: "/admin/wordbooks", label: "📚 단어장", min: "super" },
  { href: "/admin/paper", label: "📝 시험지 출제", min: "staff" },
  { href: "/admin/reports", label: "📄 리포트", min: "staff" },
  { href: "/admin/notifications", label: "💬 학부모 알림", min: "staff" },
  { href: "/admin/errors", label: "🚨 오류 로그", min: "super" },
];

const RANK: Record<string, number> = { TEACHER: 1, DIRECTOR: 2, SUPER_ADMIN: 3 };
const NEED: Record<Level, number> = { staff: 1, director: 2, super: 3 };

export default function AdminNav({ role = "TEACHER" }: { role?: string }) {
  const pathname = usePathname();
  const myRank = RANK[role] ?? 1;
  const items = ITEMS.filter((it) => myRank >= NEED[it.min]);
  return (
    <nav className="mx-auto max-w-6xl px-4 flex gap-1 overflow-x-auto">
      {items.map((it) => {
        const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={
              "whitespace-nowrap px-3 py-2.5 text-[13px] font-bold border-b-2 transition-colors " +
              (active
                ? "border-[#c9a227] text-[#16204a]"
                : "border-transparent text-slate-400 hover:text-slate-600")
            }
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
