/**
 * E2E-прогон критериев приёмки против запущенного сервера.
 * Использование: npm run dev (в другом терминале), затем npm run e2e
 * Переменные: BASE_URL (по умолчанию http://localhost:3000), DEV_USER_ID.
 * Требует NEXT_PUBLIC_DEV_MODE=1 на сервере (локальный предпросмотр).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- тестовый скрипт проверяет сырые JSON-ответы */
export {}; // файл — модуль, а не глобальный скрипт

try {
  process.loadEnvFile?.();
} catch {
  /* переменные могут быть заданы снаружи */
}

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const DEV_USER = process.env.DEV_USER_ID ?? "777000001";
const AUTH = `tma dev:${DEV_USER}`;

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

async function call(
  path: string,
  init: RequestInit = {},
  opts: { noAuth?: boolean } = {}
): Promise<{ status: number; body: any }> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");
  const isInternalApi = path.startsWith("/api/app/");
  if (!opts.noAuth && !headers.has("authorization") && isInternalApi) {
    headers.set("authorization", AUTH);
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function makeAnswer(seed: string): string {
  const block = [
    `Вариант ${seed}: сначала фиксирую цифры из кейса и считаю точку безубыточности.`,
    `1. Короткий шаг: проверяю спрос замером 2 недели, бюджет 50 тысяч.`,
    `2. Второй шаг: переговоры с поставщиком о скидке 12% при объёме от 1000 штук.`,
    `3. Третий шаг: страхую риск — резервный подрядчик и запас 15% по кассе на 3 месяца.`,
    `Почему так: расчёт показывает маржу 9% против 4% у альтернативы, а риск закрыт дедлайном 14 дней и метрикой удержания 30%.`,
    `Контроль: еженедельный отчёт по выручке/день и доле повторных покупок, решение о масштабировании через месяц.`,
  ].join("\n");
  return block;
}

async function main(): Promise<void> {
  console.log(`E2E против ${BASE} (dev-юзер ${DEV_USER})\n`);

  console.log("1. Авторизация");
  const noAuth = await call("/api/app/bootstrap", {}, { noAuth: true });
  ok("без Authorization -> 401", noAuth.status === 401);
  const badAuth = await call("/api/app/bootstrap", {
    headers: { authorization: "tma 12345:fake" },
  });
  ok("фейковый initData -> 401", badAuth.status === 401);
  const boot = await call("/api/app/bootstrap");
  ok("dev-авторизация -> 200", boot.status === 200);
  ok(
    "профиль + 3 домена + кейс дня",
    boot.body?.domains?.length === 3 && !!boot.body?.dailyCase && !!boot.body?.profile,
    `уровень ${boot.body?.profile?.level}, лимит ${boot.body?.quota?.remaining}/3`
  );

  console.log("\n2. Кейсы");
  const case1 = await call("/api/app/case/1");
  ok("кейс по id -> 200", case1.status === 200);
  ok(
    "рубрика не отдаётся до ответа",
    !JSON.stringify(case1.body).includes("criteria") && !case1.body?.weight,
  );
  ok(
    "текст кейса на месте",
    typeof case1.body?.body === "string" && case1.body.body.length > 500,
  );
  const next = await call(`/api/app/case/next?domainId=${boot.body.domains[0].id}`);
  ok("next по домену -> 200", next.status === 200, `«${next.body?.title}»`);

  console.log("\n3. Попытка: валидация");
  const tooShort = await call("/api/app/attempt", {
    method: "POST",
    body: JSON.stringify({ caseId: 1, answer: "короткий ответ", startedAt: new Date().toISOString() }),
  });
  ok("ответ < 200 символов -> 400", tooShort.status === 400);

  console.log("\n4. Полный цикл: ответ -> оценка -> XP");
  const answers: { label: string }[] = [];
  const attemptIds: number[] = [];
  for (let i = 0; i < 3; i++) {
    const caseId = 1 + i;
    const startedAt = new Date(Date.now() - 150_000).toISOString();
    const res = await call("/api/app/attempt", {
      method: "POST",
      body: JSON.stringify({ caseId, answer: makeAnswer(`A${i}`), startedAt }),
    });
    ok(`попытка ${i + 1} принята (200)`, res.status === 200, `caseId=${caseId}`);
    if (res.body?.attemptId) attemptIds.push(res.body.attemptId);
    answers.push({ label: `attempt${i}` });
  }
  const detail = await call(`/api/app/attempt/${attemptIds[0]}`);
  ok(
    "результат завершён и полон",
    detail.body?.status === "completed" &&
      Array.isArray(detail.body?.criteria) &&
      detail.body.criteria.length >= 4 &&
      !!detail.body?.modelAnswer &&
      Array.isArray(detail.body?.strengths),
    `percent=${detail.body?.percent}, +${detail.body?.xpEarned} XP`,
  );
  ok(
    "процент в границах 0..100",
    typeof detail.body?.percent === "number" && detail.body.percent >= 0 && detail.body.percent <= 100,
  );

  const me1 = await call("/api/app/me");
  const firstBadge = me1.body?.badges?.find((b: { code: string }) => b.code === "first_case");
  ok(
    "бейдж first_case выдан",
    me1.status === 200 && firstBadge?.earned === true,
    `XP=${me1.body?.profile?.xpTotal}, серия=${me1.body?.profile?.streakCurrent}`,
  );
  ok(
    "история попыток ведётся",
    Array.isArray(me1.body?.attempts) && me1.body.attempts.length >= 3,
  );

  console.log("\n5. Free-лимит 3/сутки");
  const fourth = await call("/api/app/attempt", {
    method: "POST",
    body: JSON.stringify({ caseId: 5, answer: makeAnswer("A4"), startedAt: new Date().toISOString() }),
  });
  ok("4-я попытка за сутки -> 403 quota", fourth.status === 403 && fourth.body?.code === "quota");

  console.log("\n6. Лидерборд");
  const week = await call("/api/app/leaderboard?period=week");
  const all = await call("/api/app/leaderboard?period=all");
  ok(
    "неделя: топ-20 + своя позиция",
    week.status === 200 && week.body?.me !== null && week.body?.rows?.length >= 1,
    `место ${week.body?.me?.place}, XP ${week.body?.me?.xp}`,
  );
  ok("всё время: отвечает", all.status === 200 && all.body?.me !== null);

  console.log("\n7. Webhook и cron");
  const whBad = await call("/api/telegram/webhook", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "wrong" },
    body: JSON.stringify({ update_id: 1 }),
  });
  ok("webhook с неверным секретом -> 401", whBad.status === 401);
  const whOk = await call("/api/telegram/webhook", {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": process.env.TELEGRAM_WEBHOOK_SECRET ?? "" },
    body: JSON.stringify({
      update_id: 1,
      message: { chat: { id: 1 }, from: { id: 1 }, text: "/start" },
    }),
  });
  ok("webhook с верным секретом -> 200", whOk.status === 200);
  const cronBad = await call("/api/cron/daily", { method: "POST" });
  ok("cron без секрета -> 401", cronBad.status === 401);
  const cronOk = await call(`/api/cron/daily?secret=${process.env.CRON_SECRET ?? ""}`, {
    method: "POST",
  });
  ok("cron с секретом -> 200", cronOk.status === 200, JSON.stringify(cronOk.body));

  console.log(`\nИтог: ${passed} прошло, ${failed} упало`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("E2E упал с ошибкой:", e instanceof Error ? e.message : e);
  process.exit(1);
});
