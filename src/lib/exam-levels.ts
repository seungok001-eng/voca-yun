// 학년별 난이도 기준 — 초등 4학년부터 수능까지 1학년 간격
//
// 한국 현행 교육과정(2015·2022 개정)의 학년군별 성취기준과
// 실제 학교 시험·시중 문제집에서 그 학년에 나오는 문항 형태를 기준으로 정리했다.
// 문제를 만들 때 이 표를 그대로 AI 지시문에 넣어 학년에 맞는 난이도를 맞춘다.

export type ExamLevel = {
  code: string;
  label: string;      // 화면에 보이는 이름
  short: string;      // 시험지 머리글용
  vocab: string;      // 어휘 수준
  sentence: string;   // 문장 길이·구조
  grammar: string;    // 그 학년까지 배운 문법 범위 (이 밖의 것은 쓰지 않는다)
  format: string;     // 그 학년 시험에서 실제로 쓰는 문항 형태
  instruction: string; // 지시문 언어
};

export const EXAM_LEVELS: ExamLevel[] = [
  {
    code: "E4",
    label: "초등 4학년",
    short: "초4",
    vocab: "교육과정 기본어휘 중 3~4학년군 낱말(약 500낱말). 일상 사물·동물·색·숫자·가족·학교 생활 어휘.",
    sentence: "5~8낱말의 짧은 단문. 한 문장에 한 가지 내용만.",
    grammar: "be동사 현재, 일반동사 현재(3인칭 단수 포함), 명령문, 인칭대명사, a/an/the, 명사 복수형, 의문사 what·who·how many, 전치사 in·on·under, and·but.",
    format: "그림이나 <보기> 상자를 주는 4지선다, 알맞은 낱말 고르기, 낱말 연결하기, <보기>에서 골라 빈칸 채우기. 서술형은 낱말 하나 쓰기까지만.",
    instruction: "지시문은 한국어로 쓴다.",
  },
  {
    code: "E5",
    label: "초등 5학년",
    short: "초5",
    vocab: "3~5학년군 누적 약 650낱말. 취미·날씨·시간·장소·직업 어휘 추가.",
    sentence: "6~9낱말. 접속사로 이은 두 문장까지 허용.",
    grammar: "위 내용 + 현재진행형, 조동사 can·may, 규칙 과거시제, 빈도부사, 의문사 when·where·why·whose, or, 형용사 비교 기초.",
    format: "4지선다, <보기> 제공 빈칸 채우기, 대화 완성, 낱말 배열(4~6낱말), 짧은 문장 쓰기.",
    instruction: "지시문은 한국어로 쓴다.",
  },
  {
    code: "E6",
    label: "초등 6학년",
    short: "초6",
    vocab: "초등 누적 약 800낱말. 여행·건강·환경 등 기초 주제 어휘.",
    sentence: "7~11낱말. 접속사·부사구가 붙은 문장.",
    grammar: "위 내용 + 불규칙 과거시제, 미래(will·be going to), 비교급·최상급, 조동사 should·must·have to, because·if·when, 감탄문, 부가 의문문 맛보기.",
    format: "4지선다, 빈칸 채우기(<보기> 있음/없음), 대화 완성, 낱말 배열(5~8낱말), 조건 영작 한 문장.",
    instruction: "지시문은 한국어로 쓴다.",
  },
  {
    code: "M1",
    label: "중학교 1학년",
    short: "중1",
    vocab: "중학 기본어휘 진입(누적 약 1,000낱말). 교과서 본문 수준의 일반 어휘.",
    sentence: "8~13낱말. 준동사가 하나 들어간 문장까지.",
    grammar: "문장의 1~3형식, be동사·일반동사 총정리, 시제(현재·과거·미래·진행), to부정사 명사적 용법, 동명사, There is/are, 비교 구문, 조동사, 의문사 의문문.",
    format: "5지선다(어법·어휘), 빈칸 채우기, 대화 완성, 낱말 배열, 단답형, 조건 영작 한 문장. 밑줄 친 부분 고치기.",
    instruction: "지시문은 한국어로 쓰고, 문항 본문은 영어로 쓴다.",
  },
  {
    code: "M2",
    label: "중학교 2학년",
    short: "중2",
    vocab: "누적 약 1,400낱말. 파생어·숙어(구동사) 등장.",
    sentence: "10~16낱말. 종속절이 하나 있는 복문.",
    grammar: "위 내용 + 현재완료(경험·계속·완료·결과), 수동태, to부정사 3용법, 분사(현재·과거), 관계대명사 주격·목적격, 접속사 that·if·whether, 간접의문문, 4·5형식, 사역·지각동사 맛보기.",
    format: "5지선다(어법상 틀린 것·알맞은 것), 빈칸 추론, 어순 배열, 문장 전환(능동↔수동 등), 단답형, 조건 영작(어휘·어형 지정).",
    instruction: "지시문은 한국어로 쓰고, 문항 본문은 영어로 쓴다.",
  },
  {
    code: "M3",
    label: "중학교 3학년",
    short: "중3",
    vocab: "중학 누적 약 1,800낱말. 추상 명사와 숙어 비중 증가.",
    sentence: "12~18낱말. 절이 둘 있는 복문.",
    grammar: "위 내용 + 관계대명사 what·소유격, 관계부사, 분사구문 기초, 가정법 과거, 과거완료, 사역·지각동사, it ~ that 강조, so/such ~ that, 부가의문문, 간접화법.",
    format: "5지선다 어법, 밑줄 친 것 중 틀린 것 고르기, 빈칸 추론, 어순 배열, 문장 전환, 조건 영작(단어 수·어형 지정), 서술형 2~3문장.",
    instruction: "지시문은 한국어로 쓰고, 문항 본문은 영어로 쓴다.",
  },
  {
    code: "H1",
    label: "고등학교 1학년",
    short: "고1",
    vocab: "고교 진입 누적 약 2,200낱말. 학술적 어휘와 연어(collocation) 등장.",
    sentence: "15~25낱말. 수식어구가 길게 붙은 문장.",
    grammar: "5형식 정밀 분석, 준동사 전반(부정사·동명사·분사), 분사구문 심화(with 분사구문·완료분사구문), 가정법 전반(과거완료·혼합·I wish·as if), 복합관계사, 도치·강조, 병렬 구조, 관계사 심화.",
    format: "수능형 5지선다, 밑줄 친 어법 중 적절하지 않은 것, 네모 안에서 어법·어휘 고르기, 빈칸 추론, 어순 배열, 조건 영작(어형 변형 포함).",
    instruction: "지시문은 한국어로 쓰고, 문항 본문은 영어로 쓴다. 학평·모의고사 문항 어투를 따른다.",
  },
  {
    code: "H2",
    label: "고등학교 2학년",
    short: "고2",
    vocab: "누적 약 2,700낱말. 추상·논설 어휘, 헷갈리는 유의어 구분.",
    sentence: "20~30낱말. 삽입구·동격·도치가 섞인 문장.",
    grammar: "위 내용 + 수능 어법 판별 요소 전반(준동사 vs 정동사, 관계사 vs 접속사, 대명사 수일치, 태·시제 일치, 병렬, 수식 관계), 어휘 문맥 추론.",
    format: "수능 29번(밑줄 어법)·30번(문맥 어휘) 유형, 빈칸 추론, 어법 서술형(틀린 곳 찾아 고치기), 조건 영작.",
    instruction: "지시문은 한국어로 쓰고, 문항 본문은 영어로 쓴다. 수능·학평 문항 어투를 따른다.",
  },
  {
    code: "H3",
    label: "고등학교 3학년 · 수능",
    short: "수능",
    vocab: "수능 수준 누적 약 3,000낱말 이상. 추상 개념어와 학술 어휘.",
    sentence: "25낱말 이상의 복잡한 문장. 여러 수식 구조가 겹친다.",
    grammar: "수능 어법 전 범위. 문장 구조 분석 중심으로, 형태만 보고는 못 풀고 문맥과 구조를 함께 봐야 답이 나오도록 한다.",
    format: "수능 29번·30번 유형 5지선다, 빈칸 추론, 어법 서술형, 고난도 조건 영작. 오답 선택지도 그럴듯하게 만든다.",
    instruction: "지시문은 한국어로 쓰고, 문항 본문은 영어로 쓴다. 수능 문항 어투를 그대로 따른다.",
  },
];

