import { NextRequest, NextResponse } from "next/server";
import { handleUpdate } from "@/lib/telegram-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "server not configured" }, { status: 503 });
  }
  const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (headerSecret !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as unknown;
  if (update) {
    try {
      await handleUpdate(update as Parameters<typeof handleUpdate>[0]);
    } catch (e) {
      // ошибка обработки не должна ломать webhook — Telegram всё равно получит 200
      console.error("webhook handler error:", e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ ok: true });
}
