import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import LogoutButton from "@/components/LogoutButton";
import AdminNav from "@/components/AdminNav";

const ROLE_KO: Record<string, string> = { SUPER_ADMIN: "총관리자", DIRECTOR: "원장", TEACHER: "선생님" };
const CHIP_KO: Record<string, string> = { SUPER_ADMIN: "총관리자", DIRECTOR: "원장", TEACHER: "선생님" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role === "STUDENT" || s.role === "INDIVIDUAL") redirect("/home");

  const isSuper = s.role === "SUPER_ADMIN";
  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin"><Logo /></Link>
            <span className={"chip text-white " + (isSuper ? "bg-[#c9a227]" : "bg-[#16204a]")}>
              {CHIP_KO[s.role] ?? "관리자"}
            </span>
          </div>
          <LogoutButton name={`${s.name} (${ROLE_KO[s.role] ?? "관리자"})`} />
        </div>
        <AdminNav role={s.role} />
      </header>
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
      <Footer />
    </div>
  );
}
