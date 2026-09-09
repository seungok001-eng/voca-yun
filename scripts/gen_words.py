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


# ── 숫자 읽어주기 ───────────────────────────────────────────────
# 모델이 "It was 7:32." 나 "$6.56", "1503." 같은 숫자·기호에서 음성을 못 만들 때가 있다.
# 그럴 때 숫자를 영어 낱말로 풀어 같은 파일에 다시 만든다.
ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
        "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def say_int(n):
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + (f"-{ONES[n % 10]}" if n % 10 else "")
    if n < 1000:
        rest = n % 100
        return ONES[n // 100] + " hundred" + (f" {say_int(rest)}" if rest else "")
    for size, word in ((10**9, "billion"), (10**6, "million"), (1000, "thousand")):
        if n >= size:
            rest = n % size
            return f"{say_int(n // size)} {word}" + (f" {say_int(rest)}" if rest else "")
    return str(n)


def say_year(n):
    """1503 → fifteen oh three, 1814 → eighteen fourteen, 2008 → two thousand eight"""
    if 1100 <= n < 2000 or 2100 <= n < 3000:
        hi, lo = divmod(n, 100)
        if lo == 0:
            return f"{say_int(hi)} hundred"
        return f"{say_int(hi)} oh {ONES[lo]}" if lo < 10 else f"{say_int(hi)} {say_int(lo)}"
    return say_int(n)


def spell_numbers(text):
    """문장 속 숫자·기호를 소리 나는 대로 바꾼다."""
    t = text
    t = re.sub(r"(\d+)\s*½", lambda m: f"{say_int(int(m.group(1)))} and a half", t)
    t = re.sub(r"\$\s?([\d,]+)\.(\d{2})\b",
               lambda m: f"{say_int(int(m.group(1).replace(',', '')))} dollars and {say_int(int(m.group(2)))} cents", t)
    t = re.sub(r"\$\s?([\d,]+)", lambda m: f"{say_int(int(m.group(1).replace(',', '')))} dollars", t)
    t = re.sub(r"\b(\d{1,2}):(\d{2})\b",
               lambda m: f"{say_int(int(m.group(1)))} {'oh ' + ONES[int(m.group(2))] if int(m.group(2)) < 10 else say_int(int(m.group(2)))}"
               if int(m.group(2)) else f"{say_int(int(m.group(1)))} o'clock", t)
    t = re.sub(r"\b(\d{4})\s*[-–]\s*(\d{4})\b",
               lambda m: f"{say_year(int(m.group(1)))} to {say_year(int(m.group(2)))}", t)
    t = re.sub(r"\b(1[0-9]{3}|20[0-9]{2})\b", lambda m: say_year(int(m.group(1))), t)
    t = re.sub(r"\b(\d{1,3}(?:,\d{3})+|\d+)\b", lambda m: say_int(int(m.group(1).replace(",", ""))), t)
    t = t.replace("½", " and a half").replace("%", " percent")
    # 왕 이름 뒤 로마 숫자만 바꾼다: Louis XIV → Louis the fourteenth
    # (CIVIL·MIX 같은 보통 낱말을 숫자로 잘못 읽지 않도록 이름 뒤로 한정한다)
    t = re.sub(
        r"\b([A-Z][a-z]+)\s+(?!I\b)([IVXLC]{1,8})\b",  # 단독 I는 대명사라 건드리지 않는다
        lambda m: f"{m.group(1)} the {ordinal(roman(m.group(2)))}" if roman(m.group(2)) else m.group(0),
        t,
    )
    return re.sub(r"\s+", " ", t).strip()


ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
ROMAN_RE = re.compile(r"^(C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$")
ORDINALS = {"one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth",
            "nine": "ninth", "twelve": "twelfth"}


def roman(s):
    """표준 표기(1~199)만 숫자로 본다. 아니면 0을 돌려 원문을 그대로 둔다."""
    if not ROMAN_RE.match(s):
        return 0
    total = prev = 0
    for ch in reversed(s):
        v = ROMAN[ch]
        total += -v if v < prev else v
        prev = max(prev, v)
    return total


def ordinal(n):
    w = say_int(n)
    head, _, tail = w.rpartition("-")
    last = ORDINALS.get(tail) or (tail[:-1] + "ieth" if tail.endswith("y") else tail + "th")
    return f"{head}-{last}" if head else last


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
    # 숫자가 든 문장은 몇 번 실패하면 숫자를 영어로 풀어 다시 시도한다 (파일 경로는 그대로)
    spelled = spell_numbers(job["text"])
    if spelled == job["text"]:
        spelled = None
    last, daily_streak, last_ptr = "", 0, 0
    for a in range(20):
        try:
            text = spelled if (spelled and a >= 4) else job["text"]
            pcm, rate = synth(prompts[a % len(prompts)].format(t=text), job.get("voice", DEFAULT_VOICE))
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
