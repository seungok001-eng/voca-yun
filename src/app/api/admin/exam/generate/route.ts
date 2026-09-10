import { db } from "@/lib/db";
import { requireStaff, errorResponse } from "@/lib/auth";
import { geminiReady } from "@/lib/gemini";
import {
  makeVocabPaper, makeGrammarPaper, makeClozePaper, makeCompositionPaper,
  type ExamPaper,
} from "@/lib/exam-maker";

export const maxDuration = 300;

// AI 시험지 생성 — 단어 / 문법 / 빈칸 채우기 / 영작
export async function POST(req: Request) {
  try {
    const s = await requireStaff();
    if (!geminiReady()) {
      return Response.json(
        { error: "AI 키가 설정되지 않았습니다. 배포 환경변수 GEMINI_API_KEY 를 추가해 주세요." },
        { status: 503 }
      );
    }
    const b = await req.json();
    const kind = String(b.kind || "");
    const level = String(b.level || "M1");
    const quality = b.quality === "PRO" ? "PRO" : "FLASH";

    let paper: ExamPaper;
    if (kind === "VOCAB") {
      paper = await makeVocabPaper({
        words: Array.isArray(b.words) ? b.words : [],
        mode: b.mode || "EN_KO",
        count: Number(b.count) || undefined,
        level, title: b.title, quality,
      });
    } else if (kind === "GRAMMAR") {
      if (!String(b.topics || "").trim()) return Response.json({ error: "문법 항목을 입력하세요." }, { status: 400 });
      paper = await makeGrammarPaper({
        topics: String(b.topics), level,
        count: Math.min(40, Math.max(1, Number(b.count) || 10)),
        title: b.title, quality,
      });
    } else if (kind === "CLOZE") {
      if (String(b.passage || "").trim().length < 40) {
        return Response.json({ error: "본문이 너무 짧습니다." }, { status: 400 });
      }
      paper = await makeClozePaper({
        passage: String(b.passage), clozeLevel: String(b.clozeLevel || "C2"),
        level, title: b.title, quality,
      });
    } else if (kind === "COMPOSITION") {
      if (String(b.source || "").trim().length < 10) {
        return Response.json({ error: "자료가 너무 짧습니다." }, { status: 400 });
      }
      paper = await makeCompositionPaper({
        source: String(b.source), level,
        count: Number(b.count) || undefined,
        hint: Boolean(b.hint), title: b.title, quality,
      });
    } else {
      return Response.json({ error: "시험 종류를 선택하세요." }, { status: 400 });
    }

    if (!paper.questions?.length) {
      return Response.json({ error: "문항을 만들지 못했습니다. 다시 시도해 주세요." }, { status: 502 });
    }

    // 나중에 다시 인쇄할 수 있게 저장해 둔다
    const me = await db.user.findUnique({ where: { id: s.uid }, select: { organizationId: true, organization: { select: { name: true } } } });
    const saved = await db.examPaper.create({
      data: {
        organizationId: me?.organizationId ?? null,
        createdById: s.uid,
        kind, title: paper.title, level: paper.levelLabel,
        paperJson: JSON.stringify(paper),
      },
      select: { id: true },
    });

    return Response.json({ ...paper, id: saved.id, orgName: me?.organization?.name ?? "정철 VOCA" });
  } catch (e) {
    return errorResponse(e);
  }
}
