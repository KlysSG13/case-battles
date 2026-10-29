/**
 * deploy-check — преддеплойная проверка:
 *   1. WEBAPP_URL доступен (HTTPS для публичных адресов; http разрешён только localhost)
 *   2. /api/health отвечает 200 (приложение живо, БД на связи)
 *   3. BOT_TOKEN валиден (getMe)
 *   4. Webhook установлен на WEBAPP_URL/api/telegram/webhook (getWebhookInfo)
 *   5. next start поднимается (--start: сборка при необходимости + локальный запуск + проверка)
 *
 * Использование:
 *   npm run deploy-check                          # проверять WEBAPP_URL из .env
 *   npm run deploy-check -- --url https://x.ru    # другой адрес
 *   npm run deploy-check -- --start               # поднять next start локально и проверить его
 *   npm run deploy-check -- --start --port 3100   # свой порт
 *   npm run deploy-check -- --skip-build          # с --start не пересобирать (.next уже есть)
 */
export {}; // файл — модуль, а не глобальный скрипт
/* eslint-disable @typescript-eslint/no-explicit-any -- ответ Telegram API проверяется как сырой JSON */

try {
  process.loadEnvFile?.();
} catch {
  /* переменные могут быть заданы снаружи */
}

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const PORT = Number(opt("port") ?? process.env.PORT ?? 3000);
const URL_OVERRIDE = opt("url");
const START = flag("start");
const SKIP_BUILD = flag("skip-build");

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

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response | null> {
  try {
    return await Promise.race([
      fetch(url, { redirect: "manual" }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

async function tgApi(method: string, token: string): Promise<any> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`);
    return await res.json();
  } catch {
    return { ok: false, description: "сеть недоступна" };
  }
}

async function main(): Promise<void> {
  console.log("Deploy-check «Кейс-игры»\n");

  // --- Цель проверки: локальный --start или WEBAPP_URL ---
  let target = URL_OVERRIDE ?? process.env.WEBAPP_URL ?? "";
  let child: ReturnType<typeof spawn> | null = null;

  if (START) {
    target = `http://localhost:${PORT}`;
    console.log(`0. Прод-сервер (next start, порт ${PORT})`);
    if (!existsSync(join(root, ".next", "BUILD_ID")) && !SKIP_BUILD) {
      console.log("  .next не найден — собираю (npm run build)…");
      const build = spawnSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
      if (build.status !== 0) {
        ok("сборка проходит", false, "npm run build завершился с ошибкой");
        finish();
        return;
      }
      ok("сборка проходит", true);
    } else {
      console.log("  .next найден, сборку пропускаю");
    }
    child = spawn("npx", ["next", "start", "-p", String(PORT)], {
      cwd: root,
      stdio: "ignore",
      detached: false,
    });
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      const res = await fetchWithTimeout(`${target}/api/health`, 2000);
      if (res && res.status === 200) {
        healthy = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    ok("next start поднимается и отвечает", healthy, healthy ? target : "нет ответа 60 с");
    if (!healthy) {
      finish(child);
      return;
    }
  }

  if (!target) {
    console.log("  ✗ не задан URL: заполните WEBAPP_URL в .env или передайте --url");
    finish(child);
    return;
  }
  const normalized = target.replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    ok("WEBAPP_URL — корректный URL", false, normalized);
    finish(child);
    return;
  }

  console.log(`\n1. Адрес приложения: ${normalized}`);
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  ok(
    isLocal ? "http разрешён (localhost)" : "HTTPS",
    isLocal || parsed.protocol === "https:",
    isLocal ? "локальный адрес" : parsed.protocol === "https:" ? "" : "Telegram требует HTTPS!"
  );

  const home = await fetchWithTimeout(normalized, 10_000);
  ok("приложение доступно", !!home && home.status < 400, home ? `HTTP ${home.status}` : "нет ответа");

  const health = await fetchWithTimeout(`${normalized}/api/health`, 10_000);
  const healthBody = health ? await health.json().catch(() => null) : null;
  ok(
    "/api/health -> 200, БД на связи",
    health?.status === 200 && healthBody?.ok === true && healthBody?.db === "up",
    health ? `HTTP ${health.status}${healthBody ? `, db=${healthBody.db}` : ""}` : "нет ответа"
  );

  console.log("\n2. Telegram-бот");
  const token = process.env.BOT_TOKEN ?? "";
  if (!token) {
    ok("BOT_TOKEN задан и валиден", false, "BOT_TOKEN пуст — получите у @BotFather (/newbot)");
    finish(child);
    return;
  }
  const me = await tgApi("getMe", token);
  ok(
    "BOT_TOKEN валиден (getMe)",
    me?.ok === true,
    me?.ok ? `@${me.result?.username}` : me?.description ?? "неверный токен"
  );
  if (me?.ok !== true) {
    finish(child);
    return;
  }

  console.log("\n3. Webhook");
  const info = await tgApi("getWebhookInfo", token);
  const expected = `${normalized}/api/telegram/webhook`;
  const installed = info?.ok === true ? String(info.result?.url ?? "") : "";
  ok(
    "webhook установлен на нужный URL",
    installed === expected,
    installed === expected
      ? `ок${info.result?.pending_update_count ? `, в очереди ${info.result.pending_update_count}` : ""}`
      : installed
        ? `установлен ${installed}, ожидался ${expected} — выполните: npm run tg:webhook`
        : "не установлен — выполните: npm run tg:webhook"
  );

  finish(child);
}

function finish(child?: ReturnType<typeof spawn> | null): void {
  if (child) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* уже остановлен */
    }
  }
  console.log(`\nИтог: ${passed} прошло, ${failed} упало${failed > 0 ? " — деплой НЕ готов" : " — деплой готов ✅"}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("deploy-check упал:", e instanceof Error ? e.message : e);
  process.exit(1);
});
