// 간격 반복(SRS): 통과한 단어를 3일 → 7일 → 21일 뒤 복습 큐에 넣는다
export const SRS_INTERVALS_DAYS = [3, 7, 21];

export function nextDue(stage: number, from = new Date()): Date {
  const days = SRS_INTERVALS_DAYS[Math.min(stage, SRS_INTERVALS_DAYS.length - 1)];
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function todayStr(d = new Date()): string {
  // KST 기준 날짜
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
