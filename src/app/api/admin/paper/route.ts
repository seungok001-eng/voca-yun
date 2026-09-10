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
  source: string; // 어느 단계에서 나온 문제인지 (정답지에 표시)
  choices?: string[]; // EN_DEF 4지선다 보기
  answerIndex?: number; // 정답 보기 인덱스 (0-3)
};

type SourceIn = { levelId?: unknown; wordbookId?: unknown; from?: unknown; to?: unknown };

/**
 * 문항 수를 단계별로 나눈다. 범위가 큰 단계에 더 많이 배분하되,
 * 문항 수가 단계 수보다 많으면 모든 단계에서 최소 1문제는 나오게 한다.
 */
function allocate(sizes: number[], total: number): number[] {
  const n = sizes.length;
  const out = new Array(n).fill(0);
  const totalSize = sizes.reduce((a, b) => a + b, 0);
  if (totalSize === 0) return out;

  const exact = sizes.map((s) => (total * s) / totalSize);
  for (let i = 0; i < n; i++) out[i] = Math.min(sizes[i], Math.floor(exact[i]));
  if (total >= n) {
    for (let i = 0; i < n; i++) if (out[i] === 0 && sizes[i] > 0) out[i] = 1;
  }

  let sum = out.reduce((a, b) => a + b, 0);
  while (sum > total) {
    let idx = -1, best = 1;
    for (let i = 0; i < n; i++) if (out[i] > best) { best = out[i]; idx = i; }
    if (idx < 0) break;
    out[idx]--; sum--;
  }
  while (sum < total) {
    let idx = -1, best = -1;
    for (let i = 0; i < n; i++) {
      if (out[i] >= sizes[i]) continue;
      const frac = exact[i] - Math.floor(exact[i]);
      if (frac > best) { best = frac; idx = i; }
    }
    if (idx < 0) break;
    out[idx]++; sum++;
  }
  return out;
}

// 선생님용 종이 시험지 문제 생성 — 여러 진도 단계를 한 장에 섞어 낼 수 있다
export async function POST(req: Request) {
  try {
    const s = await requireStaff();
    const b = await req.json();

    // 예전 형식(단일 범위)도 그대로 받는다
    const raw: SourceIn[] = Array.isArray(b.sources) && b.sources.length > 0
      ? (b.sources as SourceIn[])
      : [{ levelId: b.levelId, wordbookId: b.wordbookId, from: b.from, to: b.to }];
    if (raw.length > 10) return Response.json({ error: "범위는 한 번에 10개까지 넣을 수 있습니다." }, { status: 400 });

    const mode = String(b.mode || "EN_KO") as "EN_KO" | "KO_EN" | "EN_DEF" | "MIX";
    const mixIncludeDef = Boolean(b.mixIncludeDef);
    const order = b.order === "SEQ" ? "SEQ" : "RANDOM";

    type Entry = { w: Awaited<ReturnType<typeof db.word.findMany>>[number]; no: number; src: number };
    const pools: Entry[][] = [];
    const sources: { name: string; from: number; to: number; total: number; count: number }[] = [];
    const defPool: { text: string; def: string }[] = [];

    for (const [i, r] of raw.entries()) {
      const levelId = r.levelId ? Number(r.levelId) : null;
      const wordbookId = r.wordbookId ? Number(r.wordbookId) : null;
      if (!levelId && !wordbookId) {
        return Response.json({ error: `${i + 1}번째 범위의 레벨 또는 단어장을 선택하세요.` }, { status: 400 });
      }

      const all = await db.word.findMany({
        where: levelId ? { levelId } : { wordbookId },
        orderBy: { id: "asc" },
      });
      const name = levelId
        ? await db.level.findUnique({ where: { id: levelId } }).then((lv) => (lv ? `${lv.nameKo} (Lv.${lv.order})` : ""))
        : await db.wordbook.findUnique({ where: { id: wordbookId! } }).then((wb) => wb?.name ?? "");
      if (all.length === 0) return Response.json({ error: `${name || `${i + 1}번째 범위`}에 단어가 없습니다.` }, { status: 400 });

      const from = Math.max(1, Number(r.from) || 1);
      const to = Math.min(all.length, Number(r.to) || all.length);
      if (from > to) {
        return Response.json({ error: `${name}의 번호 범위가 잘못됐습니다. (1 ~ ${all.length})` }, { status: 400 });
      }

      let pool: Entry[] = all.slice(from - 1, to).map((w, k) => ({ w, no: from + k, src: i }));
      if (mode === "EN_DEF") pool = pool.filter((p) => p.w.defEn);

      for (const w of all) if (w.defEn) defPool.push({ text: w.text, def: w.defEn });
      pools.push(pool);
      sources.push({ name, from, to, total: all.length, count: 0 });
    }

    const poolTotal = pools.reduce((n, p) => n + p.length, 0);
    if (poolTotal === 0) {
      return Response.json(
        { error: mode === "EN_DEF"
            ? "선택한 범위에는 영어 뜻풀이 데이터가 아직 없습니다. (커스텀 단어장은 영→한/한→영만 가능)"
            : "선택한 범위에 단어가 없습니다." },
        { status: 400 }
      );
    }

    const count = Math.min(poolTotal, Math.max(1, Number(b.count) || poolTotal));
    const quotas = allocate(pools.map((p) => p.length), count);

    let picked: Entry[] = [];
    quotas.forEach((q, i) => {
      sources[i].count = q;
      if (q <= 0) return;
      picked = picked.concat(q < pools[i].length ? shuffle(pools[i]).slice(0, q) : [...pools[i]]);
    });
    // 번호순은 단계 순서 → 단어 번호 순
    picked = order === "SEQ" ? picked.sort((a, z) => a.src - z.src || a.no - z.no) : shuffle(picked);

    const questions: PaperQuestion[] = picked.map(({ w, no, src }) => {
      let type: QType;
      if (mode === "MIX") {
        const types: QType[] = ["EN_KO", "KO_EN"];
        if (mixIncludeDef && w.defEn && defPool.length >= 4) types.push("EN_DEF");
        type = types[Math.floor(Math.random() * types.length)];
      } else {
        type = mode as QType;
      }
      const base = {
        no, text: w.text, pos: w.pos,
        meanings: JSON.parse(w.meaningsJson) as string[],
        source: sources[src].name,
      };
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

    return Response.json({
      orgName,
      sources,
      // 예전 화면 호환용 (첫 범위 기준)
      sourceName: sources.map((x) => x.name).join(" + "),
      from: sources[0].from,
      to: sources[0].to,
      total: poolTotal,
      questions,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
