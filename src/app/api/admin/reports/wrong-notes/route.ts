import { db } from "@/lib/db";
import { requireStaff, accessibleClassIds, errorResponse } from "@/lib/auth";
import { toCsv, csvResponse } from "@/lib/csv";

// 오답 리포트 CSV: 학생별 미해결 오답 단어 목록
export async function GET(req: Request) {
  try {
    const s = await requireStaff();
    const url = new URL(req.url);
    const classId = url.searchParams.get("classId");
    const studentId = url.searchParams.get("studentId");
    const ids = await accessibleClassIds(s);

    const studentWhere: Record<string, unknown> = { role: "STUDENT" };
    if (studentId) studentWhere.id = Number(studentId);
    else if (classId) {
      const cid = Number(classId);
      if (ids !== null && !ids.includes(cid)) return Response.json({ error: "권한 없음" }, { status: 403 });
      studentWhere.classId = cid;
    } else if (ids !== null) studentWhere.classId = { in: ids };

    const students = await db.user.findMany({
      where: studentWhere,
      include: {
        class: { select: { name: true } },
        wrongNotes: { where: { resolved: false }, include: { word: true }, orderBy: { wrongCount: "desc" } },
      },
      orderBy: [{ classId: "asc" }, { name: "asc" }],
    });

    const rows: (string | number)[][] = [];
    for (const st of students) {
      for (const n of st.wrongNotes) {
        rows.push([
          st.class?.name ?? "-",
          st.name,
          n.word.text,
          n.word.pos,
          JSON.parse(n.word.meaningsJson).join(" / "),
          n.wrongCount,
          new Date(n.lastWrongAt).toLocaleDateString("ko-KR"),
        ]);
      }
    }

    const csv = toCsv(["반", "이름", "단어", "품사", "뜻", "틀린횟수", "최근오답일"], rows);
    return csvResponse(`오답리포트_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (e) {
    return errorResponse(e);
  }
}
