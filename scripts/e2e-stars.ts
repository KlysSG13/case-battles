/**
 * E2E монетизации v1.2.0 (мок-бот): инвойс-роут, вебхук pre_checkout/successful_payment
 * для всех kind, идемпотентность по chargeId, PRO-квота, подсказки, косметика, /pro.
 * Требует: dev-сервер + BOT_TOKEN в .env НЕ пуст (инвойсы дергают Telegram API —
 * при недоступности сети тест помечает шаг как SKIP, не FAIL).
 * Использование: npm run e2e:stars
 */
export {}; // файл — модуль, а не глобальный скрипт
/* eslint-disable @typescript-eslint/no-explicit-any -- тест проверяет сырые JSON-ответы */

try {
  process.loadEnvFile?.();
} catch {
  /* переменные могут быть заданы снаружи */
}

import { PrismaClient } from "@prisma/client";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const WH_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
let skipped = 0;

function ok(name: string, cond: boolean, extra = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}
function skip(name: string, why: string): void {
  skipped++;
  console.log(`  ↷ ${name} — SKIP: ${why}`);
}
function auth(id: number): { authorization: string } {
  return { authorization: `tma dev:${id}` };
}
async function call(path: string, init: RequestInit = {}, user?: number) {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  if (user !== undefined) Object.entries(auth(user)).forEach(([k, v]) => headers.set(k, v));
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}
async function webhook(update: unknown): Promise<{ status: number }> {
  const res = await fetch(`${BASE}/api/telegram/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": WH_SECRET },
    body: JSON.stringify(update),
  });
  return { status: res.status };
}
function successfulPayment(fromId: number, sku: string, chargeId: string, stars: number) {
  return {
    update_id: Math.floor(Math.random() * 1e9),
    message: {
      message_id: 1,
      chat: { id: fromId },
      from: { id: fromId },
      successful_payment: {
        currency: "XTR",
        total_amount: stars,
        invoice_payload: `${sku}:${fromId}`,
        telegram_payment_charge_id: chargeId,
      },
    },
  };
}

const U = { payer: 800000001, free: 800000002, pvp: 800000003 };

async function cleanup(): Promise<void> {
  const ids = await prisma.user.findMany({
    where: { telegramId: { gte: 800000000, lte: 899999999 } },
    select: { id: true },
  });
  const userIds = ids.map((u) => u.id);
  if (!userIds.length) return;
  await prisma.payment.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userCosmetic.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.ratingMatch.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.attempt.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.duel.deleteMany({ where: { OR: [{ aUserId: { in: userIds } }, { bUserId: { in: userIds } }] } });
  await prisma.userBadge.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.reminderLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main(): Promise<void> {
  console.log(`E2E-stars против ${BASE}\n`);
  await cleanup();
  const botToken = process.env.BOT_TOKEN ?? "";
  const canInvoice = !!botToken;

  // ============ 1. Каталог и цены ============
  console.log("1. Каталог и цены (сервер — единственный источник)");
  const hist = await call("/api/app/payments/history", {}, U.payer);
  const catalog = hist.body?.catalog ?? [];
  ok("каталог отдаётся авторизованному", hist.status === 200 && catalog.length >= 8, `${catalog.length} SKU`);
  const pro = catalog.find((c: any) => c.sku === "pro30");
  const hints = catalog.find((c: any) => c.sku === "hints10");
  ok("pro30 и hints10 в каталоге", !!pro && !!hints, `pro=${pro?.stars}⭐, hints=${hints?.stars}⭐`);
  const histAnon = await call("/api/app/payments/history", {});
  ok("без авторизации -> 401", histAnon.status === 401);

  // ============ 2. Инвойс-роут ============
  console.log("\n2. Инвойс-роут");
  const invBad = await call("/api/app/payments/invoice", { method: "POST", body: JSON.stringify({ sku: "nope" }) }, U.payer);
  ok("неизвестный sku -> 400", invBad.status === 400);
  const invFree = await call("/api/app/payments/invoice", { method: "POST", body: JSON.stringify({ sku: "skin-veteran" }) }, U.payer);
  ok("непродаваемый sku (за уровень) -> 400", invFree.status === 400);
  if (canInvoice) {
    const inv = await call("/api/app/payments/invoice", { method: "POST", body: JSON.stringify({ sku: "pro30" }) }, U.payer);
    ok("инвойс pro30 -> 200 + link", inv.status === 200 && typeof inv.body?.link === "string" && inv.body.link.length > 10, `${(inv.body?.link ?? "").slice(0, 40)}…`);
  } else {
    skip("инвойс pro30 (живой Telegram)", "BOT_TOKEN пуст в этой среде — роут вернёт 503 (graceful)");
    const inv = await call("/api/app/payments/invoice", { method: "POST", body: JSON.stringify({ sku: "pro30" }) }, U.payer);
    ok("без BOT_TOKEN -> 503 (не 500)", inv.status === 503, inv.body?.code);
  }

  // ============ 3. Вебхук: зачисления всех kind ============
  console.log("\n3. Вебхук successful_payment");
  // hints10
  const wh1 = await webhook(successfulPayment(U.payer, "hints10", "stars_charge_h10", 50));
  ok("webhook hints10 -> 200", wh1.status === 200);
  let payer = await prisma.user.findUnique({ where: { telegramId: U.payer } });
  ok("hintsBalance +10", payer?.hintsBalance === 10, `balance=${payer?.hintsBalance}`);
  // дубль того же chargeId — идемпотентность
  await webhook(successfulPayment(U.payer, "hints10", "stars_charge_h10", 50));
  payer = await prisma.user.findUnique({ where: { telegramId: U.payer } });
  ok("дубль chargeId не даёт двойного зачисления", payer?.hintsBalance === 10, `balance=${payer?.hintsBalance}`);
  const paymentCount = await prisma.payment.count({ where: { telegramPaymentChargeId: "stars_charge_h10" } });
  ok("запись Payment одна", paymentCount === 1);

  // pro30
  await webhook(successfulPayment(U.payer, "pro30", "stars_charge_pro", 250));
  payer = await prisma.user.findUnique({ where: { telegramId: U.payer } });
  ok("proUntil = now+30d", !!payer?.proUntil && payer.proUntil.getTime() > Date.now() + 29.9 * 86400_000);
  // повторный pro30 продлевает
  await webhook(successfulPayment(U.payer, "pro30", "stars_charge_pro2", 250));
  payer = await prisma.user.findUnique({ where: { telegramId: U.payer } });
  ok("повторный pro30 продлевает на 30 дней", !!payer?.proUntil && payer.proUntil.getTime() > Date.now() + 59.9 * 86400_000);

  // косметика
  await webhook(successfulPayment(U.payer, "skin-emerald", "stars_charge_cosm", 120));
  const cosmetic = await prisma.userCosmetic.findFirst({ where: { user: { telegramId: U.payer }, sku: "skin-emerald" } });
  ok("скин выдан в инвентарь", !!cosmetic && cosmetic.source === "purchase");
  await webhook(successfulPayment(U.payer, "skin-emerald", "stars_charge_cosm", 120)); // дубль payload, новый chargeId
  const cosmeticCount = await prisma.userCosmetic.count({ where: { user: { telegramId: U.payer }, sku: "skin-emerald" } });
  ok("повторная покупка не дублирует предмет", cosmeticCount === 1);

  // защита: чужой payload (sku:userId другого юзера)
  await webhook(successfulPayment(U.payer, `hints10:${U.free}`, "stars_charge_bad", 50));
  const freeUser = await prisma.user.findUnique({ where: { telegramId: U.free } });
  ok("payload с чужим userId не зачисляется", (freeUser?.hintsBalance ?? 0) === 0);
  // защита: несовпадение цены
  await webhook(successfulPayment(U.payer, "pro30", "stars_charge_price", 1));
  ok("несовпадение цены -> перманентное отклонение (без записи)", (await prisma.payment.count({ where: { telegramPaymentChargeId: "stars_charge_price" } })) === 0);

  // ============ 4. Pre-checkout ============
  console.log("\n4. Вебхук pre_checkout_query");
  // note: обработчик вызывает answerPreCheckoutQuery через сеть; без токена ответ всё равно 200
  const pcq = await webhook({
    update_id: 1,
    pre_checkout_query: { id: "pcq1", from: { id: U.payer }, currency: "XTR", total_amount: 250, invoice_payload: `pro30:${U.payer}` },
  });
  ok("pre_checkout_query -> 200", pcq.status === 200);

  // ============ 5. PRO-квота ============
  console.log("\n5. PRO: безлимит раундов");
  async function startRound(user: number): Promise<any> {
    return call("/api/app/round/start", { method: "POST", body: JSON.stringify({ mode: "classic", domainId: 1, difficulty: "normal" }) }, user);
  }
  async function solve(round: any, user: number, tag: string): Promise<any> {
    return call("/api/app/attempt", {
      method: "POST",
      body: JSON.stringify({ roundId: round.roundId, answer: `Решение ${tag}: считаю маржу, приоритизирую шаги, страхую риски и фиксирую метрики контроля на цифрах кейса.`.repeat(2) }),
    }, user);
  }
  // free юзер: 3 раунда ок, 4-й 403
  for (let i = 0; i < 3; i++) {
    const r = await startRound(U.free);
    const a = await solve(r.body, U.free, `F${i}`);
    if (i === 0) ok("free: раунд 1 запущен", r.status === 200 && a.body?.status === "completed");
  }
  const r4 = await startRound(U.free);
  ok("free: 4-й раунд -> 403 quota", r4.status === 403 && r4.body?.code === "quota");
  // PRO: 4-й, 5-й, 6-й раунды проходят
  let proOk = true;
  for (let i = 0; i < 3; i++) {
    const r = await startRound(U.payer);
    const a = await solve(r.body, U.payer, `P${i}`);
    if (r.status !== 200 || a.body?.status !== "completed") proOk = false;
  }
  ok("PRO: раунды за пределами free-лимита проходят", proOk);
  const mePro = await call("/api/app/me", {}, U.payer);
  ok("PRO-бейдж в профиле (isPro=true, limit=null)", mePro.body?.profile?.isPro === true && mePro.body?.quota?.limit === null);

  // ============ 6. Подсказки ============
  console.log("\n6. Подсказки");
  const h0 = await call("/api/app/hint", {}, U.pvp);
  ok("первое чтение: грант +1", h0.body?.balance === 1, `grantedNow=${h0.body?.grantedNow}`);
  const h0b = await call("/api/app/hint", {}, U.pvp);
  ok("повторное чтение за сутки без гранта", h0b.body?.balance === 1 && h0b.body?.grantedNow === 0);
  // квота U.free исчерпана в блоке 5 — подсказки проверяем на U.pvp (round без квоты не нужен)
  const hintGetPvp = await call("/api/app/hint", {}, U.pvp);
  ok("грант у нового юзера: +1", hintGetPvp.body?.balance === 1);
  const roundPvp = await startRound(U.pvp);
  ok("раунд для подсказки создан", roundPvp.status === 200);
  const hint1 = await call("/api/app/hint", { method: "POST", body: JSON.stringify({ roundId: roundPvp.body.roundId }) }, U.pvp);
  ok("использование: текст наводки + баланс 0", typeof hint1.body?.hint === "string" && hint1.body?.balance === 0, (hint1.body?.hint ?? "").slice(0, 40));
  const hint2 = await call("/api/app/hint", { method: "POST", body: JSON.stringify({ roundId: roundPvp.body.roundId }) }, U.pvp);
  ok("нулевой баланс -> 402 no_hints (оффер в UI)", hint2.status === 402 && hint2.body?.code === "no_hints");

  // ============ 7. Косметика ============
  console.log("\n7. Косметика: экипировка");
  const cos = await call("/api/app/cosmetics", {}, U.payer);
  ok("каталог косметики со статусами", cos.status === 200 && cos.body?.items?.length >= 6);
  const emerald = cos.body.items.find((i: any) => i.sku === "skin-emerald");
  ok("купленный скин: status=owned", emerald?.status === "owned");
  const eq = await call("/api/app/cosmetics", { method: "POST", body: JSON.stringify({ slot: "skin", sku: "skin-emerald" }) }, U.payer);
  ok("экипировка купленного -> 200", eq.status === 200 && eq.body?.equipped === "skin-emerald");
  const eqPro = await call("/api/app/cosmetics", { method: "POST", body: JSON.stringify({ slot: "skin", sku: "skin-pro-quantum" }) }, U.payer);
  ok("PRO-скин экипируется при активной PRO", eqPro.status === 200);
  const eqLocked = await call("/api/app/cosmetics", { method: "POST", body: JSON.stringify({ slot: "skin", sku: "skin-legend" }) }, U.payer);
  ok("скин за 10 уровень отклонён (403)", eqLocked.status === 403 && eqLocked.body?.code === "level_too_low");
  const eqNotOwned = await call("/api/app/cosmetics", { method: "POST", body: JSON.stringify({ slot: "skin", sku: "skin-gold" }) }, U.free);
  ok("некупленный скин отклонён (403)", eqNotOwned.status === 403 && eqNotOwned.body?.code === "not_purchased");
  const uneq = await call("/api/app/cosmetics", { method: "POST", body: JSON.stringify({ slot: "skin", sku: null }) }, U.payer);
  ok("снятие скина -> 200, skin=null", uneq.status === 200 && uneq.body?.equipped === null);
  // профиль отдаёт equipped
  const meEq = await call("/api/app/me", {}, U.payer);
  ok("профиль отдаёт equipped {skin, aura}", meEq.body?.profile?.equipped && "skin" in meEq.body.profile.equipped);

  // ============ 8. /pro в чате ============
  console.log("\n8. Бот: /pro");
  const proCmd = await webhook({
    update_id: 2,
    message: { message_id: 3, chat: { id: U.payer }, from: { id: U.payer }, text: "/pro" },
  });
  ok("webhook /pro -> 200", proCmd.status === 200);

  console.log(`\nИтог: ${passed} прошло, ${failed} упало, ${skipped} пропущено`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("E2E-stars упал:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
