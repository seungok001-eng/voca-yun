import { db } from "@/lib/db";
import { requireStaff, errorResponse } from "@/lib/auth";
import { shuffle } from "@/lib/grading";

type QType = "EN_KO" | "KO_EN" | "EN_DEF";
export type PaperQuestion = {
  no: number; // 레벨(단어장) 내 단어 번호
  type: QType;
  text: string;
  pos: string;
  meanings: string[];
  choices?: string[]; // EN_DEF 4지선다 보기
  answerIndex?: number; // 정답 보기 인덱스 (0-3)
};

// 선생님용 종이 시험지 문제 생성
export async function POST(req: Request) {
  try {
    const s = await requireStaff();
    const b = await req.json();
    const levelId = b.levelId ? Number(b.levelId) : null;
    const wordbookId = b.wordbookId ? Number(b.wordbookId) : null;
    if (!levelId && !wordbookId) return Response.json({ error: "레벨 또는 단어장을 선택하세요." }, { status: 400 });

    const where = levelId ? { levelId } : { wordbookId };
    const all = await db.word.findMany({ where, orderBy: { id: "asc" } });
    if (all.length === 0) return Response.json({ error: "단어가 없습니다." }, { status: 400 });

    const from = Math.max(1, Number(b.from) || 1);
    const to = Math.min(all.length, Number(b.to) || all.length);
    if (from > to) return Response.json({ error: `번호 범위가 잘못됐습니다. (1 ~ ${all.length})` }, { status: 400 });

    const mode = String(b.mode || "EN_KO") as "EN_KO" | "KO_EN" | "EN_DEF" | "MIX";
    const mixIncludeDef = Boolean(b.mixIncludeDef);
    const order = b.order === "SEQ" ? "SEQ" : "RANDOM";

    // 범위 내 단어 (번호 부여)
    let pool = all.slice(from - 1, to).map((w, i) => ({ w, no: from + i }));
    if (mode === "EN_DEF") {
      pool = pool.filter((p) => p.w.defEn);
      if (pool.length === 0) {
        return Response.json({ error: "이 범위에는 영어 뜻풀이 데이터가 아직 없습니다. (커스텀 단어장은 영→한/한→영만 가능)" }, { status: 400 });
      }
    }

    const count = Math.min(pool.length, Math.max(1, Number(b.count) || pool.length));
    let picked = count < pool.length ? shuffle(pool).slice(0, count) : [...pool];
    picked = order === "SEQ" ? picked.sort((a, z) => a.no - z.no) : shuffle(picked);

    // 4지선다 오답 보기 풀: 같은 레벨(단어장)의 영어 뜻풀이 전체
    const defPool = all.filter((w) => w.defEn).map((w) => ({ text: w.text, def: w.defEn! }));

    const questions: PaperQuestion[] = picked.map(({ w, no }) => {
      let type: QType;
      if (mode === "MIX") {
        const types: QType[] = ["EN_KO", "KO_EN"];
        if (mixIncludeDef && w.defEn && defPool.length >= 4) types.push("EN_DEF");
        type = types[Math.floor(Math.random() * types.length)];
      } else {
        type = mode as QType;
      }
      const base = { no, text: w.text, pos: w.pos, meanings: JSON.parse(w.meaningsJson) as string[] };
      if (type === "EN_DEF" && w.defEn && defPool.length >= 4) {
        const wrong = shuffle(defPool.filter((d) => d.text !== w.text && d.def !== w.defEn)).slice(0, 3).map((d) => d.def);
        const choices = shuffle([w.defEn, ...wrong]);
        return { ...base, type: "EN_DEF" as const, choices, answerIndex: choices.indexOf(w.defEn) };
      }
      return { ...base, type: type === "EN_DEF" ? "EN_KO" : type };
    });

    // 시험지 머리글: 생성한 교직원의 소속 학원 이름 (학원마다 자기 이름이 나옴)
    const me = await db.user.findUnique({ where: { id: s.uid }, include: { organization: true } });
    const orgName = me?.organization?.name ?? "정철 VOCA";

    let sourceName = "";
    if (levelId) {
      const lv = await db.level.findUnique({ where: { id: levelId } });
      sourceName = lv ? `${lv.nameKo} (Lv.${lv.order})` : "";
    } else {
      const wb = await db.wordbook.findUnique({ where: { id: wordbookId! } });
      sourceName = wb?.name ?? "";
    }

    return Response.json({ orgName, sourceName, from, to, total: all.length, questions });
  } catch (e) {
    return errorResponse(e);
  }
}
