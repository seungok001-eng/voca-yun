"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import SettingsForm, { type SettingsValues } from "@/components/SettingsForm";

type Detail = {
  id: number; username: string; name: string; className: string | null; classId: number | null;
  parentPhone: string | null; school: string | null; grade: string | null; plainPassword: string | null; birthdate: string | null;
  points: number; streak: number; bestStreak: number;
  overrides: SettingsValues | null;
  effective: SettingsValues;
  accuracy: number | null;
  sessions: {
    id: number; kind: string; mode: string; status: string; attemptNo: number;
    wrongCount: number; cheatCount: number; answered: number; finishedAt: string;
  }[];
  wrongNotes: { word: string; pos: string; meanings: string[]; wrongCount: number; lastWrongAt: string }[];
  resolvedWrongCount: number;
};

const KIND_KO: Record<string, string> = {
  DAILY: "일일시험", RETEST: "재시험", WRONG_NOTE: "오답시험", REVIEW: "복습시험",
};

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState<"record" | "settings" | "wrong" | "account">("record");

  const load = useCallback(() => {
    api<Detail>(`/api/admin/students/${id}`).then(setD);
  }, [id]);
  useEffect(load, [load]);

  if (!d) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          {d.classId && <Link href={`/admin/classes/${d.classId}`} className="text-xs font-bold text-slate-400">← {d.className}</Link>}
          <h1 className="text-xl font-black text-[#16204a]">👨‍🎓 {d.name} <span className="text-sm text-slate-400 font-semibold">({d.username})</span></h1>
          <p className="text-xs text-slate-400">
            정답률 <b className="text-[#16204a]">{d.accuracy !== null ? `${d.accuracy}%` : "-"}</b> ·
            포인트 {d.points.toLocaleString()}P · 🔥 {d.streak}일 (최고 {d.bestStreak}일) ·
            학부모 {d.parentPhone ?? "-"}
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["record", "settings", "wrong", "account"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={"chip !py-2 !px-4 " + (tab === t ? "bg-[#16204a] text-white" : "bg-white border border-slate-200 text-slate-500")}>
              {{ record: "📋 시험 기록", settings: "⚙️ 개별 설정", wrong: `📝 오답노트 (${d.wrongNotes.length})`, account: "🔑 계정" }[t]}
            </button>
          ))}
        </div>
      </div>

      {tab === "record" && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-slate-400 border-b border-slate-100">
                <th className="p-3">일시</th><th className="p-3">종류</th><th className="p-3">결과</th>
                <th className="p-3">오답</th><th className="p-3">이탈 감지</th><th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {d.sessions.map((t) => (
                <tr key={t.id} className="border-b border-slate-50">
                  <td className="p-3 text-slate-500 text-xs">{new Date(t.finishedAt).toLocaleString("ko-KR")}</td>
                  <td className="p-3">{KIND_KO[t.kind]}{t.attemptNo > 1 && ` (${t.attemptNo}차)`}</td>
                  <td className="p-3">
                    {t.status === "PASSED"
                      ? <span className="chip bg-emerald-50 text-emerald-600">통과</span>
                      : <span className="chip bg-rose-50 text-rose-500">탈락</span>}
                  </td>
                  <td className="p-3">{t.wrongCount}개</td>
                  <td className="p-3">{t.cheatCount > 0 ? <span className="chip bg-amber-50 text-amber-600">⚠️ {t.cheatCount}회</span> : <span className="text-slate-300 text-xs">-</span>}</td>
                  <td className="p-3"><Link href={`/admin/results/${t.id}`} className="text-xs font-bold text-indigo-600 hover:underline">답안 보기 →</Link></td>
                </tr>
              ))}
              {d.sessions.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-400">시험 기록이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "settings" && (
        <div className="card p-5">
          <h2 className="font-black text-[#16204a] mb-1">학생 개별 시험 설정</h2>
          <p className="text-xs text-slate-400 mb-4">
            &ldquo;반 설정 따름&rdquo;으로 두면 반 설정이 적용됩니다. 값을 지정하면 이 학생에게만 우선 적용됩니다.
          </p>
          <SettingsForm
            initial={d.overrides}
            inherit
            inheritedFrom={d.effective}
            onSave={async (v) => {
              await api(`/api/admin/students/${id}`, { method: "PATCH", body: JSON.stringify({ overrides: v }) });
              load();
            }}
          />
          <button
            className="btn-ghost text-sm mt-3"
            onClick={async () => {
              await api(`/api/admin/students/${id}`, { method: "PATCH", body: JSON.stringify({ overrides: null }) });
              load();
              alert("개별 설정이 모두 해제되었습니다. 반 설정을 따릅니다.");
            }}
          >
            개별 설정 전체 해제
          </button>
        </div>
      )}

      {tab === "wrong" && (
        <div className="card p-5">
          <h2 className="font-black text-[#16204a] mb-3">오답노트 (미해결 {d.wrongNotes.length} · 해결 {d.resolvedWrongCount})</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {d.wrongNotes.map((n, i) => (
              <li key={i} className="py-2.5 flex items-center gap-3">
                <span className="font-black text-[#16204a] w-32">{n.word}</span>
                <span className="flex-1 text-xs text-slate-400">{n.meanings.join(", ")}</span>
                <span className="chip bg-rose-50 text-rose-500">{n.wrongCount}회</span>
              </li>
            ))}
            {d.wrongNotes.length === 0 && <li className="py-6 text-center text-slate-400">미해결 오답이 없습니다.</li>}
          </ul>
        </div>
      )}

      {tab === "account" && <AccountTab d={d} reload={load} onDeleted={() => router.replace("/admin/classes")} />}
    </div>
  );
}

function AccountTab({ d, reload, onDeleted }: { d: Detail; reload: () => void; onDeleted: () => void }) {
  const [name, setName] = useState(d.name);
  const [parentPhone, setParentPhone] = useState(d.parentPhone ?? "");
  const [school, setSchool] = useState(d.school ?? "");
  const [grade, setGrade] = useState(d.grade ?? "");
  const [password, setPassword] = useState("");

  return (
    <div className="card p-5 max-w-md space-y-3">
      <h2 className="font-black text-[#16204a]">계정 관리</h2>
      <div>
        <label className="text-xs font-bold text-slate-600 block mb-1">이름</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">학교</label>
          <input className="input" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="○○중학교" />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600 block mb-1">학년</label>
          <input className="input" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="예: 중1" />
        </div>
      </div>
      <div>
        <label className="text-xs font-bold text-slate-600 block mb-1">학부모 연락처 (알림 발송용)</label>
        <input className="input" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="010-0000-0000" />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-600 block mb-1">
          비밀번호 재설정 (비우면 유지){d.plainPassword && <span className="text-slate-400 font-normal"> · 현재: {d.plainPassword}</span>}
        </label>
        <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="새 비밀번호" />
      </div>
      <button
        className="btn-primary w-full"
        onClick={async () => {
          await api(`/api/admin/students/${d.id}`, {
            method: "PATCH",
            body: JSON.stringify({ name, parentPhone, school, grade, ...(password ? { password } : {}) }),
          });
          setPassword("");
          reload();
          alert("저장되었습니다.");
        }}
      >
        저장
      </button>
      <button
        className="btn-ghost w-full !border-rose-200 !text-rose-500"
        onClick={async () => {
          if (!confirm(`${d.name} 학생 계정을 삭제할까요? 모든 학습 기록이 사라집니다.`)) return;
          await api(`/api/admin/students/${d.id}`, { method: "DELETE" });
          onDeleted();
        }}
      >
        학생 계정 삭제
      </button>
    </div>
  );
}
