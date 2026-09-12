// 뱃지 — 학생의 기록에서 계산한다 (별도 저장 없이 그때그때 판정)
import { db } from "./db";

export type BadgeDef = { id: string; name: string; desc: string; emoji: string; group: string };
export type BadgeStats = {
  passed: number;        // 통과한 단어 시험 수
  perfect: number;       // 오답 0으로 통과한 시험 수
  words: number;         // 외운 단어 수 (통과 시험의 정답 수)
  streak: number; bestStreak: number; points: number;
  speakPassed: number;   // 통과한 말하기 시험 수
  reviewPassed: number; wrongNotePassed: number;
  earlyBird: boolean; nightOwl: boolean; weekend: boolean;
  pronPerfect: boolean;  // 발음 100점
  streakBadges: number;  // 연속통과 뱃지 수
  daysActive: number;    // 시험 본 날 수
};

export const BADGES: (BadgeDef & { check: (s: BadgeStats) => boolean })[] = [
  { id: "first", name: "첫걸음", desc: "첫 단어 시험 통과", emoji: "🌱", group: "시작", check: (s) => s.passed >= 1 },
  { id: "pass10", name: "열 번의 승리", desc: "단어 시험 10번 통과", emoji: "🔟", group: "시험", check: (s) => s.passed >= 10 },
  { id: "pass50", name: "50번 통과", desc: "단어 시험 50번 통과", emoji: "🏅", group: "시험", check: (s) => s.passed >= 50 },
  { id: "pass100", name: "백전백승", desc: "단어 시험 100번 통과", emoji: "🏆", group: "시험", check: (s) => s.passed >= 100 },
  { id: "perfect1", name: "만점!", desc: "오답 0개로 통과", emoji: "💯", group: "시험", check: (s) => s.perfect >= 1 },
  { id: "perfect10", name: "만점 수집가", desc: "만점 통과 10번", emoji: "🌟", group: "시험", check: (s) => s.perfect >= 10 },
  { id: "words100", name: "단어 100", desc: "단어 100개 정복", emoji: "📗", group: "단어", check: (s) => s.words >= 100 },
  { id: "words500", name: "단어 500", desc: "단어 500개 정복", emoji: "📘", group: "단어", check: (s) => s.words >= 500 },
  { id: "words1000", name: "단어 1000", desc: "단어 1,000개 정복", emoji: "📙", group: "단어", check: (s) => s.words >= 1000 },
  { id: "words3000", name: "단어 3000", desc: "단어 3,000개 정복", emoji: "📚", group: "단어", check: (s) => s.words >= 3000 },
  { id: "streak3", name: "3일 연속", desc: "3일 연속 통과", emoji: "🔥", group: "꾸준함", check: (s) => s.bestStreak >= 3 },
  { id: "streak7", name: "일주일 연속", desc: "7일 연속 통과", emoji: "🔥", group: "꾸준함", check: (s) => s.bestStreak >= 7 },
  { id: "streak30", name: "한 달 연속", desc: "30일 연속 통과", emoji: "☄️", group: "꾸준함", check: (s) => s.bestStreak >= 30 },
  { id: "days30", name: "30일 출석", desc: "시험 본 날 30일", emoji: "📅", group: "꾸준함", check: (s) => s.daysActive >= 30 },
  { id: "points1000", name: "1,000P", desc: "포인트 1,000 달성", emoji: "🪙", group: "포인트", check: (s) => s.points >= 1000 },
  { id: "points5000", name: "5,000P", desc: "포인트 5,000 달성", emoji: "💰", group: "포인트", check: (s) => s.points >= 5000 },
  { id: "points20000", name: "2만 포인트", desc: "포인트 20,000 달성", emoji: "💎", group: "포인트", check: (s) => s.points >= 20000 },
  { id: "speak1", name: "첫 말하기", desc: "말하기 시험 첫 통과", emoji: "🎤", group: "말하기", check: (s) => s.speakPassed >= 1 },
  { id: "speak20", name: "수다쟁이", desc: "말하기 시험 20번 통과", emoji: "🗣️", group: "말하기", check: (s) => s.speakPassed >= 20 },
  { id: "pron100", name: "원어민 발음", desc: "발음 평가 100점", emoji: "🎯", group: "말하기", check: (s) => s.pronPerfect },
  { id: "review5", name: "복습왕", desc: "복습 시험 5번 통과", emoji: "🔄", group: "복습", check: (s) => s.reviewPassed >= 5 },
  { id: "wrong5", name: "오답 정복자", desc: "오답 시험 5번 통과", emoji: "📝", group: "복습", check: (s) => s.wrongNotePassed >= 5 },
  { id: "early", name: "얼리버드", desc: "아침 8시 전에 통과", emoji: "🌅", group: "특별", check: (s) => s.earlyBird },
  { id: "owl", name: "올빼미", desc: "밤 10시 이후에 통과", emoji: "🦉", group: "특별", check: (s) => s.nightOwl },
  { id: "weekend", name: "주말 전사", desc: "주말에도 통과", emoji: "🛡️", group: "특별", check: (s) => s.weekend },
];

export async function badgeStats(studentId: number): Promise<BadgeStats> {
  const [user, sessions, speakPassed, streakBadges, pronPerfect] = await Promise.all([
    db.user.findUnique({ where: { id: studentId }, select: { streak: true, bestStreak: true, points: true } }),
    db.testSession.findMany({
      where: { studentId, status: "PASSED" },
      select: { kind: true, wrongCount: true, finishedAt: true, answers: { select: { correct: true } } },
    }),
    db.speakSession.count({ where: { studentId, kind: "TEST", status: "PASSED" } }),
    db.badgeLog.count({ where: { studentId } }),
    db.testAnswer.count({ where: { session: { studentId }, pronScore: 100 } }),
  ]);
  const kst = (d: Date) => new Date(d.getTime() + 9 * 3600 * 1000);
  const days = new Set<string>();
  let earlyBird = false, nightOwl = false, weekend = false, words = 0, perfect = 0;
  for (const s of sessions) {
    words += s.answers.filter((a) => a.correct).length;
    if (s.wrongCount === 0) perfect++;
    if (s.finishedAt) {
      const k = kst(s.finishedAt);
      days.add(k.toISOString().slice(0, 10));
      const h = k.getUTCHours(), dow = k.getUTCDay();
      if (h < 8) earlyBird = true;
      if (h >= 22) nightOwl = true;
      if (dow === 0 || dow === 6) weekend = true;
    }
  }
  return {
    passed: sessions.filter((s) => s.kind === "DAILY" || s.kind === "RETEST").length,
    perfect, words,
    streak: user?.streak ?? 0, bestStreak: user?.bestStreak ?? 0, points: user?.points ?? 0,
    speakPassed,
    reviewPassed: sessions.filter((s) => s.kind === "REVIEW").length,
    wrongNotePassed: sessions.filter((s) => s.kind === "WRONG_NOTE").length,
    earlyBird, nightOwl, weekend,
    pronPerfect: pronPerfect > 0,
    streakBadges,
    daysActive: days.size,
  };
}

export async function earnedBadges(studentId: number) {
  const stats = await badgeStats(studentId);
  const list = BADGES.map(({ check, ...b }) => ({ ...b, earned: check(stats) }));
  return { stats, badges: list, earnedCount: list.filter((b) => b.earned).length, total: list.length };
}
