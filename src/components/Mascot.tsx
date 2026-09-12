"use client";

// 새싹이 — 정철 VOCA 마스코트 (SVG). 기분에 따라 표정이 바뀐다.
//  happy  기본 미소        cheer  통과·축하 (별눈, 팔 번쩍)
//  sad    틀렸을 때        worried 스트릭 위기 · 밀린 학습
//  sleepy 쉬는 날          think  공부 중

export type Mood = "happy" | "cheer" | "sad" | "worried" | "sleepy" | "think";

export default function Mascot({ mood = "happy", size = 120, className = "", bounce = false }: {
  mood?: Mood; size?: number; className?: string; bounce?: boolean;
}) {
  const body = "#c7ef9a";      // 연두 몸통
  const body2 = "#9fd96b";     // 그림자
  const leaf = "#4ade80";
  const leaf2 = "#22c55e";
  const cheek = "#fca5a5";
  const ink = "#1f2937";

  const eyes = (() => {
    switch (mood) {
      case "cheer":
        return (
          <>
            <path d="M40 54 l4 -9 l4 9 l-9 -6 h10 z" fill={ink} />
            <path d="M76 54 l4 -9 l4 9 l-9 -6 h10 z" fill={ink} />
          </>
        );
      case "sad":
        return (
          <>
            <ellipse cx="44" cy="54" rx="5" ry="6" fill={ink} /><circle cx="46" cy="52" r="1.6" fill="#fff" />
            <ellipse cx="80" cy="54" rx="5" ry="6" fill={ink} /><circle cx="82" cy="52" r="1.6" fill="#fff" />
            <path d="M36 44 q8 4 14 2" stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M88 44 q-8 4 -14 2" stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M84 62 q3 8 0 12" stroke="#60a5fa" strokeWidth="3" fill="none" strokeLinecap="round" />
          </>
        );
      case "worried":
        return (
          <>
            <ellipse cx="44" cy="55" rx="5.5" ry="6.5" fill={ink} /><circle cx="46" cy="53" r="1.8" fill="#fff" />
            <ellipse cx="80" cy="55" rx="5.5" ry="6.5" fill={ink} /><circle cx="82" cy="53" r="1.8" fill="#fff" />
            <path d="M36 43 q8 -2 14 3" stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M88 43 q-8 -2 -14 3" stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </>
        );
      case "sleepy":
        return (
          <>
            <path d="M37 55 q7 5 14 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M73 55 q7 5 14 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
            <text x="96" y="30" fontSize="13" fontWeight="900" fill={ink} opacity="0.7">z</text>
            <text x="104" y="20" fontSize="10" fontWeight="900" fill={ink} opacity="0.5">z</text>
          </>
        );
      case "think":
        return (
          <>
            <ellipse cx="44" cy="55" rx="5.5" ry="6.5" fill={ink} /><circle cx="46" cy="53" r="1.8" fill="#fff" />
            <ellipse cx="80" cy="55" rx="5.5" ry="6.5" fill={ink} /><circle cx="82" cy="53" r="1.8" fill="#fff" />
            <path d="M72 42 q8 -4 16 1" stroke={ink} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </>
        );
      default:
        return (
          <>
            <ellipse cx="44" cy="55" rx="5.5" ry="6.5" fill={ink} /><circle cx="46.5" cy="52.5" r="2" fill="#fff" />
            <ellipse cx="80" cy="55" rx="5.5" ry="6.5" fill={ink} /><circle cx="82.5" cy="52.5" r="2" fill="#fff" />
          </>
        );
    }
  })();

  const mouth = (() => {
    switch (mood) {
      case "cheer": return <path d="M50 70 q12 14 24 0 z" fill="#ef4444" stroke={ink} strokeWidth="2" strokeLinejoin="round" />;
      case "sad": return <path d="M52 76 q10 -8 20 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />;
      case "worried": return <path d="M52 73 q5 -4 10 0 t10 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />;
      case "sleepy": return <ellipse cx="62" cy="73" rx="4" ry="3" fill={ink} opacity="0.8" />;
      case "think": return <path d="M54 73 h16" stroke={ink} strokeWidth="3" strokeLinecap="round" />;
      default: return <path d="M52 70 q10 10 20 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />;
    }
  })();

  const arms = mood === "cheer"
    ? (
      <>
        <path d="M22 62 q-14 -14 -8 -28" stroke={body2} strokeWidth="9" fill="none" strokeLinecap="round" />
        <path d="M102 62 q14 -14 8 -28" stroke={body2} strokeWidth="9" fill="none" strokeLinecap="round" />
        <circle cx="14" cy="34" r="6" fill={body} stroke={body2} strokeWidth="2" />
        <circle cx="110" cy="34" r="6" fill={body} stroke={body2} strokeWidth="2" />
      </>
    ) : (
      <>
        <path d="M22 66 q-10 6 -8 16" stroke={body2} strokeWidth="9" fill="none" strokeLinecap="round" />
        <path d="M102 66 q10 6 8 16" stroke={body2} strokeWidth="9" fill="none" strokeLinecap="round" />
      </>
    );

  return (
    <svg viewBox="0 0 124 124" width={size} height={size} className={(bounce ? "mascot-bounce " : "") + className} aria-hidden>
      {/* 잎 */}
      <g className={mood === "cheer" ? "leaf-wiggle" : ""}>
        <path d="M62 30 q-2 -18 -20 -20 q2 18 20 20z" fill={leaf} stroke={leaf2} strokeWidth="2" strokeLinejoin="round" />
        <path d="M62 30 q2 -18 20 -20 q-2 18 -20 20z" fill={leaf} stroke={leaf2} strokeWidth="2" strokeLinejoin="round" />
        <path d="M62 30 v-6" stroke={leaf2} strokeWidth="3" strokeLinecap="round" />
      </g>
      {/* 팔 */}
      {arms}
      {/* 몸 */}
      <ellipse cx="62" cy="76" rx="42" ry="40" fill={body} stroke={body2} strokeWidth="3" />
      <ellipse cx="62" cy="96" rx="30" ry="14" fill={body2} opacity="0.35" />
      {/* 볼 */}
      <ellipse cx="34" cy="66" rx="6" ry="4" fill={cheek} opacity="0.8" />
      <ellipse cx="90" cy="66" rx="6" ry="4" fill={cheek} opacity="0.8" />
      {eyes}
      {mouth}
      {/* 발 */}
      <ellipse cx="46" cy="114" rx="11" ry="5" fill={body2} />
      <ellipse cx="78" cy="114" rx="11" ry="5" fill={body2} />
    </svg>
  );
}
