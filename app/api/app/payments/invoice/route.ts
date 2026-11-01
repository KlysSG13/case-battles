import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findSku, buildPayload } from "@/lib/catalog";
import { mskDayStartUtc } from "@/lib/msk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVOICE_RATE_LIMIT = 10; // ≤ 10 инвойсов/сутки/юзер

/** POST /api/app/payments/invoice {sku} → {link} (Telegram Stars, XTR). */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const user = auth.user;

  const body = (await req.json().catch(() => null)) as { sku?: string } | null;
  const item = body?.sku ? findSku(body.sku) : undefined;
  if (!item || item.stars <= 0) {
    return NextResponse.json({ error: "Товар не найден или не продаётся", code: "bad_sku" }, { status: 400 });
  }

  // rate-limit проверяется ДО доступности бота: лимит денег важнее диагностики
  // (запись на каждый инвойс не заводим — считаем оплаченные платежи за сутки)
  const todayPayments = await prisma.payment.count({
    where: { userId: user.id, createdAt: { gte: mskDayStartUtc() } },
  });
  if (todayPayments >= INVOICE_RATE_LIMIT) {
    return NextResponse.json(
      { error: "Слишком много платёжных запросов за сутки", code: "invoice_rate" },
      { status: 429 }
    );
  }

  const token = process.env.BOT_TOKEN ?? "";
  if (!token) {
    return NextResponse.json(
      { error: "Платежи недоступны: бот не настроен", code: "bot_unconfigured" },
      { status: 503 }
    );
  }

  const payload = buildPayload(item.sku, user.telegramId);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/createInvoiceLink`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: item.title,
        description: item.description,
        payload,
        provider_token: "", // Stars: провайдер не нужен
        currency: "XTR",
        prices: [{ label: item.title, amount: item.stars }],
      }),
    });
    const data = (await res.json()) as { ok?: boolean; result?: string; description?: string };
    if (data?.ok !== true || !data.result) {
      return NextResponse.json(
        { error: "Не удалось создать платёжную ссылку", code: "invoice_failed" },
        { status: 502 }
      );
    }
    return NextResponse.json({ link: data.result, sku: item.sku, stars: item.stars });
  } catch {
    return NextResponse.json(
      { error: "Платёжный сервис недоступен", code: "invoice_network" },
      { status: 502 }
    );
  }
}
