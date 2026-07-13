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
};

const DAY_OPTS = [
  ["MON", "월"], ["TUE", "화"], ["WED", "수"], ["THU", "목"],
  ["FRI", "금"], ["SAT", "토"], ["SUN", "일"],
] as const;

// inherit=true → 학생별 오버라이드 모드: "반 설정 따름" 옵션 제공 (null)
export default function SettingsForm({
  initial,
  inherit = false,
  inheritedFrom,
  onSave,
}: {
  initial: Partial<SettingsValues> | null;
  inherit?: boolean;
  inheritedFrom?: Partial<SettingsValues> | null;
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
    if (k === "studyDays") {
      const koMap: Record<string, string> = { MON: "월", TUE: "화", WED: "수", THU: "목", FRI: "금", SAT: "토", SUN: "일" };
      const days = String(val).split(",").filter(Boolean);
      return days.length === 7 ? "매일" : days.map((d) => koMap[d] ?? d).join("·");
    }
    if (typeof val === "boolean") return val ? "사용" : "안 함";
    return val;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* 시험 방식 */}
      <Field label="시험 방식" note={inheritNote("testMode")}>
        <select className="input" value={v.testMode ?? "__inherit"} onChange={(e) => set("testMode", e.target.value === "__inherit" ? null : e.target.value)}>
          {inherit && <option value="__inherit">반 설정 따름</option>}
          <option value="KO_TO_EN">한글 → 영어 타이핑</option>
          <option value="EN_TO_KO">영어 → 한글 타이핑</option>
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
