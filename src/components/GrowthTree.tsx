"use client";

// 자라는 나무 — 외운 단어가 늘수록 자란다 (씨앗 → 새싹 → 어린 나무 → 나무 → 열매 나무)
// stage 0~4, progress 0~1 은 다음 단계까지의 진행률

export const TREE_STAGES = [
  { name: "씨앗", need: 0 },
  { name: "새싹", need: 30 },
  { name: "어린 나무", need: 150 },
  { name: "나무", need: 500 },
  { name: "열매 나무", need: 1500 },
];

export function treeStage(words: number): { stage: number; progress: number; next: number | null } {
  let stage = 0;
  for (let i = 0; i < TREE_STAGES.length; i++) if (words >= TREE_STAGES[i].need) stage = i;
  const cur = TREE_STAGES[stage].need;
  const next = TREE_STAGES[stage + 1]?.need ?? null;
  const progress = next ? Math.min(1, (words - cur) / (next - cur)) : 1;
  return { stage, progress, next };
}

export default function GrowthTree({ words, size = 140, className = "" }: { words: number; size?: number; className?: string }) {
  const { stage } = treeStage(words);
  const trunk = "#8b5a2b", trunk2 = "#6b4423";
  const leaf = "#4ade80", leaf2 = "#22c55e", leaf3 = "#16a34a";
  const soil = "#a16207";

  return (
    <svg viewBox="0 0 140 140" width={size} height={size} className={className} aria-hidden>
      {/* 땅 */}
      <ellipse cx="70" cy="124" rx="52" ry="10" fill={soil} opacity="0.85" />
      <ellipse cx="70" cy="122" rx="44" ry="7" fill="#ca8a04" opacity="0.6" />

      {stage === 0 && (
        <g className="tree-sway">
          <ellipse cx="70" cy="114" rx="9" ry="7" fill="#d9a066" stroke="#a16207" strokeWidth="2" />
          <path d="M70 108 q0 -8 6 -12" stroke={leaf2} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M76 96 q-6 0 -8 6 q6 0 8 -6z" fill={leaf} />
        </g>
      )}
      {stage === 1 && (
        <g className="tree-sway">
          <path d="M70 120 v-26" stroke={leaf3} strokeWidth="5" strokeLinecap="round" />
          <path d="M70 100 q-4 -18 -22 -20 q2 18 22 20z" fill={leaf} stroke={leaf2} strokeWidth="2" />
          <path d="M70 94 q4 -18 22 -20 q-2 18 -22 20z" fill={leaf} stroke={leaf2} strokeWidth="2" />
          <path d="M70 106 q-3 -10 -12 -12 q1 10 12 12z" fill={leaf} stroke={leaf2} strokeWidth="1.5" />
        </g>
      )}
      {stage === 2 && (
        <g className="tree-sway">
          <path d="M70 122 v-40" stroke={trunk} strokeWidth="8" strokeLinecap="round" />
          <path d="M70 100 l-12 -12 M70 92 l12 -12" stroke={trunk} strokeWidth="5" strokeLinecap="round" />
          <circle cx="70" cy="66" r="22" fill={leaf} />
          <circle cx="54" cy="80" r="14" fill={leaf2} />
          <circle cx="86" cy="78" r="14" fill={leaf2} />
          <circle cx="66" cy="60" r="8" fill="#86efac" opacity="0.7" />
        </g>
      )}
      {stage === 3 && (
        <g className="tree-sway">
          <path d="M70 124 v-50" stroke={trunk} strokeWidth="11" strokeLinecap="round" />
          <path d="M70 98 l-18 -16 M70 88 l18 -16 M70 80 l-10 -12" stroke={trunk2} strokeWidth="6" strokeLinecap="round" />
          <circle cx="70" cy="50" r="28" fill={leaf} />
          <circle cx="44" cy="70" r="20" fill={leaf2} />
          <circle cx="96" cy="68" r="20" fill={leaf2} />
          <circle cx="70" cy="76" r="18" fill={leaf3} opacity="0.85" />
          <circle cx="62" cy="42" r="10" fill="#86efac" opacity="0.7" />
        </g>
      )}
      {stage === 4 && (
        <g className="tree-sway">
          <path d="M70 124 v-54" stroke={trunk} strokeWidth="13" strokeLinecap="round" />
          <path d="M70 96 l-22 -18 M70 86 l22 -18 M70 78 l-12 -14 M70 72 l12 -14" stroke={trunk2} strokeWidth="6" strokeLinecap="round" />
          <circle cx="70" cy="46" r="32" fill={leaf} />
          <circle cx="40" cy="68" r="22" fill={leaf2} />
          <circle cx="100" cy="66" r="22" fill={leaf2} />
          <circle cx="70" cy="76" r="20" fill={leaf3} opacity="0.85" />
          <circle cx="60" cy="38" r="12" fill="#86efac" opacity="0.7" />
          {/* 열매 */}
          {[[52, 56], [84, 50], [70, 66], [44, 78], [96, 80], [64, 88]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="5" fill="#f43f5e" stroke="#be123c" strokeWidth="1.5" />
          ))}
          {/* 꽃 */}
          {[[36, 58], [104, 54], [76, 30]].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="3.5" fill="#fde68a" />
              <circle cx={x - 3} cy={y} r="2" fill="#fff" /><circle cx={x + 3} cy={y} r="2" fill="#fff" />
              <circle cx={x} cy={y - 3} r="2" fill="#fff" /><circle cx={x} cy={y + 3} r="2" fill="#fff" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
