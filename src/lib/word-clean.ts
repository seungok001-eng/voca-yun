// 단어 목록 정리 — 사진·엑셀에서 읽어온 낱말에 딸려 오는 발음기호와 힌트를 걷어낸다.
//
// 시험 문제에 그대로 나오면 안 되는 것:
//   발음기호  [ˈempərər]  /ɪˈmɪʃn/
//   힌트      (↔ sad)  (= happy)  (반의어 …)  (동의어 …)  (유의어 …)  (과거형 went)  go-went-gone  (pl. …)  (cf. …)
// 품사 표시(n. v. adj.)와 뜻 자체는 남긴다.

const IPA = /[ˈˌːəɪʊɔæʃʒθðŋɑɛɜɒʌɚɝ]/;

// 괄호 안이 힌트인지 — 화살표·등호·힌트 낱말로 시작하면 힌트
// (\b는 한글 뒤에서 동작하지 않으므로 뒤에 공백·콜론·끝이 오는지로 판단한다)
const HINT_PAREN = /^\s*(↔|⇔|=|≒|≈|반의어|반대말|반|동의어|유의어|유|동|과거형|과거|과거분사|p\.?p\.?|pl\.?|cf\.?|syn\.?|ant\.?|opp\.?|비교급|최상급|복수형|복수|명사형|형용사형|동사형|부사형)(?=[\s:：,.]|$)/i;
const HINT_INLINE = /\s*(↔|⇔|≒|≈|반의어|반대말|동의어|유의어|과거형|과거분사|비교급|최상급|복수형)\s*[:：]?.*$/;

export function cleanMeaning(raw: string): string {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  // 발음기호: [ ] 나 / / 안에 IPA 글자가 있거나 한글이 전혀 없으면 지운다
  s = s.replace(/\[[^\]]*\]/g, (m) => (IPA.test(m) || !/[가-힣]/.test(m) ? "" : m));
  s = s.replace(/\/[^/]*\//g, (m) => (IPA.test(m) ? "" : m));
  // 괄호 안 힌트
  s = s.replace(/[(（][^)）]*[)）]/g, (m) => (HINT_PAREN.test(m.slice(1, -1)) ? "" : m));
  // 괄호 없이 이어 붙은 힌트 ("행복한 ↔ sad", "가다 과거형 went")
  s = s.replace(HINT_INLINE, "");
  // "= happy" 처럼 등호 뒤에 영어만 오는 꼬리
  s = s.replace(/\s*=\s*[A-Za-z][A-Za-z\s,'-]*$/, "");
  return s.replace(/\s+/g, " ").replace(/^[,·;\s]+|[,·;\s]+$/g, "").trim();
}

export function cleanWordText(raw: string): string {
  let s = String(raw ?? "").replace(/\s+/g, " ").trim();
  s = s.replace(/\[[^\]]*\]/g, "").replace(/\/[^/]*\//g, (m) => (IPA.test(m) ? "" : m));
  s = s.replace(/[(（][^)）]*[)）]/g, "");                 // go (went, gone)
  // 동사 3단 변화(go - went - gone, go/went/gone)만 첫 형태로 줄인다. well-known 같은 합성어는 그대로 둔다
  // (붙여 쓴 하이픈은 mother-in-law 같은 합성어이므로 건드리지 않는다)
  s = s.replace(/^([A-Za-z']+)\/[A-Za-z']+\/[A-Za-z']+$/, "$1");           // go/went/gone
  s = s.replace(/^([A-Za-z']+)\s+[-–]\s+[A-Za-z'].*$/, "$1");             // go - went - gone
  s = s.replace(/^\d+[.)]?\s*/, "");                         // 번호
  return s.replace(/\s+/g, " ").replace(/[,;:\s]+$/g, "").trim();
}

export function cleanWordPair(w: { text: string; meaning: string }) {
  return { text: cleanWordText(w.text), meaning: cleanMeaning(w.meaning) };
}
