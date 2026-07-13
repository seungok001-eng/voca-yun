import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import LogoutButton from "@/components/LogoutButton";
import StudentNav from "@/components/StudentNav";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "STUDENT" && s.role !== "INDIVIDUAL") redirect("/admin");
  const individual = s.role === "INDIVIDUAL";

  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between">
          <Link href="/home"><Logo /></Link>
          <LogoutButton name={individual ? `${s.name} (개인)` : s.name} />
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-5 pb-24">{children}</main>
      <Footer />
      <StudentNav individual={individual} />
    </div>
  );
}
