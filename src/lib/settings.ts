import { db } from "./db";

export type ResolvedSettings = {
  testMode: "KO_TO_EN" | "EN_TO_KO" | "MIXED";
  dailyWordCount: number;
  failThreshold: number;
  retestScope: "ALL" | "WRONG_ONLY";
  posStrict: boolean;
  pronEnabled: boolean;
  pronThreshold: number;
  reviewMixCount: number;
  studyDays: string; // 학습 요일 CSV (MON,...,SUN)
  speakMatchRate: number; // 말하기: 문장 일치율 커트라인 (%)
  speakPassCount: number; // 말하기: 통과에 필요한 문장 수 (0 = 전체)
  courseTrack: "BASIC" | "ADVANCED"; // 반 과정: 기본반 | 심화반(단어 추가)
  program: "VOCA" | "TEXTBOOK"; // 학습 프로그램(가닥): 초등~수능 단어장 | 정철 교재
};

export const DEFAULT_SETTINGS: ResolvedSettings = {
  testMode: "MIXED",
  dailyWordCount: 30,
  failThreshold: 3,
  retestScope: "ALL",
  posStrict: true,
  pronEnabled: false,
  pronThreshold: 60,
  reviewMixCount: 5,
  studyDays: "MON,TUE,WED,THU,FRI,SAT,SUN",
  speakMatchRate: 70,
  speakPassCount: 0,
  courseTrack: "BASIC",
  program: "VOCA",
};

// 학생별 설정 > 반 설정 > 기본값 순으로 상속
export async function resolveSettings(studentId: number): Promise<ResolvedSettings> {
  const student = await db.user.findUnique({
    where: { id: studentId },
    include: { setting: true, class: { include: { setting: true } } },
  });
  const cls = student?.class?.setting;
  const own = student?.setting;
  const pick = <T>(a: T | null | undefined, b: T | null | undefined, d: T): T =>
    a !== null && a !== undefined ? a : b !== null && b !== undefined ? b : d;
  return {
    testMode: pick(own?.testMode, cls?.testMode, DEFAULT_SETTINGS.testMode) as ResolvedSettings["testMode"],
    dailyWordCount: pick(own?.dailyWordCount, cls?.dailyWordCount, DEFAULT_SETTINGS.dailyWordCount),
    failThreshold: pick(own?.failThreshold, cls?.failThreshold, DEFAULT_SETTINGS.failThreshold),
    retestScope: pick(own?.retestScope, cls?.retestScope, DEFAULT_SETTINGS.retestScope) as ResolvedSettings["retestScope"],
    posStrict: pick(own?.posStrict, cls?.posStrict, DEFAULT_SETTINGS.posStrict),
    pronEnabled: pick(own?.pronEnabled, cls?.pronEnabled, DEFAULT_SETTINGS.pronEnabled),
    pronThreshold: pick(own?.pronThreshold, cls?.pronThreshold, DEFAULT_SETTINGS.pronThreshold),
    reviewMixCount: pick(own?.reviewMixCount, cls?.reviewMixCount, DEFAULT_SETTINGS.reviewMixCount),
    studyDays: pick(own?.studyDays, cls?.studyDays, DEFAULT_SETTINGS.studyDays),
    speakMatchRate: pick(own?.speakMatchRate, cls?.speakMatchRate, DEFAULT_SETTINGS.speakMatchRate),
    speakPassCount: pick(own?.speakPassCount, cls?.speakPassCount, DEFAULT_SETTINGS.speakPassCount),
    courseTrack: pick(own?.courseTrack, cls?.courseTrack, DEFAULT_SETTINGS.courseTrack) as ResolvedSettings["courseTrack"],
    program: pick(own?.program, cls?.program, DEFAULT_SETTINGS.program) as ResolvedSettings["program"],
  };
}
