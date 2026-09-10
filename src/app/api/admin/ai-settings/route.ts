import { db } from "@/lib/db";
import { requireSuperAdmin, errorResponse } from "@/lib/auth";
import { pingKey, invalidateKeyCache } from "@/lib/gemini";

export const maxDuration = 60;

// AI(Gemini) 키 설정 — 총관리자만. 키는 DB에 저장되고 화면에는 앞뒤 몇 글자만 보여준다.
function mask(v: string) {
  return v.length <= 10 ? "••••" : `${v.slice(0, 6)}••••••${v.slice(-4)}`;
}

export async function GET() {
  try {
    await requireSuperAdmin();
    const row = await db.appSetting.findUnique({ where: { key: "gemini_api_key" } });
    const fromEnv = !!(process.env.GEMINI_API_KEY || process.env.GEMINI_KEYS);
    return Response.json({
      configured: !!row?.value || fromEnv,
      source: row?.value ? "DB" : fromEnv ? "ENV" : null,
      masked: row?.value ? mask(row.value) : null,
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  try {
    await requireSuperAdmin();
    const b = await req.json();
    const value = String(b.key || "").trim();
    if (!value) return Response.json({ error: "키를 입력하세요." }, { status: 400 });

    // 저장 전에 실제로 되는 키인지 한 번 불러본다
    const ping = await pingKey(value);
    if (!ping.ok) return Response.json({ error: `키가 동작하지 않습니다: ${ping.reason}` }, { status: 400 });

    try {
      await db.appSetting.upsert({
        where: { key: "gemini_api_key" },
        update: { value },
        create: { key: "gemini_api_key", value },
      });
    } catch (e) {
      // 관리자 전용 화면이므로 원인을 그대로 보여준다 (표가 아직 없으면 배포가 덜 끝난 것)
      const msg = e instanceof Error ? e.message : String(e);
      return Response.json({ error: `키는 정상인데 저장에 실패했습니다: ${msg.slice(0, 200)}` }, { status: 500 });
    }
    invalidateKeyCache();
    return Response.json({ ok: true, masked: mask(value), model: ping.model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `오류: ${msg.slice(0, 200)}` }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await requireSuperAdmin();
    await db.appSetting.deleteMany({ where: { key: "gemini_api_key" } });
    invalidateKeyCache();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
