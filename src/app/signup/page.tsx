"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Footer from "@/components/Footer";
import { api } from "@/lib/client";

type Academy = { id: number; name: string };

export default function SignupPage() {
  const router = useRouter();
  const [academies, setAcademies] = useState<Academy[]>([]);
  const [accountType, setAccountType] = useState<"ACADEMY" | "TEACHER" | "INDIVIDUAL">("ACADEMY");
  const [form, setForm] = useState({
    name: "", username: "", password: "", birthdate: "", gender: "", school: "", grade: "",
    organizationId: "", parentPhone: "",
  });
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ status: string; academyName?: string; role?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ academies: Academy[] }>("/api/academies").then((d) => setAcademies(d.academies)).catch(() => {});
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if ((accountType === "ACADEMY" || accountType === "TEACHER") && !form.organizationId) {
      setError("학원을 선택해 주세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ status: string; academyName?: string; role?: string }>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ ...form, accountType }),
      });
      if (res.status === "APPROVED") {
        router.replace("/home"); // 개인 — 즉시 학습 시작
      } else {
        setDone({ status: res.status, academyName: res.academyName, role: res.role });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "회원가입 실패");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    const isTeacher = done.role === "TEACHER";
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="card p-8 max-w-sm text-center space-y-3 pop-in">
            <p className="text-5xl">{isTeacher ? "🧑‍🏫" : "📨"}</p>
            <h1 className="text-xl font-black text-[#16204a]">가입 신청 완료</h1>
            <p className="text-sm text-slate-500">
              <b>{done.academyName}</b> 관리자의 승인을 기다리고 있어요.<br />
              {isTeacher
                ? "승인되면 로그인하여 관리자 페이지에서 학생을 관리할 수 있습니다."
                : "승인되면 로그인하여 학습을 시작할 수 있습니다."}
            </p>
            <Link href="/login" className="btn-primary inline-block">로그인 화면으로</Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-black text-[#16204a]">회원가입</h1>
            <p className="text-xs text-slate-500 mt-1">정철 VOCA로 단어 학습을 시작하세요</p>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <button type="button" onClick={() => setAccountType("ACADEMY")}
              className={"card p-3 text-center text-sm font-bold " + (accountType === "ACADEMY" ? "!border-2 !border-[#16204a] text-[#16204a]" : "text-slate-400")}>
              🏫 학원 학생
              <span className="block text-[10px] font-normal mt-0.5">관리자 승인 후 이용</span>
            </button>
            <button type="button" onClick={() => setAccountType("TEACHER")}
              className={"card p-3 text-center text-sm font-bold " + (accountType === "TEACHER" ? "!border-2 !border-[#16204a] text-[#16204a]" : "text-slate-400")}>
              🧑‍🏫 선생님
              <span className="block text-[10px] font-normal mt-0.5">승인 후 학생 관리</span>
            </button>
            <button type="button" onClick={() => setAccountType("INDIVIDUAL")}
              className={"card p-3 text-center text-sm font-bold " + (accountType === "INDIVIDUAL" ? "!border-2 !border-[#16204a] text-[#16204a]" : "text-slate-400")}>
              👤 개인 학습
              <span className="block text-[10px] font-normal mt-0.5">즉시 바로 학습</span>
            </button>
          </div>

          <form onSubmit={submit} className="card p-6 space-y-3">
            <Field label="이름">
              <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="홍길동" />
            </Field>
            {accountType !== "TEACHER" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="생년월일">
                    <input className="input" type="date" value={form.birthdate} onChange={(e) => set("birthdate", e.target.value)} />
                  </Field>
                  <Field label="성별">
                    <select className="input" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                      <option value="">선택</option>
                      <option value="M">남</option>
                      <option value="F">여</option>
                      <option value="OTHER">기타</option>
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="학교 (선택)">
                    <input className="input" value={form.school} onChange={(e) => set("school", e.target.value)} placeholder="○○중학교" />
                  </Field>
                  <Field label="학년 (선택)">
                    <input className="input" value={form.grade} onChange={(e) => set("grade", e.target.value)} placeholder="예: 중1" />
                  </Field>
                </div>
              </>
            )}
            {(accountType === "ACADEMY" || accountType === "TEACHER") && (
              <>
                <Field label="학원 선택">
                  <select className="input" value={form.organizationId} onChange={(e) => set("organizationId", e.target.value)}>
                    <option value="">학원을 선택하세요</option>
                    {academies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </Field>
                <Field label={accountType === "TEACHER" ? "연락처 (선택)" : "학부모 연락처 (선택)"}>
                  <input className="input" value={form.parentPhone} onChange={(e) => set("parentPhone", e.target.value)} placeholder="010-0000-0000" />
                </Field>
              </>
            )}
            {accountType === "TEACHER" && (
              <p className="text-[11px] text-slate-400 -mt-1">
                승인되면 관리자 페이지에서 학생을 관리할 수 있어요. (학원 관리·단어장 등 일부 기능은 원장 전용)
              </p>
            )}
            <div className="border-t border-slate-100 pt-3 space-y-3">
              <Field label="아이디">
                <input className="input" value={form.username} onChange={(e) => set("username", e.target.value)} autoCapitalize="none" placeholder="영문/숫자" />
              </Field>
              <Field label="비밀번호">
                <input className="input" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="4자 이상" />
              </Field>
            </div>
            {error && <p className="text-sm text-rose-600 font-semibold shake">{error}</p>}
            <button className="btn-primary w-full py-3" disabled={loading}>
              {loading ? "처리 중..." : accountType === "INDIVIDUAL" ? "가입하고 바로 시작" : "가입 신청"}
            </button>
            <p className="text-center text-xs text-slate-400">
              이미 계정이 있나요? <Link href="/login" className="font-bold text-[#16204a]">로그인</Link>
            </p>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-600 block mb-1">{label}</label>
      {children}
    </div>
  );
}
