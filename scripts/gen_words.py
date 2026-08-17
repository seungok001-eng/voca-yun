"""단어·문장 음성 생성 — Gemini TTS.

기존 12,041단어 음성이 모두 Gemini TTS의 Kore 목소리로 만들어져 있어서,
교재에 새로 등장하는 단어도 같은 방식·같은 목소리로 만들어 이질감을 없앤다.
(이미 있는 단어는 data/word-audio-index.json 으로 자동 재사용되므로 여기 오지 않는다.)

준비: export GEMINI_KEYS="키1,키2"      (쉼표로 여러 개 — 하루 한도 소진 시 다음 키로)
사용: python3 gen_words.py jobs.json [워커수]
  jobs.json = [{"text": "apple", "out": "/abs/path.mp3", "word": true, "voice": "Kore"}, ...]
  word=false 이면 문장용 프롬프트를 쓴다. voice 는 Kore(여, 기본) 또는 Achird(남).
"""
import base64
import json
import os
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
DEFAULT_VOICE = "Kore"
# 기본은 2.5 Flash만 사용 (Pro는 단가가 두 배라 쓰지 않는다).
# 정말 필요하면 GEMINI_TTS_MODELS 로 바꿀 수 있다.
MODELS = [m.strip() for m in os.environ.get("GEMINI_TTS_MODELS", "gemini-2.5-flash-preview-tts").split(",") if m.strip()]
KEYS = [k.strip() for k in os.environ.get("GEMINI_KEYS", "").split(",") if k.strip()]

# (키, 모델) 폴백 체인 — 하루 한도가 진짜로 소진됐을 때만 다음으로 넘어간다
CHAIN = [(k, m) for m in MODELS for k in KEYS]
_ptr = 0
_ptr_lock = threading.Lock()


def advance(from_ptr):
    global _ptr
    with _ptr_lock:
        if _ptr == from_ptr and _ptr + 1 < len(CHAIN):
            _ptr += 1
            print(f"  → 다음 (키,모델)로 전환: {CHAIN[_ptr][1]}")


def synth(text, voice=DEFAULT_VOICE):
    ptr = _ptr
    key, model = CHAIN[ptr]
    body = json.dumps({
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}},
        },
    })
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    p = subprocess.run(
        ["curl", "-s", "-X", "POST", "-H", "Content-Type: application/json", "-d", body, url, "--max-time", "120"],
        capture_output=True, text=True,
    )
    d = json.loads(p.stdout or "{}")
    if "error" in d:
        code = d["error"].get("code")
        msg = d["error"].get("message", "")
        is_daily = "per day" in msg.lower() or any(
            "PerDay" in v.get("quotaId", "")
            for det in d["error"].get("details", []) for v in det.get("violations", [])
        )
        raise RuntimeError(f"{code}:{msg[:80]}", code, ptr, is_daily)
    inl = d["candidates"][0]["content"]["parts"][0]["inlineData"]
    m = re.search(r"rate=(\d+)", inl["mimeType"])
    return base64.b64decode(inl["data"]), (int(m.group(1)) if m else 24000)


def to_mp3(pcm, rate, outpath):
    subprocess.run(
        [FFMPEG, "-y", "-f", "s16le", "-ar", str(rate), "-ac", "1", "-i", "pipe:0", "-b:a", "64k", outpath],
        input=pcm, capture_output=True, check=True,
    )


WORD_PROMPTS = [
    "Pronounce the English word clearly: {t}",
    "Read this word aloud: {t}",
    "Say this English vocabulary word: {t}",
]
SENTENCE_PROMPTS = [
    "Read this sentence aloud clearly: {t}",
    "Say this sentence naturally: {t}",
    "{t}",
]


def gen_one(job):
    out = job["out"]
    if os.path.exists(out) and os.path.getsize(out) > 500:
        return "skip"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    prompts = WORD_PROMPTS if job.get("word", True) else SENTENCE_PROMPTS
    last, daily_streak, last_ptr = "", 0, 0
    for a in range(20):
        try:
            pcm, rate = synth(prompts[a % len(prompts)].format(t=job["text"]), job.get("voice", DEFAULT_VOICE))
            if len(pcm) < 2000:
                raise RuntimeError("empty-audio", 0, 0, False)
            to_mp3(pcm, rate, out)
            return "ok"
        except RuntimeError as e:
            last = str(e.args[0] if e.args else e)
            code = e.args[1] if len(e.args) > 1 else 0
            last_ptr = e.args[2] if len(e.args) > 2 else 0
            is_daily = e.args[3] if len(e.args) > 3 else False
            if code == 429:
                # 버스트 429 오탐을 피하려고, 하루 한도가 계속 걸릴 때만 체인을 넘긴다
                daily_streak = daily_streak + 1 if is_daily else 0
                time.sleep(min(30, 6 + a * 3))
                continue
            daily_streak = 0
            time.sleep(1.5 + a)
        except Exception as e:
            last = str(e)
            daily_streak = 0
            time.sleep(1.5 + a)
    if daily_streak >= 12:
        advance(last_ptr)
    return f"FAIL {last}"


def main():
    if not KEYS:
        print("GEMINI_KEYS 환경변수가 필요합니다 (쉼표로 여러 개).")
        sys.exit(1)
    jobs = json.load(open(sys.argv[1]))
    workers = int(sys.argv[2]) if len(sys.argv) > 2 else 6
    tag = os.path.basename(sys.argv[1]).replace(".json", "")
    progress = f"{os.path.dirname(os.path.abspath(sys.argv[1]))}/{tag}_progress.txt"

    done = fail = skip = 0
    fails = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(gen_one, j): j for j in jobs}
        for f in as_completed(futs):
            res = f.result()
            if res == "ok":
                done += 1
            elif res == "skip":
                skip += 1
            else:
                fail += 1
                fails.append((futs[f]["out"], res))
            n = done + fail + skip
            if n % 25 == 0 or n == len(jobs):
                open(progress, "w").write(f"{n}/{len(jobs)} done={done} skip={skip} fail={fail}\n")
    open(progress, "a").write(f"FINISHED done={done} skip={skip} fail={fail}\n")
    if fails:
        json.dump(fails, open(progress.replace("_progress.txt", "_fails.json"), "w"))
    print(f"done={done} skip={skip} fail={fail}")


if __name__ == "__main__":
    main()
