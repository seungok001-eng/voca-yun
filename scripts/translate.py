"""본문 문장 한국어 번역 — Gemini (텍스트 모델).

파싱한 JSON의 passageLines 중 번역(ko)이 비어 있는 문장을 채운다.
문맥을 유지하려고 레슨 단위로, 앞뒤 문장을 함께 보내 한 번에 번역한다.

준비: export GEMINI_KEYS="키1,키2"
사용: python3 scripts/translate.py lessons.json [모델]
     (이미 ko가 있는 문장은 건너뛰므로 중단 후 다시 돌려도 안전하다)
"""
import json
import os
import re
import subprocess
import sys
import time

KEYS = [k.strip() for k in os.environ.get("GEMINI_KEYS", "").split(",") if k.strip()]
MODEL = sys.argv[2] if len(sys.argv) > 2 else "gemini-2.5-flash"
BATCH = 20

PROMPT = """다음은 초등·중등 영어 교재의 이야기 본문입니다.
각 문장을 자연스러운 한국어로 번역해 주세요.

규칙:
- 문장 번호와 순서를 그대로 유지하세요.
- 학생이 영어 원문과 대조해 볼 수 있도록 원문의 뜻을 빠짐없이 옮기되, 한국어로 자연스럽게 쓰세요.
- 등장인물 이름은 소리 나는 대로 한글로 적으세요 (Jonathan → 조나단).
- 설명이나 다른 말 없이, 아래 형식으로 한 줄에 하나씩만 답하세요.

출력 형식 (번호|번역):
1|번역문
2|번역문

문장:
"""


def call(text, key):
    body = json.dumps({
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {"temperature": 0.3},
    })
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={key}"
    p = subprocess.run(
        ["curl", "-s", "-X", "POST", "-H", "Content-Type: application/json", "-d", body, url, "--max-time", "180"],
        capture_output=True, text=True,
    )
    d = json.loads(p.stdout or "{}")
    if "error" in d:
        raise RuntimeError(f"{d['error'].get('code')}:{d['error'].get('message', '')[:90]}")
    return d["candidates"][0]["content"]["parts"][0]["text"]


def translate_batch(sentences):
    """sentences = [(index, text)] → {index: ko}"""
    listing = "\n".join(f'{i+1}. {t}' for i, (_, t) in enumerate(sentences))
    out = {}
    for attempt in range(6):
        key = KEYS[attempt % len(KEYS)]
        try:
            raw = call(PROMPT + listing, key)
            for line in raw.splitlines():
                m = re.match(r"\s*(\d+)\s*[|\.\)]\s*(.+)", line)
                if not m:
                    continue
                n = int(m.group(1)) - 1
                ko = m.group(2).strip()
                if 0 <= n < len(sentences) and ko:
                    out[sentences[n][0]] = ko
            if len(out) >= len(sentences) * 0.8:
                return out
        except Exception as e:
            print(f"    재시도 {attempt + 1}: {str(e)[:80]}")
            time.sleep(3 + attempt * 3)
    return out


def main():
    if not KEYS:
        print("GEMINI_KEYS 환경변수가 필요합니다.")
        sys.exit(1)
    path = sys.argv[1]
    data = json.load(open(path))
    total = done = 0

    for L in data["lessons"]:
        lines = L.get("passageLines") or []
        todo = [(i, ln["text"]) for i, ln in enumerate(lines) if not ln.get("ko")]
        if not todo:
            continue
        total += len(todo)
        label = f"P{L['part']} {'Toon' if L['area'] == 'TOON' else 'Book'} L{L['order']}"
        print(f"{label}: {len(todo)}문장 번역 중...")
        for s in range(0, len(todo), BATCH):
            chunk = todo[s:s + BATCH]
            got = translate_batch(chunk)
            for idx, ko in got.items():
                lines[idx]["ko"] = ko
                done += 1
            json.dump(data, open(path, "w"), ensure_ascii=False, indent=1)  # 진행분 즉시 저장
            print(f"  {min(s + BATCH, len(todo))}/{len(todo)}")

    missing = sum(1 for L in data["lessons"] for ln in (L.get("passageLines") or []) if not ln.get("ko"))
    print(f"\n번역 완료 {done}/{total} · 남은 문장 {missing}개")


if __name__ == "__main__":
    main()
