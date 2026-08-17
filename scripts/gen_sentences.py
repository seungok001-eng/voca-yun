"""문장 음성 생성 — Google Cloud Text-to-Speech.

Gemini TTS와 달리 하루 요청 수 제한이 아니라 '글자 수' 기준이라 대량 생성에 적합하다.
MP3를 바로 돌려주므로 변환 과정도 없다.

목소리: A = en-US-Chirp3-HD-Kore(여) / B = en-US-Chirp3-HD-Achird(남) / N(본문) = Kore
  → 기존 단어 음성(Gemini Kore)과 같은 목소리라 이질감이 없다.

준비: export GOOGLE_TTS_KEY="AIza..."   (Cloud Text-to-Speech API 사용 설정 필요)
사용: python3 gen_sentences.py jobs.json [워커수]
  jobs.json = [{"text": "...", "voice": "Kore", "out": "/abs/path.mp3"}, ...]
이미 만든 파일(500바이트 초과)은 건너뛰므로 중단 후 다시 돌려도 안전하다.
"""
import base64
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

API = "https://texttospeech.googleapis.com/v1/text:synthesize"
KEY = os.environ.get("GOOGLE_TTS_KEY", "")

# 짧은 이름 → 실제 Cloud TTS 목소리 이름
VOICES = {
    "Kore": "en-US-Chirp3-HD-Kore",       # A 화자 (여)
    "Achird": "en-US-Chirp3-HD-Achird",   # B 화자 (남)
    # Chirp3 사용이 어려울 때의 대안
    "Neural2F": "en-US-Neural2-F",
    "Neural2D": "en-US-Neural2-D",
}


def synth(text, voice_key):
    name = VOICES.get(voice_key, voice_key)
    body = json.dumps({
        "input": {"text": text},
        "voice": {"languageCode": "en-US", "name": name},
        "audioConfig": {"audioEncoding": "MP3"},
    })
    p = subprocess.run(
        ["curl", "-s", "-X", "POST", "-H", "Content-Type: application/json",
         "-d", body, f"{API}?key={KEY}", "--max-time", "60"],
        capture_output=True, text=True,
    )
    d = json.loads(p.stdout or "{}")
    if "error" in d:
        err = d["error"]
        raise RuntimeError(f"{err.get('code')}:{err.get('message', '')[:120]}", err.get("code"))
    if "audioContent" not in d:
        raise RuntimeError("no-audio", 0)
    return base64.b64decode(d["audioContent"])


def gen_one(job):
    out = job["out"]
    if os.path.exists(out) and os.path.getsize(out) > 500:
        return "skip"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    last = ""
    for attempt in range(6):
        try:
            mp3 = synth(job["text"], job.get("voice", "Kore"))
            if len(mp3) < 500:
                raise RuntimeError("empty-audio", 0)
            with open(out, "wb") as f:
                f.write(mp3)
            return "ok"
        except RuntimeError as e:
            last = str(e.args[0] if e.args else e)
            code = e.args[1] if len(e.args) > 1 else 0
            # 429(속도 제한)·5xx는 잠시 쉬고 재시도, 그 외는 짧게
            time.sleep(min(20, 3 + attempt * 3) if code in (429, 500, 503) else 1.5 + attempt)
        except Exception as e:
            last = str(e)
            time.sleep(1.5 + attempt)
    return f"FAIL {last}"


def main():
    if not KEY:
        print("GOOGLE_TTS_KEY 환경변수가 필요합니다.")
        sys.exit(1)
    jobs = json.load(open(sys.argv[1]))
    workers = int(sys.argv[2]) if len(sys.argv) > 2 else 8
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
