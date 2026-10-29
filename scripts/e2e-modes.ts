/**
 * E2E новых флоу «Кейс-баттлов» (§11): режимы, «Три попытки», дуэли, рейтинг,
 * приватность, галерея, утечки, экспирация. Требует запущенный сервер (npm run dev).
 * Использование: npm run e2e:modes [BASE_URL]
 */
export {}; // файл — модуль, а не глобальный скрипт
/* eslint-disable @typescript-eslint/no-explicit-any -- тест проверяет сырые JSON-ответы */

try {
  process.loadEnvFile?.();
} catch {
  /* переменные могут быть заданы снаружи */
}

import { PrismaClient } from "@prisma/client";

const BASE = (process.env.BASE_URL ?? process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, extra = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

function auth(id: number): { authorization: string } {
  return { authorization: `tma dev:${id}` };
}

async function call(
  path: string,
  init: RequestInit = {},
  user?: number
): Promise<{ status: number; body: any }> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  if (user !== undefined) Object.entries(auth(user)).forEach(([k, v]) => headers.set(k, v));
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const USER = {
  constructor: 700000101,
  timers: 700000102,
  pitch: 700000103,
  three: 700000104,
  ai: 700000105,
  p1: 700000106,
  p2: 700000107,
  p3: 700000108,
  priv: 700000109,
  gallery: 700000110,
};

/** Чистим тест-юзеров прошлых прогонов — прогон идемпотентен в рамках суток. */
async function cleanup(): Promise<void> {
  const ids = await prisma.user.findMany({
    where: { telegramId: { gte: 700000000, lte: 799999999 } },
    select: { id: true },
  });
  const userIds = ids.map((u) => u.id);
  if (userIds.length === 0) return;
  await prisma.ratingMatch.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.attempt.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.duel.deleteMany({ where: { OR: [{ aUserId: { in: userIds } }, { bUserId: { in: userIds } }] } });
  await prisma.userBadge.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.reminderLog.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

const strong = (tag: string) =>
  [
    `Решение ${tag} по цифрам: считаю маржу и точку безубыточности на числах кейса.`,
    `1. Шаг: замер спроса за 2 недели, бюджет 50 000 ₽, конверсия цель 4%.`,
    `2. Шаг: переговоры с поставщиком о скидке 15% при объёме от 500 штук.`,
    `3. Шаг: страхую риск — резерв 20% кассы и запасной подрядчик на 2 недели.`,
    `Обоснование: расчёт даёт маржу 9% против 4% у альтернативы; риск закрыт планом Б.`,
    `Контроль: еженедельно выручка/день и доля повторных покупок; масштаб — через месяц.`,
  ].join("\n");

const medium = (tag: string) =>
  `Решение ${tag}: сначала разберусь с главной причиной, потом быстрые меры, потом системные. ` +
  `Попробую договориться с партнёрами о скидке, сокращу лишние расходы примерно на пятую часть. ` +
  `Добавлю пару новых каналов продаж — например, локальные чаты и сарафан. ` +
  `Если через месяц станет легче, вложусь в развитие; если нет — буду экономить дальше.`;

const weak = (tag: string) =>
  `Мне кажется, надо просто подождать ${tag} и всё само наладится, рынок вернётся. Клиенты привыкли к нам, никуда не денутся, ` +
  `конкуренты всё равно хуже. Можно немного поднять цены и нанять человека на рекламу — это точно поможет. ` +
  `Если станут жаловаться, сделаем скидку. В общем, действуем по обстановке и смотрим, что будет дальше.`;

async function main(): Promise<void> {
  console.log(`E2E-modes против ${BASE}\n`);
  await cleanup();

  // ================= 1. Конструктор =================
  console.log("1. Конструктор бизнеса");
  const rs = await call("/api/app/round/start", {
    method: "POST",
    body: JSON.stringify({ mode: "constructor", domainId: 1, difficulty: "normal", attempts: 1 }),
  }, USER.constructor);
  ok("round/start constructor -> 200", rs.status === 200);
  ok("roundId выдан", typeof rs.body?.roundId === "string" && rs.body.roundId.length > 4, rs.body?.roundId);
  const sc = rs.body?.scenario;
  ok("сценарий сгенерирован", !!sc && !!sc.title && !!sc.role && !!sc.situation);
  ok(
    "ресурсы полные",
    !!sc?.resources?.money && !!sc?.resources?.city && sc?.resources?.skills?.length > 0 && sc?.resources?.channels?.length > 0
  );
  ok("ровно 3 правила", sc?.rules?.length === 3);
  ok("missedFactors НЕ утекли", !JSON.stringify(rs.body).includes("missedFactors"));
  ok("рубрика НЕ утекла", !JSON.stringify(rs.body).includes("Реализуемость с данными ресурсами"));
  ok("таймер 480 c (8 мин)", rs.body?.timeLimitSec === 480);
  ok("лимиты ответа 300–1500", rs.body?.answerMin === 300 && rs.body?.answerMax === 1500);

  const shortC = await call("/api/app/attempt", {
    method: "POST",
    body: JSON.stringify({ roundId: rs.body.roundId, answer: "коротко" }),
  }, USER.constructor);
  ok("ответ < 300 -> 400", shortC.status === 400);

  const at1 = await call("/api/app/attempt", {
    method: "POST",
    body: JSON.stringify({ roundId: rs.body.roundId, answer: strong("CT") }),
  }, USER.constructor);
  ok("attempt раунда -> completed", at1.status === 200 && at1.body?.status === "completed");
  const det1 = await call(`/api/app/attempt/${at1.body?.attemptId}`, {}, USER.constructor);
  ok("рубрика конструктора (5 критериев)", det1.body?.criteria?.length === 5, det1.body?.criteria?.map((c: any) => c.name).join("; ").slice(0, 80));
  ok("«Что упущено» 1–4 пункта", Array.isArray(det1.body?.missed) && det1.body.missed.length >= 1 && det1.body.missed.length <= 4);
  ok("missed ≤ 12 слов", (det1.body?.missed ?? []).every((m: string) => m.split(/\s+/).length <= 12));
  ok("эталон после финальной попытки", typeof det1.body?.modelAnswer === "string");
  ok("mode=constructor в попытке", det1.body?.mode === "constructor");

  // ================= 2. Таймеры/сложность =================
  console.log("\n2. Таймеры и сложность");
  const rRescueCore = await call("/api/app/round/start", { method: "POST", body: JSON.stringify({ mode: "rescue", difficulty: "normal", domainId: 1 }) }, USER.timers);
  ok(
    "rescue (core): лёгкий кейс в блоках, ≤ 2 таблиц",
    !!rRescueCore.body?.task?.blocks?.length && (rRescueCore.body.task.blocks.filter((b: any) => b.type === "table").length <= 2),
    `блоки: ${(rRescueCore.body?.task?.blocks ?? []).map((b: any) => b.type).join(",")}`
  );
  ok("rescue (core): подсказка механики", typeof rRescueCore.body?.modeHint === "string" && rRescueCore.body.modeHint.length > 0);
  const rEasy = await call("/api/app/round/start", { method: "POST", body: JSON.stringify({ mode: "rescue", difficulty: "easy" }) }, USER.timers);
  ok("rescue easy: 360×1.2 = 432", rEasy.body?.timeLimitSec === 432);
  const rHard = await call("/api/app/round/start", { method: "POST", body: JSON.stringify({ mode: "rescue", difficulty: "hard" }) }, USER.timers);
  ok("rescue hard: 360×0.8 = 288", rHard.body?.timeLimitSec === 288);
  const rCon = await call("/api/app/round/start", { method: "POST", body: JSON.stringify({ mode: "constructor", difficulty: "normal" }) }, USER.timers);
  ok("constructor normal: 480", rCon.body?.timeLimitSec === 480);
  const rPitch = await call("/api/app/round/start", { method: "POST", body: JSON.stringify({ mode: "pitch", difficulty: "normal" }) }, USER.timers);
  ok("pitch normal: 240, ответ ≤ 1200", rPitch.body?.timeLimitSec === 240 && rPitch.body?.answerMax === 1200);
  const rBad = await call("/api/app/round/start", { method: "POST", body: JSON.stringify({ mode: "unknown" }) }, USER.timers);
  ok("неизвестный режим -> 400", rBad.status === 400);

  // ================= 3. Питч =================
  console.log("\n3. Питч инвестору");
  ok(
    "питчу выдан лёгкий core-кейс (task-блоки)",
    !!rPitch.body?.task?.blocks?.length && !rPitch.body?.scenario && !!rPitch.body?.modeHint,
    `блоки: ${(rPitch.body?.task?.blocks ?? []).map((b: any) => b.type).join(",")}`
  );
  const rPitch2 = await call("/api/app/round/start", { method: "POST", body: JSON.stringify({ mode: "pitch", difficulty: "normal" }) }, USER.pitch);
  const pitchAnswer = [
    "Крючок: пока конкуренты возят ноутбук 4 дня, мы отдаём «сегодня» — и за это платят.",
    "Проблема: район хочет забрать сразу, а маркетплейсы заставляют ждать и теряют до трети заказов.",
    "Решение: Telegram-магазин + точка выдачи у метро + курьер за 2 часа силами двух студентов.",
    "Рынок: 40 000 домохозяйств района, целевая доля 1,5% в год, средний чек 8 500 ₽ — это 5,1 млн ₽ оборота.",
    "Экономика: маржа 22%, CAC 350 ₽ через локальные чаты, первый повтор на 3-й неделе.",
    "Ask: 450 000 ₽ на полгода — склад, терминал и первая партия; выходим в ноль на 5-й месяц.",
  ].join("\n");
  const pitchAt = await call("/api/app/attempt", {
    method: "POST",
    body: JSON.stringify({ roundId: rPitch2.body.roundId, answer: pitchAnswer }),
  }, USER.pitch);
  ok("питч-попытка completed", pitchAt.status === 200 && pitchAt.body?.status === "completed");
  const pitchDet = await call(`/api/app/attempt/${pitchAt.body?.attemptId}`, {}, USER.pitch);
  const pitchCrit = (pitchDet.body?.criteria ?? []).map((c: any) => c.name);
  ok(
    "рубрика питча (4 критерия: ясность/цифры/ask/возражения)",
    pitchCrit.length === 4 && pitchCrit.some((n: string) => n.includes("Ask")) && pitchCrit.some((n: string) => n.includes("Ясность"))
  );

  // ================= 4. Три попытки =================
  console.log("\n4. «Три попытки»");
  const r3 = await call("/api/app/round/start", {
    method: "POST",
    body: JSON.stringify({ mode: "classic", domainId: 1, difficulty: "normal", attempts: 3 }),
  }, USER.three);
  ok("раунд с 3 попытками создан", r3.status === 200 && r3.body?.attempts === 3 && r3.body?.roundId?.endsWith("-a3"));

  const a1 = await call("/api/app/attempt", { method: "POST", body: JSON.stringify({ roundId: r3.body.roundId, answer: medium("T1") }) }, USER.three);
  const d1 = await call(`/api/app/attempt/${a1.body?.attemptId}`, {}, USER.three);
  ok("попытка 1 зачтена", a1.body?.status === "completed");
  ok("эталон СКРЫТ между попытками", d1.body?.modelAnswer === null && d1.body?.attemptsLeft === 2);
  ok("«что упущено» доступно между попытками", Array.isArray(d1.body?.missed) && d1.body.missed.length > 0);

  const a2 = await call("/api/app/attempt", { method: "POST", body: JSON.stringify({ roundId: r3.body.roundId, answer: strong("T2") }) }, USER.three);
  const d2 = await call(`/api/app/attempt/${a2.body?.attemptId}`, {}, USER.three);
  ok("попытка 2 (лучшая) зачтена", a2.body?.status === "completed");
  ok("лучшая = max(percent)", d2.body?.roundBestPercent === Math.max(d1.body.percent, d2.body.percent));
  ok("isBest на лучшей попытке", d2.body?.isBest === (d2.body.percent >= d1.body.percent));

  const a3 = await call("/api/app/attempt", { method: "POST", body: JSON.stringify({ roundId: r3.body.roundId, answer: weak("T3") }) }, USER.three);
  const d3 = await call(`/api/app/attempt/${a3.body?.attemptId}`, {}, USER.three);
  ok("попытка 3 (слабая) зачтена", a3.body?.status === "completed");
  ok("эталон открыт после финальной", typeof d3.body?.modelAnswer === "string" && d3.body?.attemptsLeft === 0);

  const a4 = await call("/api/app/attempt", { method: "POST", body: JSON.stringify({ roundId: r3.body.roundId, answer: strong("T4") }) }, USER.three);
  ok("4-я попытка -> 409", a4.status === 409);

  const roundAttempts = await prisma.attempt.findMany({
    where: { roundId: r3.body.roundId, status: "completed" },
    select: { percent: true, xpEarned: true, isBest: true },
  });
  const best = Math.max(...roundAttempts.map((x) => x.percent ?? 0));
  const sumXp = roundAttempts.reduce((s, x) => s + x.xpEarned, 0);
  const baseFor = (p: number) => (p >= 85 ? 60 : p >= 70 ? 45 : p >= 50 ? 30 : 15);
  ok(
    "XP начислен один раз по лучшей (+бонус первого за день)",
    sumXp === baseFor(best) + 10,
    `сумма ${sumXp} = base(${baseFor(best)}) + 10`
  );
  const me3 = await call("/api/app/me", {}, USER.three);
  ok("квота списана как 1 раунд (не 3 попытки)", me3.body?.quota?.usedToday === 1);

  // ================= 5. AI-дуэль =================
  console.log("\n5. AI-дуэль");
  const caseNext = await call("/api/app/case/next?domainId=1", {}, USER.ai);
  const duelCreate = await call("/api/app/duel/ai", {
    method: "POST",
    body: JSON.stringify({ caseId: caseNext.body.id, mode: "classic", style: "analyst", difficulty: "normal" }),
  }, USER.ai);
  ok("duel/ai создана", duelCreate.status === 200 && typeof duelCreate.body?.duelId === "number");
  const duelBefore = await call(`/api/app/duel/${duelCreate.body.duelId}`, {}, USER.ai);
  ok("до ответа: соперник скрыт", duelBefore.body?.b == null && duelBefore.body?.a == null && duelBefore.body?.status === "open");
  const solveShort = await call(`/api/app/duel/${duelCreate.body.duelId}/solve`, {
    method: "POST",
    body: JSON.stringify({ answer: "мимо" }),
  }, USER.ai);
  ok("короткий ответ в дуэли -> 400", solveShort.status === 400);
  const solve = await call(`/api/app/duel/${duelCreate.body.duelId}/solve`, {
    method: "POST",
    body: JSON.stringify({ answer: strong("AI"), startedAt: new Date(Date.now() - 150000).toISOString() }),
  }, USER.ai);
  ok("ответ принят", solve.status === 200);
  const duelAfter = await call(`/api/app/duel/${duelCreate.body.duelId}`, {}, USER.ai);
  ok("дуэль завершена", duelAfter.body?.status === "finished");
  const rivalPercent = duelAfter.body?.b?.percent;
  const myPercent = duelAfter.body?.a?.percent;
  ok("обе стороны оценены (проценты)", typeof rivalPercent === "number" && typeof myPercent === "number", `я ${myPercent}% vs ии ${rivalPercent}%`);
  ok("ответ соперника 500+ символов", (duelAfter.body?.b?.answer?.length ?? 0) >= 500, `${duelAfter.body?.b?.answer?.length} симв.`);
  const expectedVerdict = Math.abs(myPercent - rivalPercent) < 3 ? "draw" : myPercent > rivalPercent ? "me" : "rival";
  ok("вердикт корректен (ничья при Δ<3)", duelAfter.body?.verdict === expectedVerdict, `verdict=${duelAfter.body?.verdict}`);
  const aiUserRow = await prisma.user.findUnique({ where: { telegramId: USER.ai } });
  const rmRows = await prisma.ratingMatch.findMany({ where: { userId: aiUserRow!.id, duelId: duelCreate.body.duelId } });
  ok("RatingMatch записан", rmRows.length === 1 && rmRows[0].after === rmRows[0].before + rmRows[0].delta, `delta=${rmRows[0]?.delta}`);
  const bootAi = await call("/api/app/bootstrap", {}, USER.ai);
  ok("бейдж лиги в профиле", !!bootAi.body?.profile?.league?.title, `${bootAi.body?.profile?.league?.title}, рейтинг ${bootAi.body?.profile?.rating}`);
  const meAi = await call("/api/app/me", {}, USER.ai);
  const winXpOk =
    duelAfter.body.verdict === "me"
      ? (meAi.body?.profile?.xpTotal ?? 0) >= (duelAfter.body?.a?.xpEarned ?? 0) + 20
      : true;
  ok("победа: XP с бонусом +20", winXpOk, `xpTotal=${meAi.body?.profile?.xpTotal}`);
  ok("бейдж first_duel выдан", meAi.body?.badges?.some((b: any) => b.code === "first_duel" && b.earned));
  const solveAgain = await call(`/api/app/duel/${duelCreate.body.duelId}/solve`, {
    method: "POST",
    body: JSON.stringify({ answer: strong("AI2") }),
  }, USER.ai);
  ok("повторный ответ в дуэль -> 409", solveAgain.status === 409);

  // ================= 6. PvP-дуэль =================
  console.log("\n6. PvP-дуэль (два аккаунта)");
  const pvp = await call("/api/app/duel/create", {
    method: "POST",
    body: JSON.stringify({ domainId: 2, mode: "rescue" }),
  }, USER.p1);
  ok("вызов создан", pvp.status === 200 && typeof pvp.body?.duelId === "number");
  ok("deep link или подсказка", typeof pvp.body?.link === "string" || typeof pvp.body?.linkHint === "string");
  const pvpBefore = await call(`/api/app/duel/${pvp.body.duelId}`, {}, USER.p2);
  ok("чужой видит кейс, но не ответы", pvpBefore.body?.case?.body && pvpBefore.body?.a == null && pvpBefore.body?.b == null);
  const s1 = await call(`/api/app/duel/${pvp.body.duelId}/solve`, {
    method: "POST",
    body: JSON.stringify({ answer: strong("P1") }),
  }, USER.p1);
  ok("автор ответил", s1.status === 200);
  const midState = await call(`/api/app/duel/${pvp.body.duelId}`, {}, USER.p2);
  ok("до финала ответ автора скрыт", midState.body?.a?.answer == null && midState.body?.status !== "finished");
  const s2 = await call(`/api/app/duel/${pvp.body.duelId}/solve`, {
    method: "POST",
    body: JSON.stringify({ answer: medium("P2") }),
  }, USER.p2);
  ok("соперник ответил -> finished", s2.status === 200 && s2.body?.duelStatus === "finished");
  const finState = await call(`/api/app/duel/${pvp.body.duelId}`, {}, USER.p2);
  ok("оба ответа видны после финала", typeof finState.body?.a?.answer === "string" && typeof finState.body?.b?.answer === "string");
  const p1Row = await prisma.user.findUnique({ where: { telegramId: USER.p1 } });
  const p2Row = await prisma.user.findUnique({ where: { telegramId: USER.p2 } });
  ok("рейтинги изменились у обоих", p1Row!.rating !== 1000 || p2Row!.rating !== 1000, `P1 ${p1Row!.rating}, P2 ${p2Row!.rating}`);
  const outsider = await call(`/api/app/duel/${pvp.body.duelId}/solve`, {
    method: "POST",
    body: JSON.stringify({ answer: strong("P3") }),
  }, USER.p3);
  ok("третьим в дуэль нельзя (403)", outsider.status === 403);

  // ================= 7. Экспирация =================
  console.log("\n7. Экспирация 48 ч");
  const exp = await call("/api/app/duel/create", { method: "POST", body: JSON.stringify({ domainId: 3, mode: "classic" }) }, USER.p1);
  await prisma.duel.update({
    where: { id: exp.body.duelId },
    data: { expiresAt: new Date(Date.now() - 3600_000) },
  });
  const cronBad = await call("/api/cron/duels", { method: "POST" });
  ok("cron/duels без секрета -> 401", cronBad.status === 401);
  const cronOk = await call(`/api/cron/duels?secret=${process.env.CRON_SECRET ?? ""}`, { method: "POST" });
  ok("cron/duels с секретом -> 200", cronOk.status === 200 && cronOk.body?.ok === true, `expired=${cronOk.body?.expired}`);
  const expState = await call(`/api/app/duel/${exp.body.duelId}`, {}, USER.p1);
  ok("дуэль истекла (status=expired)", expState.body?.status === "expired");

  // ================= 8. Приватность =================
  console.log("\n8. Приватность");
  const privRound = await call("/api/app/round/start", { method: "POST", body: JSON.stringify({ mode: "classic", domainId: 1, difficulty: "normal" }) }, USER.priv);
  const privAt = await call("/api/app/attempt", { method: "POST", body: JSON.stringify({ roundId: privRound.body.roundId, answer: strong("PV") }) }, USER.priv);
  ok("приватный юзер решил раунд", privAt.body?.status === "completed");
  const setPriv = await call("/api/app/me", { method: "POST", body: JSON.stringify({ profilePublic: false }) }, USER.priv);
  ok("тумблер приватности работает", setPriv.status === 200 && setPriv.body?.profilePublic === false);
  const weekLbPriv = await call("/api/app/leaderboard?period=week", {}, USER.priv);
  ok("скрыт из недельного топа (своей строки нет)", weekLbPriv.body?.me === null, `me=${JSON.stringify(weekLbPriv.body?.me)}`);
  const privUserRow = await prisma.user.findUnique({ where: { telegramId: USER.priv } });
  ok("в топах его нет (по profilePublic)", !(await prisma.user.findFirst({ where: { id: privUserRow!.id, profilePublic: true } })));
  const leagueLb = await call("/api/app/leaderboard?period=league", {}, USER.priv);
  ok("лига отвечает + своя позиция", leagueLb.body?.me !== null && leagueLb.body?.period === "league");
  const gal = await call(`/api/app/gallery?caseId=${privRound.body.case.id}`, {}, USER.gallery);
  ok(
    "скрыт из галереи (его попытки нет)",
    !gal.body?.items?.some((i: any) => i.attemptId === privAt.body?.attemptId)
  );
  const mePriv = await call("/api/app/me", {}, USER.priv);
  ok("своя статистика цела", mePriv.body?.profile?.xpTotal > 0 && mePriv.body?.attempts?.length >= 1);
  const setPub = await call("/api/app/me", { method: "POST", body: JSON.stringify({ profilePublic: true }) }, USER.priv);
  ok("вернул публичность", setPub.body?.profilePublic === true);

  // ================= 9. Галерея =================
  console.log("\n9. Галерея лучших ответов");
  const gal2 = await call(`/api/app/gallery?caseId=${caseNext.body.id}`, {}, USER.gallery);
  ok("галерея кейса отвечает", gal2.status === 200 && Array.isArray(gal2.body?.items));
  ok("топ не больше 5", gal2.body.items.length <= 5);
  const percents = gal2.body.items.map((i: any) => i.percent);
  ok("отсортировано по убыванию", percents.every((p: number, i: number) => i === 0 || percents[i - 1] >= p));
  ok("есть текст ответа и критерии", gal2.body.items.every((i: any) => i.answer?.length > 100 && i.criteria?.length >= 4));
  const myGal = await call("/api/app/gallery?userId=me", {}, USER.gallery);
  ok("«мои публичные ответы» отвечают", myGal.status === 200 && Array.isArray(myGal.body?.items));

  // ================= 10. Дрон и метаполя =================
  console.log("\n10. Синт-дрон и метаполя");
  const bootG = await call("/api/app/bootstrap", {}, USER.gallery);
  ok("первый вход: заряд 50", bootG.body?.profile?.mascot?.charge === 50, `charge=${bootG.body?.profile?.mascot?.charge}`);
  ok("режимы в bootstrap", (bootG.body?.modes?.length ?? 0) === 4);
  ok("рейтинг по умолчанию 1000", bootG.body?.profile?.rating === 1000);

  console.log(`\nИтог: ${passed} прошло, ${failed} упало`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("E2E-modes упал:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
