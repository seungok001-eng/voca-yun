# 음성 생성 스크립트

교재 과정(정철 교재)에 필요한 음성을 만드는 스크립트입니다.
컨테이너가 초기화돼도 남도록 저장소에 함께 둡니다.

## 목소리 정책

| 대상 | 엔진 | 목소리 |
|---|---|---|
| 단어 · 예문 | Gemini TTS | **Kore** (여) — 기존 12,041단어와 동일 |
| 대화 A 화자 | Cloud TTS | **en-US-Chirp3-HD-Kore** (여) |
| 대화 B 화자 | Cloud TTS | **en-US-Chirp3-HD-Achird** (남) |
| 리딩 본문 | Cloud TTS | **en-US-Chirp3-HD-Kore** (여) |

Chirp3-HD는 Gemini TTS와 같은 목소리 계열이라, 단어(Gemini Kore)와 문장(Cloud Kore)의
음색이 이어집니다. 이미 만들어 둔 단어 음성은 `data/word-audio-index.json` 으로
철자가 같으면 자동 재사용되므로 다시 만들지 않습니다.

## 문장 (Cloud TTS)

글자 수 기준 과금이라 하루 요청 수 제한에 걸리지 않고, MP3를 바로 받아 변환도 없습니다.

```bash
export GOOGLE_TTS_KEY="AIza..."        # Cloud Text-to-Speech API 사용 설정 필요
python3 scripts/gen_sentences.py jobs.json 8
```

`jobs.json`
```json
[{"text": "Nice to meet you.", "voice": "Achird", "out": "/abs/public/audio/speak/123.mp3"}]
```

`voice` 는 `Kore` / `Achird` (또는 대안 `Neural2F` / `Neural2D`).

## 단어 (Gemini TTS)

```bash
export GEMINI_KEYS="키1,키2"           # 하루 한도 소진 시 다음 키로 자동 전환
python3 scripts/gen_words.py jobs.json 6
```

`jobs.json`
```json
[{"text": "apple", "out": "/abs/public/audio/word/45.mp3", "word": true}]
```

`word: false` 면 예문으로 보고 문장용 프롬프트를 씁니다.

## 공통

- 이미 만들어진 파일(500바이트 초과)은 건너뛰므로 중단 후 다시 돌려도 안전합니다.
- 진행 상황은 `<jobs>_progress.txt`, 실패 목록은 `<jobs>_fails.json` 에 남습니다.

## 생성 대상 가져오기 / 반영

```
GET  /api/admin/curriculum/audio?textbookId=1   # 음성 없는 문장·단어 목록
POST /api/admin/curriculum/audio                # {lines:[{id,path}], words:[{id,path}]}
```
