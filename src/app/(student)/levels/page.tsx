"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

type L = {
  id: number; order: number; name: string; nameKo: string; groupName: string;
  groupKo: string; description: string | null; wordCount: number;
};

const GROUP_EMOJI: Record<string, string> = {
  Seed: "🌰", Sprout: "🌱", Tree: "🌳", Forest: "🌲", Summit: "🏔️",
};

export default function LevelsPage() {
  const [data, setData] = useState<{ levels: L[]; currentLevelId: number | null; cursor: number; isIndividual: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  function load() {
    api<{ levels: L[]; currentLevelId: number | null; cursor: number; isIndividual: boolean }>("/api/student/levels").then(setData);
  }
  useEffect(load, []);

  if (!data) return <p className="text-slate-400 text-center py-20">불러오는 중...</p>;

  const groups = [...new Set(data.levels.map((l) => l.groupName))];

  async function pick(l: L) {
    if (!data!.isIndividual || busy) return;
    if (l.id !== data!.currentLevelId && !confirm(`${l.nameKo} (Lv.${l.order})로 학습을 시작할까요?`)) return;
    const input = prompt(`몇 번 단어부터 시작할까요? (1 ~ ${l.wordCount})`, "1");
    if (input === null) return;
    setBusy(true);
    try {
      await api("/api/student/self-assign", {
        method: "POST",
        body: JSON.stringify({ levelId: l.id, startNumber: Number(input) || 1 }),
      });
      router.push("/home");
    } catch (e) {
      alert(e instanceof Error ? e.message : "레벨 선택 실패");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-black text-[#16204a]">🗺️ 레벨 지도</h1>
        <p className="text-xs text-slate-400 mt-1">
          {data.isIndividual
            ? "학습할 레벨을 직접 선택하세요. 파닉스부터 수능 만점까지 20단계."
            : "파닉스부터 수능 만점까지 — 20단계 성장 여정"}
        </p>
      </div>
      {groups.map((g) => {
        const levels = data.levels.filter((l) => l.groupName === g);
        const first = levels[0];
        return (
          <section key={g}>
            <h2 className="font-black text-sm text-slate-600 mb-2">
              {GROUP_EMOJI[g]} {first.groupKo} <span className="text-slate-300 font-semibold">— {first.description}</span>
            </h2>
            <div className="grid grid-cols-4 gap-2">
              {levels.map((l) => {
                const isCurrent = l.id === data.currentLevelId;
                return (
                  <button
                    key={l.id}
                    onClick={() => pick(l)}
                    disabled={!data.isIndividual}
                    className={
                      "card p-3 text-center transition-all " +
                      (isCurrent ? "!border-2 !border-[#c9a227] !shadow-lg " : "") +
                      (data.isIndividual ? "hover:!border-[#c9a227] cursor-pointer" : "cursor-default")
                    }
                  >
                    <p className="text-[10px] font-bold text-slate-400">Lv.{l.order}</p>
                    <p className="text-sm font-black text-[#16204a]">{l.name}</p>
                    <p className="text-[10px] text-slate-400">{l.wordCount}단어</p>
                    {isCurrent && <p className="text-[10px] font-black text-[#c9a227] mt-1">진행 중 ⭐</p>}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {data.isIndividual && (
        <p className="text-center text-xs text-slate-400">레벨을 누르면 해당 레벨로 학습이 시작됩니다.</p>
      )}
    </div>
  );
}
