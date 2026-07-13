"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

type C = { id: number; name: string; studentCount: number };
type Student = { id: number; name: string };

export default function ReportsPage() {
  const [classes, setClasses] = useState<C[]>([]);
  const [classId, setClassId] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);

  useEffect(() => {
    api<{ classes: C[] }>("/api/admin/classes").then((r) => setClasses(r.classes));
  }, []);

  useEffect(() => {
    if (!classId) { setStudents([]); return; }
    api<{ students: Student[] }>(`/api/admin/classes/${classId}`).then((r) => setStudents(r.students));
  }, [classId]);

  const q = classId ? `?classId=${classId}` : "";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black text-[#16204a]">📄 리포트</h1>
        <p className="text-xs text-slate-400 mt-1">성적·오답 데이터를 엑셀(CSV)로 내려받거나, 학생별 리포트를 인쇄·PDF로 저장하세요.</p>
      </div>

      <div className="card p-5 space-y-3">
        <label className="text-xs font-bold text-slate-600 block">반 선택 (미선택 시 전체)</label>
        <select className="input max-w-xs" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">전체 반</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.studentCount}명)</option>)}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-black text-[#16204a] mb-1">📊 성적 리포트 (CSV)</h2>
          <p className="text-xs text-slate-400 mb-3">학생별 통과/탈락 횟수, 정답률, 포인트, 학부모 연락처를 엑셀로 내려받습니다.</p>
          <a href={`/api/admin/reports/grades${q}`} className="btn-primary inline-block text-sm">⬇ 성적 CSV 다운로드</a>
        </div>
        <div className="card p-5">
          <h2 className="font-black text-[#16204a] mb-1">📝 오답 리포트 (CSV)</h2>
          <p className="text-xs text-slate-400 mb-3">학생별 미해결 오답 단어와 틀린 횟수를 엑셀로 내려받습니다.</p>
          <a href={`/api/admin/reports/wrong-notes${q}`} className="btn-primary inline-block text-sm">⬇ 오답 CSV 다운로드</a>
        </div>
      </div>

      {classId && (
        <div className="card p-5">
          <h2 className="font-black text-[#16204a] mb-1">🖨️ 학생별 상담 리포트 (인쇄·PDF)</h2>
          <p className="text-xs text-slate-400 mb-3">학생을 선택하면 인쇄용 리포트가 열립니다. 브라우저 인쇄에서 &ldquo;PDF로 저장&rdquo;을 고르면 상담용 PDF가 됩니다.</p>
          <div className="flex flex-wrap gap-2">
            {students.map((st) => (
              <Link key={st.id} href={`/admin/reports/${st.id}`} target="_blank"
                className="chip bg-white border border-slate-200 text-slate-600 hover:!border-[#c9a227] !py-2 !px-3">
                {st.name} 리포트 →
              </Link>
            ))}
            {students.length === 0 && <p className="text-sm text-slate-400">이 반에 학생이 없습니다.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
