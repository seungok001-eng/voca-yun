"""음성 생성 작업 목록 만들기.

파일 이름을 '문장 내용 해시'로 정하기 때문에 DB id와 무관하다.
→ 같은 문장은 항상 같은 파일을 가리키고, 다시 올려도 음성을 새로 만들지 않는다.

하는 일
 1) 레슨 JSON의 대화·본문 각 줄에 audio 경로를 채운다 (A=Kore, B=Achird, 본문=Kore)
 2) 기존 단어 음성 색인에 없는 단어에 audio 경로를 채운다
 3) 아직 파일이 없는 것만 모아 gen_words.py 용 작업 목록을 만든다

사용: python3 scripts/prep_audio.py lessons.json jobs.json
"""
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
INDEX = os.path.join(ROOT, "data", "word-audio-index.json")

VOICE_OF = {"A": "Kore", "B": "Achird", "N": "Kore"}


def key(text, voice):
    return hashlib.sha1(f"{voice}|{text.strip()}".encode()).hexdigest()[:16]


def main():
    lessons_path, jobs_path = sys.argv[1], sys.argv[2]
    data = json.load(open(lessons_path))
    index = json.load(open(INDEX)) if os.path.exists(INDEX) else {}

    jobs = []
    seen = set()

    def add(text, voice, path, is_word):
        full = os.path.join(PUBLIC, path.lstrip("/"))
        if path in seen:
            return
        seen.add(path)
        if os.path.exists(full) and os.path.getsize(full) > 500:
            return
        jobs.append({"text": text, "voice": voice, "word": is_word, "out": full})

    n_lines = n_words = 0
    for L in data["lessons"]:
        for d in L.get("dialogues", []):
            for ln in d["lines"]:
                voice = VOICE_OF.get(ln["speaker"], "Kore")
                ln["audio"] = f"/audio/speak/{key(ln['text'], voice)}.mp3"
                add(ln["text"], voice, ln["audio"], False)
                n_lines += 1
        for ln in L.get("passageLines", []):
            ln["audio"] = f"/audio/speak/{key(ln['text'], 'Kore')}.mp3"
            add(ln["text"], "Kore", ln["audio"], False)
            n_lines += 1
        for w in L.get("words", []):
            t = w["text"].strip().lower()
            if t in index:
                w["audio"] = index[t]          # 기존 음성 재사용
                continue
            w["audio"] = f"/audio/word/{key(w['text'], 'Kore')}.mp3"
            add(w["text"], "Kore", w["audio"], True)
            n_words += 1

    json.dump(data, open(lessons_path, "w"), ensure_ascii=False, indent=1)
    json.dump(jobs, open(jobs_path, "w"), ensure_ascii=False, indent=1)

    reused = sum(1 for L in data["lessons"] for w in L.get("words", []) if w.get("audio", "").startswith("/audio/l"))
    print(f"문장 {n_lines}개 · 새 단어 {n_words}개 · 기존 음성 재사용 {reused}개")
    print(f"생성 필요: {len(jobs)}개 → {jobs_path}")


if __name__ == "__main__":
    main()