export const LEVEL_BY_CODE = new Map(EXAM_LEVELS.map((l) => [l.code, l]));

export function levelBrief(code: string): string {
  const l = LEVEL_BY_CODE.get(code);
  if (!l) return "";
  return [
    `대상 학년: ${l.label}`,
    `어휘 수준: ${l.vocab}`,
    `문장 수준: ${l.sentence}`,
    `문법 범위: ${l.grammar}`,
    `문항 형태: ${l.format}`,
    `지시문: ${l.instruction}`,
    `이 학년이 아직 배우지 않은 문법·어휘는 쓰지 않는다. 반대로 너무 쉬워도 안 된다.`,
  ].join("\n");
}

// 빈칸 채우기 난이도 4단계
export type ClozeLevel = { code: string; label: string; rate: string; target: string; bank: boolean };

export const CLOZE_LEVELS: ClozeLevel[] = [
  {
    code: "C1", label: "1단계 (기초)", rate: "본문 낱말의 약 8%",
    target: "본문에서 가장 중요한 핵심 명사·동사·형용사만 빈칸으로 만든다.",
    bank: true,
  },
  {
    code: "C2", label: "2단계 (표준)", rate: "약 15%",
    target: "핵심 어휘에 더해 숙어·구동사의 한 낱말을 빈칸으로 만든다.",
    bank: true,
  },
  {
    code: "C3", label: "3단계 (심화)", rate: "약 22%",
    target: "핵심 어휘·숙어에 더해 문법 요소(전치사, 관사, 접속사, 관계사, 동사의 어형)를 빈칸으로 만든다.",
    bank: false,
  },
  {
    code: "C4", label: "4단계 (최상)", rate: "약 30%",
    target: "위 전부에 더해 연어와 구문 표현까지 빈칸으로 만든다. 문맥을 정확히 이해해야만 채울 수 있게 한다.",
    bank: false,
  },
];

export const CLOZE_BY_CODE = new Map(CLOZE_LEVELS.map((l) => [l.code, l]));
