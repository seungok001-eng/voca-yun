"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const VOCA_ITEMS = [
  { href: "/home", label: "홈", icon: "🏠" },
  { href: "/study", label: "학습", icon: "📖" },
  { href: "/levels", label: "레벨", icon: "🗺️" },
  { href: "/wrong-note", label: "오답노트", icon: "📝" },
  { href: "/ranking", label: "랭킹", icon: "🏆" },
];
// 교재 과정 학생은 '레벨' 대신 '교재'를 본다
const TEXTBOOK_ITEMS = [
  { href: "/home", label: "홈", icon: "🏠" },
  { href: "/textbook", label: "교재", icon: "📕" },
  { href: "/study", label: "단어", icon: "📖" },
  { href: "/wrong-note", label: "오답노트", icon: "📝" },
  { href: "/ranking", label: "랭킹", icon: "🏆" },
];

export default function StudentNav({ individual = false, program = "VOCA" }: { individual?: boolean; program?: string }) {
  void individual;
  const items = program === "TEXTBOOK" ? TEXTBOOK_ITEMS : VOCA_ITEMS;
  const pathname = usePathname();
  if (pathname.startsWith("/test/")) return null; // 시험 중엔 이동 금지
  if (/^\/textbook\/\d+\/exam/.test(pathname)) return null; // 문장 시험 중에도 이동 금지
  return (
    <nav className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-2xl grid grid-cols-5">
        {items.map((it) => {
          const active = pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={
                "flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold transition-colors " +
                (active ? "text-[#16204a]" : "text-slate-400")
              }
            >
              <span className="text-lg leading-none">{it.icon}</span>
              {it.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
