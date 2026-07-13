import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/auth";

export async function GET() {
  try {
    await requireSuperAdmin();
    const wordbooks = await db.wordbook.findMany({
      include: { _count: { select: { words: true } }, createdBy: { select: { name: true } } },
      orderBy: { id: "desc" },
    });
    return Response.json({
      wordbooks: wordbooks.map((w) => ({
        id: w.id, name: w.name, wordCount: w._count.words,
        createdBy: w.createdBy?.name ?? "-", createdAt: w.createdAt,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// 엑셀(xlsx/csv) 업로드로 커스텀 단어장 생성
// 컬럼: 단어 | 품사 | 뜻(쉼표로 여러 개) | 예문 | 예문해석  (첫 행은 제목 행이어도 됨)
export async function POST(req: Request) {
  try {
    const s = await requireSuperAdmin();
    const form = await req.formData();
    const name = String(form.get("name") ?? "").trim();
    const file = form.get("file") as File | null;
    if (!name || !file) return Response.json({ error: "단어장 이름과 파일이 필요합니다." }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: "" });

    const words: { text: string; pos: string; meanings: string[]; example?: string; exampleKo?: string }[] = [];
    for (const row of rows) {
      const [text, pos, meanings, example, exampleKo] = row.map((c) => String(c).trim());
      if (!text || !meanings) continue;
      if (/^(단어|word|english)$/i.test(text)) continue; // 제목 행 스킵
      words.push({
        text,
        pos: pos || "n",
        meanings: meanings.split(/[,;/·]/).map((m) => m.trim()).filter(Boolean),
        example: example || undefined,
        exampleKo: exampleKo || undefined,
      });
    }
    if (words.length === 0) {
      return Response.json({ error: "읽을 수 있는 단어가 없습니다. 형식: 단어 | 품사 | 뜻 | 예문 | 해석" }, { status: 400 });
    }

    const wordbook = await db.wordbook.create({ data: { name, createdById: s.uid } });
    await db.word.createMany({
      data: words.map((w, i) => ({
        wordbookId: wordbook.id,
        day: Math.floor(i / 30) + 1,
        text: w.text,
        pos: w.pos,
        meaningsJson: JSON.stringify(w.meanings),
        example: w.example,
        exampleKo: w.exampleKo,
      })),
    });
    return Response.json({ id: wordbook.id, count: words.length });
  } catch (e) {
    return errorResponse(e);
  }
}
