import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { resolveSettings } from "@/lib/settings";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import LogoutButton from "@/components/LogoutButton";
import StudentNav from "@/components/StudentNav";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "STUDENT" && s.role !== "INDIVIDUAL") redirect("/admin");
  const individual = s.role === "INDIVIDUAL";
  const { program, uiTheme } = await resolveSettings(s.uid);

  return (
    <div className="flex-1 flex flex-col student" data-theme={uiTheme}>
      {uiTheme === "CUTE" && (
        // 초등용 둥근 제목 글꼴 (React가 <head>로 올려 준다)
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&display=swap" />
      )}
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between">
          <Link href="/home"><Logo /></Link>
          <LogoutButton name={individual ? `${s.name} (개인)` : s.name} />
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-5 pb-24">{children}</main>
      <Footer />
      <StudentNav individual={individual} program={program} />
    </div>
  );
}
