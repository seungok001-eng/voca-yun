import { db } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/auth";

// 음성이 아직 없는 문장 목록 (외부 생성 스크립트가 가져가서 만든다)
// 화자 A=Kore(여) / B=Achird(남) / N=Kore(본문 낭독)
export async function GET(req: Request) {
  try {
    await requireSuperAdmin();
    const url = new URL(req.url);
    const textbookId = url.searchParams.get("textbookId");
    const limit = Math.min(2000, Number(url.searchParams.get("limit")) || 1000);

    const lines = await db.dialogueLine.findMany({
      where: {
        audioUrl: null,
        ...(textbookId
          ? { dialogue: { lesson: { part: { textbookId: Number(textbookId) } } } }
          : {}),
      },
      take: limit,
      orderBy: { id: "asc" },
      include: {
        dialogue: {
          include: { lesson: { include: { part: { include: { textbook: true } } } } },
        },
      },
    });

    // 음성이 없는 교재 단어도 함께 (기존 단어장에 없던 새 단어)
    const words = await db.word.findMany({
      where: {
        audioUrl: null,
        wordbook: { lessons: { some: textbookId ? { part: { textbookId: Number(textbookId) } } : {} } },
      },
      take: limit,
      orderBy: { id: "asc" },
      select: { id: true, text: true, example: true },
    });

    return Response.json({
      lines: lines.map((l) => ({
        id: l.id,
        speaker: l.speaker,
        text: l.text,
        textbook: l.dialogue.lesson.part.textbook.name,
        path: `/audio/speak/${l.id}.mp3`,
      })),
      words: words.map((w) => ({ id: w.id, text: w.text, example: w.example, path: `/audio/word/${w.id}.mp3` })),
      remaining: { lines: await db.dialogueLine.count({ where: { audioUrl: null } }), words: words.length },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// 생성 완료된 음성 경로 반영
export async function POST(req: Request) {
  try {
    await requireSuperAdmin();
    const b = await req.json();
    const lines: { id: number; path: string }[] = Array.isArray(b.lines) ? b.lines : [];
    const words: { id: number; path: string }[] = Array.isArray(b.words) ? b.words : [];

    for (const l of lines) {
      await db.dialogueLine.update({ where: { id: Number(l.id) }, data: { audioUrl: String(l.path) } });
    }
    for (const w of words) {
      await db.word.update({ where: { id: Number(w.id) }, data: { audioUrl: String(w.path) } });
    }
    return Response.json({ ok: true, lines: lines.length, words: words.length });
  } catch (e) {
    return errorResponse(e);
  }
}
