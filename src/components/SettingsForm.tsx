"use client";

import { useState } from "react";

export type SettingsValues = {
  testMode: string | null;
  dailyWordCount: number | null;
  failThreshold: number | null;
  retestScope: string | null;
  posStrict: boolean | null;
  pronEnabled: boolean | null;
  pronThreshold: number | null;
  reviewMixCount: number | null;
  studyDays: string | null; // "MON,TUE,..." (null=반 설정 따름)
  speakMatchRate: number | null; // 말하기 문장 일치율 커트라인 (%)
  speakPassCount: number | null; // 통과에 필요한 문장 수 (0/빈칸 = 전체)
  courseTrack: string | null; // BASIC | ADVANCED
  program: string | null; // VOCA | TEXTBOOK
};

// 교재 과정 설정 옆에 보여줄 레슨별 문장 수 (선생님이 통과 기준을 정할 때 참고)
export type LessonStat = { name: string; a: number; b: number; n: number };

const DAY_OPTS = [
  ["MON", "월"], ["TUE", "화"], ["WED", "수"], ["THU", "목"],
  ["FRI", "금"], ["SAT", "토"], ["SUN", "일"],
] as const;

// inherit=true → 학생별 오버라이드 모드: "반 설정 따름" 옵션 제공 (null)
export default function SettingsForm({
  initial,
  inherit = false,
  inheritedFrom,
  lessonStats,
  onSave,
}: {
  initial: Partial<SettingsValues> | null;
  inherit?: boolean;
  inheritedFrom?: Partial<SettingsValues> | null;
  lessonStats?: LessonStat[];
  onSave: (v: SettingsValues) => Promise<void>;
}) {
  const [v, setV] = useState<SettingsValues>({
    testMode: initial?.testMode ?? (inherit ? null : "MIXED"),
    dailyWordCount: initial?.dailyWordCount ?? (inherit ? null : 30),
    failThreshold: initial?.failThreshold ?? (inherit ? null : 3),
    retestScope: initial?.retestScope ?? (inherit ? null : "ALL"),
    posStrict: initial?.posStrict ?? (inherit ? null : true),
    pronEnabled: initial?.pronEnabled ?? (inherit ? null : false),
    pronThreshold: initial?.pronThreshold ?? (inherit ? null : 60),
    reviewMixCount: initial?.reviewMixCount ?? (inherit ? null : 5),
    studyDays: initial?.studyDays ?? (inherit ? null : "MON,TUE,WED,THU,FRI,SAT,SUN"),
    speakMatchRate: initial?.speakMatchRate ?? (inherit ? null : 70),
    speakPassCount: initial?.speakPassCount ?? (inherit ? null : 0),
    courseTrack: initial?.courseTrack ?? (inherit ? null : "BASIC"),
    program: initial?.program ?? (inherit ? null : "VOCA"),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (k: keyof SettingsValues, val: SettingsValues[keyof SettingsValues]) => {
    setV((p) => ({ ...p, [k]: val }));
    setSaved(false);
  };

  const inheritNote = (k: keyof SettingsValues) =>
    inherit && v[k] === null && inheritedFrom ? (
      <span className="text-[10px] text-slate-400 ml-1">
        (반 설정: {String(fmt(k, inheritedFrom[k]))})
      </span>
    ) : null;

  function fmt(k: string, val: unknown) {
    if (val === null || val === undefined) return "-";
    if (k === "testMode") return { KO_TO_EN: "한→영", EN_TO_KO: "영→한", MIXED: "혼합" }[val as string] ?? val;
    if (k === "retestScope") return { ALL: "전체", WRONG_ONLY: "틀린 것만" }[val as string] ?? val;
    if (k === "program") return { VOCA: "VOCA 과정", TEXTBOOK: "교재 과정" }[val as string] ?? val;
    if (k === "courseTrack") return { BASIC: "기본반", ADVANCED: "심화반" }[val as string] ?? val;
    if (k === "speakPassCount") return Number(val) === 0 ? "전체 문장" : `${val}문장`;
    if (k === "studyDays") {
      const koMap: Record<string, string> = { MON: "월", TUE: "화", WED: "수", THU: "목", FRI: "금", SAT: "토", SUN: "일" };
      const days = String(val).split(",").filter(Boolean);
      return days.length === 7 ? "매일" : days.map((d) => koMap[d] ?? d).join("·");
    }
    if (typeof val === "boolean") return val ? "사용" : "안 함";
    return val;
  }

  // 교재 과정 설정은 VOCA 과정만 쓰는 반/학생에게는 접어둔다
  const usesTextbook = v.program === "TEXTBOOK" || (v.program === null && inheritedFrom?.program === "TEXTBOOK");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* 학습 프로그램(가닥) — 가장 먼저 정한다 */}
      <div className="sm:col-span-2 rounded-2xl border-2 border-[#c9a227]/40 bg-[#fdfaf0] p-4">
        <label className="text-xs font-bold text-slate-600 block mb-1.5">
          📚 학습 프로그램{inheritNote("program")}
        </label>
        <select className="input" value={v.program ?? "__inherit"}
          onChange={(e) => set("program", e.target.value === "__inherit" ? null : e.target.value)}>
          {inherit && <option value="__inherit">반 설정 따름</option>}
          <option value="VOCA">VOCA 과정 — 초등~수능 단어장 (20단계)</option>
          <option value="TEXTBOOK">교재 과정 — 정철 교재 (SKY / PLANET)</option>
        </select>
        <p className="text-[11px] text-slate-400 mt-1.5">
          어떤 과정으로 학습할지 먼저 정합니다. 과정 안의 단계·진도는 반 관리에서 배정합니다.
        </p>
      </div>

      {/* 시험 방식 */}
      <Field label="시험 방식" note={inheritNote("testMode")}>
        <select className="input" value={v.testMode ?? "__inherit"} onChange={(e) => set("testMode", e.target.value === "__inherit" ? null : e.target.value)}>
          {inherit && <option value="__inherit">반 설정 따름</option>}
          <option value="KO_TO_EN">한글 → 영어 타이핑</option>
          <option value="EN_TO_KO">영어 → 한글 4지선다</option>
          <option value="MIXED">혼합 (랜덤)</option>
        </select>
      </Field>

      {/* 하루 단어 수 */}
      <Field label="하루 목표 단어 수" note={inheritNote("dailyWordCount")}>
        <NumInput value={v.dailyWordCount} inherit={inherit} min={5} max={200}
          onChange={(n) => set("dailyWordCount", n)} placeholder="예: 30" />
      </Field>

      {/* 탈락 기준 */}
      <Field label="탈락 기준 (이 개수 이상 틀리면 재시험)" note={inheritNote("failThreshold")}>
        <NumInput value={v.failThreshold} inherit={inherit} min={1} max={50}
          onChange={(n) => set("failThreshold", n)} placeholder="예: 3" />
      </Field>

      {/* 재시험 범위 */}
      <Field label="재시험 범위" note={inheritNote("retestScope")}>
        <select className="input" value={v.retestScope ?? "__inherit"} onChange={(e) => set("retestScope", e.target.value === "__inherit" ? null : e.target.value)}>
          {inherit && <option value="__inherit">반 설정 따름</option>}
          <option value="ALL">전체 재시험 (순서 랜덤)</option>
          <option value="WRONG_ONLY">틀린 단어만 재시험</option>
        </select>
      </Field>

      {/* 품사 엄격 채점 */}
      <Field label="품사 엄격 채점 (조사·어미까지 정확히)" note={inheritNote("posStrict")}>
        <TriState value={v.posStrict} inherit={inherit} onChange={(b) => set("posStrict", b)}
          onLabel="엄격 (거대한 ≠ 거대하다)" offLabel="관대 (어간만 맞으면 정답)" />
      </Field>

      {/* 발음 평가 */}
      <Field label="발음 평가 사용" note={inheritNote("pronEnabled")}>
        <TriState value={v.pronEnabled} inherit={inherit} onChange={(b) => set("pronEnabled", b)}
          onLabel="사용 (정답 후 발음 테스트)" offLabel="사용 안 함" />
      </Field>

      {/* 발음 커트라인 */}
      <Field label="발음 정확도 커트라인 (0~100점)" note={inheritNote("pronThreshold")}>
        <NumInput value={v.pronThreshold} inherit={inherit} min={0} max={100}
          onChange={(n) => set("pronThreshold", n)} placeholder="예: 60" />
      </Field>

      {/* 복습 섞기 */}
      <Field label="시험에 섞을 누적복습 단어 수" note={inheritNote("reviewMixCount")}>
        <NumInput value={v.reviewMixCount} inherit={inherit} min={0} max={30}
          onChange={(n) => set("reviewMixCount", n)} placeholder="예: 5" />
      </Field>

      {/* 학습 요일 */}
      <div className="sm:col-span-2">
        <label className="text-xs font-bold text-slate-600 block mb-1.5">
          학습 요일 (선택한 요일에만 숙제·시험이 나갑니다){inheritNote("studyDays")}
        </label>
        {inherit && (
          <label className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <input type="checkbox" checked={v.studyDays === null}
              onChange={(e) => set("studyDays", e.target.checked ? null : "MON,TUE,WED,THU,FRI,SAT,SUN")} />
            반 설정 따름
          </label>
        )}
        {v.studyDays !== null && (
          <div className="flex flex-wrap gap-1.5">
            {DAY_OPTS.map(([code, ko]) => {
              const days = new Set((v.studyDays ?? "").split(",").filter(Boolean));
              const on = days.has(code);
              return (
                <button key={code} type="button"
                  onClick={() => {
                    const next = new Set(days);
                    if (on) next.delete(code); else next.add(code);
                    if (next.size === 0) return; // 최소 1일
                    set("studyDays", DAY_OPTS.map(([c]) => c).filter((c) => next.has(c)).join(","));
                  }}
                  className={"chip !py-2 !px-4 " + (on
                    ? (code === "SAT" ? "bg-blue-600 text-white" : code === "SUN" ? "bg-rose-500 text-white" : "bg-[#16204a] text-white")
                    : "bg-white border border-slate-200 text-slate-400")}>
                  {ko}
                </button>
              );
            })}
            <button type="button" className="chip !py-2 !px-3 bg-slate-100 text-slate-500"
              onClick={() => set("studyDays", "MON,TUE,WED,THU,FRI")}>평일만</button>
            <button type="button" className="chip !py-2 !px-3 bg-slate-100 text-slate-500"
              onClick={() => set("studyDays", "MON,TUE,WED,THU,FRI,SAT,SUN")}>매일</button>
          </div>
        )}
      </div>

      {/* 교재 과정 전용 설정 */}
      {usesTextbook && (
        <div className="sm:col-span-2 rounded-2xl border border-slate-200 p-4 grid gap-4 sm:grid-cols-2">
          <p className="sm:col-span-2 font-black text-[#16204a] text-sm">🗣️ 교재 과정 (말하기·리딩) 설정</p>

          <Field label="반 과정" note={inheritNote("courseTrack")}>
            <select className="input" value={v.courseTrack ?? "__inherit"}
              onChange={(e) => set("courseTrack", e.target.value === "__inherit" ? null : e.target.value)}>
              {inherit && <option value="__inherit">반 설정 따름</option>}
              <option value="BASIC">기본반 — 레슨당 단어 6~10개</option>
              <option value="ADVANCED">심화반 — 레슨당 단어 16개 (기본 + 추가)</option>
            </select>
          </Field>

          <Field label="문장 통과 기준 (일치율 %)" note={inheritNote("speakMatchRate")}>
            <NumInput value={v.speakMatchRate} inherit={inherit} min={30} max={100}
              onChange={(n) => set("speakMatchRate", n)} placeholder="예: 70" />
          </Field>

          <div className="sm:col-span-2">
            <label className="text-xs font-bold text-slate-600 block mb-1.5">
              통과에 필요한 문장 수 (0 = 전체 문장){inheritNote("speakPassCount")}
            </label>
            <NumInput value={v.speakPassCount} inherit={inherit} min={0} max={100}
              onChange={(n) => set("speakPassCount", n)} placeholder="예: 12 (0이면 전체)" />
            {lessonStats && lessonStats.length > 0 && (
              <div className="mt-2 rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] font-bold text-slate-500 mb-1.5">레슨별 문장 수 (역할마다 이만큼 말합니다)</p>
                <div className="overflow-x-auto">
                  <table className="text-[11px] w-full">
                    <thead>
                      <tr className="text-slate-400 text-left">
                        <th className="pr-3 pb-1">레슨</th><th className="pr-3 pb-1">A 역</th>
                        <th className="pr-3 pb-1">B 역</th><th className="pb-1">본문 읽기</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lessonStats.map((s, i) => (
                        <tr key={i} className="text-slate-600">
                          <td className="pr-3 py-0.5">{s.name}</td>
                          <td className="pr-3 py-0.5 font-bold">{s.a || "-"}</td>
                          <td className="pr-3 py-0.5 font-bold">{s.b || "-"}</td>
                          <td className="py-0.5 font-bold">{s.n || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  예) A 역이 8문장인 레슨에서 &ldquo;6&rdquo;으로 두면 8문장 중 6문장을 통과해야 합니다.
                  레슨 문장 수보다 크게 넣으면 전체를 통과해야 합니다.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          className="btn-primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(v);
              setSaved(true);
            } catch (e) {
              alert(e instanceof Error ? e.message : "저장 실패");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "저장 중..." : "설정 저장"}
        </button>
        {saved && <span className="text-sm font-bold text-emerald-600 pop-in">✓ 저장되었습니다</span>}
      </div>
    </div>
  );
}

function Field({ label, note, children }: { label: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-600 block mb-1.5">{label}{note}</label>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, inherit, min, max, placeholder }: {
  value: number | null; onChange: (n: number | null) => void; inherit: boolean;
  min: number; max: number; placeholder?: string;
}) {
  return (
    <div className="flex gap-2">
      <input
        type="number" className="input" min={min} max={max} placeholder={inherit ? "반 설정 따름" : placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Math.min(max, Math.max(min, Number(e.target.value))))}
      />
    </div>
  );
}

function TriState({ value, onChange, inherit, onLabel, offLabel }: {
  value: boolean | null; onChange: (b: boolean | null) => void; inherit: boolean;
  onLabel: string; offLabel: string;
}) {
  return (
    <select
      className="input"
      value={value === null ? "__inherit" : value ? "on" : "off"}
      onChange={(e) => onChange(e.target.value === "__inherit" ? null : e.target.value === "on")}
    >
      {inherit && <option value="__inherit">반 설정 따름</option>}
      <option value="on">{onLabel}</option>
      <option value="off">{offLabel}</option>
    </select>
  );
}
