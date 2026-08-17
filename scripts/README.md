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
