import type { Prisma, User } from "@prisma/client";
import { prisma } from "./prisma";
import { findSku, parsePayload } from "./catalog";
import { extendProUntil } from "./entitlements";

type Tx = Prisma.TransactionClient;

export interface SuccessfulPaymentInput {
  fromId: number; // message.from.id — сверяется с payload.userId
  payload: string;
  stars: number; // total_amount из Telegram
  telegramPaymentChargeId: string;
  providerPaymentChargeId?: string | null;
}

export type ApplyResult =
  | { ok: true; sku: string; kind: string; alreadyApplied: boolean }
  | { ok: false; reason: "bad_payload" | "bad_sku" | "user_mismatch" | "price_mismatch" };

/**
 * Зачисление успешного платежа — в одной транзакции, идемпотентно по
 * telegramPaymentChargeId (уникальный ключ; повтор молча игнорируется).
 * Сервер — единственный источник истины: цена сверяется с каталогом.
 */
export async function applySuccessfulPayment(
  input: SuccessfulPaymentInput,
  tx: Tx = prisma
): Promise<ApplyResult> {
  const parsed = parsePayload(input.payload);
  if (!parsed) return { ok: false, reason: "bad_payload" };
  const item = findSku(parsed.sku);
  if (!item) return { ok: false, reason: "bad_sku" };
  if (parsed.userId !== input.fromId) return { ok: false, reason: "user_mismatch" };
  if (input.stars !== item.stars) return { ok: false, reason: "price_mismatch" };

  // идемпотентность: дубль chargeId не даёт двойного зачисления
  const existing = await tx.payment.findUnique({
    where: { telegramPaymentChargeId: input.telegramPaymentChargeId },
    select: { id: true },
  });
  if (existing) {
    return { ok: true, sku: item.sku, kind: item.kind, alreadyApplied: true };
  }

  const user = await tx.user.findUnique({ where: { telegramId: input.fromId } });
  if (!user) return { ok: false, reason: "user_mismatch" };

  await tx.payment.create({
    data: {
      userId: user.id,
      sku: item.sku,
      kind: item.kind,
      stars: item.stars,
      payload: input.payload,
      telegramPaymentChargeId: input.telegramPaymentChargeId,
      providerPaymentChargeId: input.providerPaymentChargeId ?? null,
      status: "paid",
    },
  });

  await grantEntitlement(item, user, tx);
  return { ok: true, sku: item.sku, kind: item.kind, alreadyApplied: false };
}

/** Выдача права по kind (внутри той же транзакции, что и Payment). */
export async function grantEntitlement(
  item: { sku: string; kind: string; slot?: "skin" | "aura" },
  user: User,
  tx: Tx
): Promise<void> {
  if (item.kind === "pro30") {
    await tx.user.update({
      where: { id: user.id },
      data: { proUntil: extendProUntil(user.proUntil, 30) },
    });
  } else if (item.kind === "hints") {
    await tx.user.update({
      where: { id: user.id },
      data: { hintsBalance: { increment: 10 } }, // покупки без капа
    });
  } else if (item.kind === "cosmetic") {
    await tx.userCosmetic.upsert({
      where: { userId_sku: { userId: user.id, sku: item.sku } },
      create: { userId: user.id, sku: item.sku, source: "purchase" },
      update: {},
    });
  }
}

/** Возврат: refundStarPayment + пометка refunded; косметика отзывается. */
export async function refundPayment(chargeId: string): Promise<
  | { ok: true; refunded: true; sku: string; userId: number }
  | { ok: true; refunded: false; reason: "already_refunded" }
  | { ok: false; reason: "not_found" | "bot_token_missing" }
> {
  const token = process.env.BOT_TOKEN ?? "";
  if (!token) return { ok: false, reason: "bot_token_missing" };
  const payment = await prisma.payment.findUnique({
    where: { telegramPaymentChargeId: chargeId },
  });
  if (!payment) return { ok: false, reason: "not_found" };
  if (payment.status === "refunded") return { ok: true, refunded: false, reason: "already_refunded" };

  const user = await prisma.user.findUniqueOrThrow({ where: { id: payment.userId } });
  const res = await fetch(`https://api.telegram.org/bot${token}/refundStarPayment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: user.telegramId,
      telegram_payment_charge_id: chargeId,
    }),
  });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (body?.ok !== true) {
    throw new Error(`refundStarPayment отклонён: ${body?.description ?? res.status}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "refunded", refundedAt: new Date() },
    });
    if (payment.kind === "cosmetic") {
      await tx.userCosmetic.deleteMany({ where: { userId: user.id, sku: payment.sku } });
      const patch: { equippedSkin?: string | null; equippedAura?: string | null } = {};
      if (user.equippedSkin === payment.sku) patch.equippedSkin = null;
      if (user.equippedAura === payment.sku) patch.equippedAura = null;
      if (Object.keys(patch).length > 0) {
        await tx.user.update({ where: { id: user.id }, data: patch });
      }
    }
    // proUntil и подсказки ретроактивно не отзываем
  });
  return { ok: true, refunded: true, sku: payment.sku, userId: user.telegramId };
}
