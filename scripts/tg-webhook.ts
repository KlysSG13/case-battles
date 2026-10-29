/**
 * Настройка Telegram-бота: setWebhook + setMyCommands + getMe.
 * Без BOT_TOKEN печатает пошаговую инструкцию и выходит с кодом 0.
 */
export {}; // файл — модуль, а не глобальный скрипт

try {
  process.loadEnvFile?.();
} catch {
  /* переменные могут быть заданы снаружи */
}

const BOT_TOKEN = process.env.BOT_TOKEN ?? "";
const WEBAPP_URL = (process.env.WEBAPP_URL ?? "").replace(/\/+$/, "");
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
const APP_SHORT_NAME = (process.env.APP_SHORT_NAME ?? "").trim();

function printInstructions(): void {
  console.log(`
Бот не настроен: BOT_TOKEN пуст. Mini App и API при этом полностью работают (режим предпросмотра).

Как подключить бота (5 минут):

1. Откройте @BotFather в Telegram и отправьте /newbot.
2. Придумайте имя (например, «Кейс-игры») и username (например, case_games_bot).
3. Скопируйте токен вида «123456789:AA...» в .env:
     BOT_TOKEN="123456789:AA..."
4. Создайте Mini App: в @BotFather отправьте /newapp, выберите бота,
   задайте short name (например, «casegames») и укажите URL приложения
   (публичный HTTPS, например https://ваш-домен.ru).
   Short name сохраните в .env:
     APP_SHORT_NAME="casegames"
5. Укажите публичный URL приложения в .env:
     WEBAPP_URL="https://ваш-домен.ru"
6. Запустите снова:
     npm run tg:webhook

Для локальной разработки без публичного HTTPS подойдёт туннель
(например, «cloudflared tunnel --url http://localhost:3000» или ngrok),
адрес туннеля укажите в WEBAPP_URL.
`);
}

async function tgApi(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as { ok: boolean; result?: unknown; description?: string };
}

async function main(): Promise<void> {
  if (!BOT_TOKEN) {
    printInstructions();
    return;
  }

  if (!WEBAPP_URL || !WEBAPP_URL.startsWith("https://")) {
    console.log(
      "⚠️  WEBAPP_URL не задан или не HTTPS. Telegram требует публичный HTTPS-URL\n" +
        "   (для кнопки web_app и webhook). Используйте туннель или домен.\n"
    );
  }
  if (!WEBHOOK_SECRET) {
    console.log("⚠️  TELEGRAM_WEBHOOK_SECRET пуст — сгенерируйте: openssl rand -hex 32\n");
  }

  const me = (await tgApi("getMe", {})) as {
    ok: boolean;
    result?: { username?: string; first_name?: string };
    description?: string;
  };
  if (!me.ok) {
    console.error(`✗ getMe не удался: ${me.description ?? "неизвестная ошибка"}\n` +
      "  Проверьте BOT_TOKEN в .env (токен выдаёт @BotFather).");
    process.exit(1);
  }

  const webhookUrl = `${WEBAPP_URL}/api/telegram/webhook`;
  const setWebhook = await tgApi("setWebhook", {
    url: webhookUrl,
    secret_token: WEBHOOK_SECRET || undefined,
    // callback_query нужен для inline-кнопок; без него нажатия до бота не доходят
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  if (!setWebhook.ok) {
    console.error(`✗ setWebhook не удался: ${setWebhook.description}`);
    process.exit(1);
  }

  const setCommands = await tgApi("setMyCommands", {
    commands: [
      { command: "start", description: "Запустить Кейс-баттлы" },
      { command: "app", description: "Открыть Mini App" },
      { command: "modes", description: "Режимы игры" },
      { command: "duel", description: "Дуэли и рейтинг" },
      { command: "profile", description: "Профиль и статистика" },
      { command: "leaderboard", description: "Топ недели" },
    ],
  });

  const username = me.result?.username ?? "?";
  console.log(`✅ Бот «${me.result?.first_name ?? username}» (@${username}) подключён`);
  console.log(`✅ Webhook: ${webhookUrl} (установлен)`);
  console.log(`✅ Команды меню: ${setCommands.ok ? "заданы (/start, /app, /modes, /duel, /profile, /leaderboard)" : "ошибка"}`);

  const info = await tgApi("getWebhookInfo", {});
  if (info.ok) {
    const r = info.result as {
      url?: string;
      allowed_updates?: string[];
      pending_update_count?: number;
      last_error_message?: string;
    };
    console.log(`✅ getWebhookInfo:`);
    console.log(`   url: ${r.url}`);
    console.log(`   allowed_updates: ${(r.allowed_updates ?? []).join(", ") || "все"}`);
    if (r.pending_update_count) console.log(`   pending_updates: ${r.pending_update_count}`);
    if (r.last_error_message) console.log(`   ⚠️ last_error: ${r.last_error_message}`);
    const allowedOk = (r.allowed_updates ?? []).includes("message") && (r.allowed_updates ?? []).includes("callback_query");
    console.log(allowedOk ? "   ✓ message + callback_query зарегистрированы" : "   ⚠️ callback_query отсутствует — перезапустите скрипт");
  }
  if (APP_SHORT_NAME) {
    console.log(`✅ Прямая ссылка на Mini App: https://t.me/${username}/${APP_SHORT_NAME}`);
  } else {
    console.log("ℹ️  Задайте APP_SHORT_NAME в .env, чтобы бот присылал прямую ссылку t.me/<bot>/<app>");
  }
}

main().catch((e) => {
  console.error("Ошибка:", e instanceof Error ? e.message : e);
  process.exit(1);
});
