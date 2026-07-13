import { requireStudent, errorResponse } from "@/lib/auth";
import { startSession } from "@/lib/test-service";

export async function POST(req: Request) {
  try {
    const s = await requireStudent();
    const body = await req.json();
    const kind = body.kind as "DAILY" | "RETEST" | "WRONG_NOTE" | "REVIEW";
    if (!["DAILY", "RETEST", "WRONG_NOTE", "REVIEW"].includes(kind)) {
      return Response.json({ error: "잘못된 시험 종류입니다." }, { status: 400 });
    }
    const session = await startSession({ studentId: s.uid, kind, retestOf: body.retestOf });
    return Response.json({ sessionId: session.id });
  } catch (e) {
    if (e instanceof Error && !("status" in e)) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    return errorResponse(e);
  }
}
