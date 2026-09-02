# 정철 교재 데이터 작업 순서

원본 엑셀을 받으면 아래 순서대로 돌린다. 모든 단계는 다시 돌려도 안전하다
(이미 된 번역·음성은 건너뛴다). 기존 교재에 빠진 레슨(복습 레슨, 심화 파일 등)을
나중에 받아도 같은 순서로 돌리면 기존 데이터에 합쳐진다.

```bash
export GEMINI_KEYS="키1,키2"          # Gemini API 키 (쉼표로 여러 개)

# 1) 엑셀 폴더 → 레슨 JSON (교재별 data/textbook-{sky|planet}-N-N.json)
#    파일 1행("FEM PLANET 1-2 Part 1")과 시트 이름(T*/B*)으로 교재·파트·영역을 알아낸다.
#    Toon World가 기본용·심화용 두 파일이면 단어가 많은 쪽을 심화 원본으로 삼는다.
#    주의: 같은 교재 JSON을 통째로 다시 쓰므로, 일부 레슨만 추가할 때는
#    먼저 git으로 기존 JSON을 보관하고 번역·audio 필드가 사라지지 않았는지 확인한다.
python3 scripts/parse_jungchul.py --dir <엑셀폴더> data

# 2) 본문 문장 한국어 번역 (ko 비어 있는 문장만)
python3 scripts/translate.py data/textbook-planet-1-2.json

# 3) 음성 경로 배정 + 아직 없는 파일만 작업 목록으로
#    (단어는 data/word-audio-index.json 에 있으면 기존 음성을 재사용한다)
python3 scripts/prep_audio.py data/textbook-planet-1-2.json /tmp/jobs.json

# 4) 음성 생성 (A=Kore, B=Achird, 본문=Kore / gemini-2.5-flash-preview-tts)
python3 scripts/gen_words.py /tmp/jobs.json 6

# 5) 새로 만든 단어 음성을 색인에 추가 → 다음 교재부터 재사용
python3 - <<'PY'
import json, glob, os
idx = json.load(open("data/word-audio-index.json"))
for p in glob.glob("data/textbook-*.json"):
    for L in json.load(open(p))["lessons"]:
        for w in L.get("words", []):
            t, a = w["text"].strip().lower(), w.get("audio")
            if a and t not in idx and os.path.exists("public" + a): idx[t] = a
json.dump(idx, open("data/word-audio-index.json", "w"), ensure_ascii=False, indent=1)
PY

# 6) 검증 후 커밋·푸시 → Vercel 배포 시 prisma/seed-deploy.ts 가 DB에 넣는다
#    (문장 수가 달라진 교재만 다시 넣는다)
```

## 규칙 (parse_jungchul.py 에 들어 있음)
- 복습 레슨: Toon World L8, PLANET 북클럽 L4·L8 → `isReview: true`
- SKY 북클럽: 복습 없이 L1~4 = Book A, L5~8 = Book B (`bookLabel`)
- 심화 전용 단어: 기본 파일에 없는 단어 → `advancedOnly: true`
- 문장 "영어 (한국어)": 한국어가 시작되는 첫 괄호에서 자른다
  (괄호가 겹치거나 닫는 괄호가 빠져 있어도 안전)
- 음성 파일명은 `sha1(목소리|문장)` 해시 → 같은 문장은 항상 같은 파일, DB id와 무관

## 자주 걸리는 것
- TTS가 숫자("1773", "342")에서 실패하면 영어로 풀어 쓴 문장으로
  같은 파일 경로에 다시 만든다 (작업 목록의 text만 바꾼다).
- 영어 필드에 한글이 섞였는지 검사:
  `grep -c '"text": ".*[가-힣]' data/textbook-*.json` 이 모두 0이어야 한다.

---

# 음성 생성 스크립트

교재 과정(정철 교재)에 필요한 음성을 만드는 스크립트입니다.
컨테이너가 초기화돼도 남도록 저장소에 함께 둡니다.

## 목소리 정책

| 대상 | 엔진 | 목소리 |
|---|---|---|
| 단어 · 예문 | Gemini TTS | **Kore** (여) — 기존 12,041단어와 동일 |
| 대화 A 화자 | Gemini TTS | **Kore** (여) |
| 대화 B 화자 | Gemini TTS | **Achird** (남) |
| 리딩 본문 | Gemini TTS | **Kore** (여) |

모두 같은 엔진·목소리 계열이라 단어와 문장의 음색이 이어집니다.
이미 만들어 둔 단어 음성은 `data/word-audio-index.json` 으로 철자가 같으면
자동 재사용되므로 다시 만들지 않습니다.

Cloud TTS(`gen_sentences.py`)는 예비 수단입니다. 하루 요청 한도가 정말 부족해질 때
서비스 계정을 만들어 옮기면 되고, Chirp3-HD에 같은 이름의 Kore·Achird 목소리가 있습니다.

## 생성 (Gemini TTS)

```bash
export GEMINI_KEYS="키1,키2"           # 하루 한도 소진 시 다음 키로 자동 전환
python3 scripts/gen_words.py jobs.json 6
```

`jobs.json`
```json
[
  {"text": "apple", "word": true,  "voice": "Kore",   "out": "/abs/public/audio/word/45.mp3"},
  {"text": "Nice to meet you.", "word": false, "voice": "Achird", "out": "/abs/public/audio/speak/123.mp3"}
]
```

- `word: true` = 단어용 프롬프트, `false` = 문장용 프롬프트
- `voice` = `Kore`(여, 기본) / `Achird`(남)

## 예비: Cloud TTS

```bash
export GOOGLE_TTS_KEY="..."            # OAuth(서비스 계정) 필요 — API 키는 받지 않음
python3 scripts/gen_sentences.py jobs.json 8
```

## 공통

- 이미 만들어진 파일(500바이트 초과)은 건너뛰므로 중단 후 다시 돌려도 안전합니다.
- 진행 상황은 `<jobs>_progress.txt`, 실패 목록은 `<jobs>_fails.json` 에 남습니다.

## 생성 대상 가져오기 / 반영

```
GET  /api/admin/curriculum/audio?textbookId=1   # 음성 없는 문장·단어 목록
POST /api/admin/curriculum/audio                # {lines:[{id,path}], words:[{id,path}]}
```
