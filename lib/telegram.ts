import { prisma } from "./prisma";
import { getLeaderboard } from "./leaderboard";
import { levelProgress } from "./levels";
import { mskWeekStartUtc } from "./msk";

const API_BASE = "https://api.telegram.org";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function tgApi(
  method: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  const token = process.env.BOT_TOKEN;
  if (!token) return { ok: false, description: "BOT_TOKEN не задан (mock-режим)" };
  try {
    const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      ok: boolean;
      result?: unknown;
      description?: string;
    };
    return data;
  } catch (e) {
    return { ok: false, description: e instanceof Error ? e.message : "сетевая ошибка" };
  }
}

let cachedBotUsername: string | null | undefined;
export async function getBotUsername(): Promise<string | null> {
  if (cachedBotUsername !== undefined) return cachedBotUsername;
  const res = await tgApi("getMe", {});
  cachedBotUsername = res.ok ? ((res.result as { username?: string })?.username ?? null) : null;
  return cachedBotUsername;
}

export function webAppUrl(): string {
  const base = (process.env.WEBAPP_URL ?? "").replace(/\/+$/, "");
  return base;
}

/** Прямая ссылка на Mini App вида t.me/<bot>/<app_short_name> (если известны). */
export async function directAppLink(): Promise<string | null> {
  const shortName = (process.env.APP_SHORT_NAME ?? "").trim();
  if (!shortName) return null;
  const username = await getBotUsername();
  if (!username) return null;
  return `https://t.me/${username}/${shortName}`;
}

async function appKeyboard() {
  const url = webAppUrl();
  return {
    inline_keyboard: [
      [{ text: "🎮 Открыть Кейс-игры", web_app: url ? { url } : undefined }],
    ],
  };
}

export async function sendStart(chatId: number): Promise<void> {
  const link = await directAppLink();
  const linkLine = link
    ? `\nИли открой по прямой ссылке: <a href="${link}">t.me/${link.split("/t.me/")[1]}</a>`
    : "";
  await tgApi("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `🎮 <b>Кейс-игры</b> — тренажёр решений по бизнесу, продукту и праву.\n\n` +
      `Открывай кейс, пиши своё решение за 4 минуты и получай оценку ИИ по рубрике: баллы, сильные стороны, зоны роста и эталонный ответ. XP, уровни, серии и недельный топ — внутри.${linkLine}`,
    reply_markup: await appKeyboard(),
  });
}

export async function sendApp(chatId: number): Promise<void> {
  await tgApi("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: "Открой Mini App кнопкой ниже 👇",
    reply_markup: await appKeyboard(),
  });
}

export async function sendProfile(chatId: number, telegramId: number): Promise<void> {
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    await tgApi("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: "Профиль появится после первого запуска Mini App — нажмите /start.",
    });
    return;
  }
  const progress = levelProgress(user.xpTotal);
  const lb = await getLeaderboard("week", user.id);
  const place = lb.me ? lb.me.place : null;
  await tgApi("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `👤 <b>${escapeHtml(user.firstName)}</b>\n\n` +
      `🎖 Уровень: <b>${progress.level}</b> (${user.xpTotal} XP, до следующего ${progress.xpToNext})\n` +
      `🔥 Серия: <b>${user.streakCurrent} дн.</b> (рекорд ${user.streakBest})\n` +
      `🏆 Место в недельном топе: <b>${place ? `${place}-й` : "пока нет — реши кейс"}</b>`,
  });
}

export async function sendLeaderboard(chatId: number): Promise<void> {
  const lb = await getLeaderboard("week");
  if (lb.rows.length === 0) {
    await tgApi("sendMessage", {
      chat_id: chatId,
      parse_mode: "HTML",
      text: "В этом топе пока пусто. Реши первый кейс и возглавь рейтинг! Нажмите /start.",
    });
    return;
  }
  const medals = ["🥇", "🥈", "🥉"];
  const lines = lb.rows.slice(0, 10).map((row, i) => {
    const mark = i < 3 ? medals[i] : `${i + 1}.`;
    return `${mark} ${escapeHtml(row.name)} — ур. ${row.level}, ${row.xp} XP`;
  });
  await tgApi("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text: `🏆 <b>Топ недели</b> (с ${mskWeekStartUtc().toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })} по Москве)\n\n${lines.join("\n")}`,
  });
}

export async function sendModes(chatId: number): Promise<void> {
  await tgApi("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      "🎮 <b>Режимы Кейс-баттлов</b>\n\n" +
      "📘 Классика — кейс и свободный ответ (4 мин)\n" +
      "🏗️ Конструктор бизнеса — построй бизнес из выданных условий (8 мин)\n" +
      "🚨 Спасение — план спасения кризиса (6 мин)\n" +
      "🎤 Питч инвестору — убедите за 4 минуты\n" +
      "⚔️ Дуэли — против ИИ или друзей, рейтинг и лиги\n\n" +
      "Все режимы — внутри Mini App:",
    reply_markup: await appKeyboard(),
  });
}

export async function sendDuelLobby(chatId: number): Promise<void> {
  const link = await directAppLink();
  const lobbyLine = link ? `Лобби дуэлей: <a href="${link}?startapp=duels">открыть</a>` : "";
  await tgApi("sendMessage", {
    chat_id: chatId,
    parse_mode: "HTML",
    text:
      `⚔️ <b>Дуэли</b>\n\nСыграй против ИИ-соперника или создай вызов для друга — ` +
      `ссылка на дуэль шарится прямо в чат. Победы двигают рейтинг и лиги.\n${lobbyLine}`,
    reply_markup: await appKeyboard(),
  });
}

/** Отправка напоминания о серии (не более 1 в сутки — дедуп через ReminderLog). */
export async function sendStreakReminder(
  telegramId: number,
  streak: number
): Promise<boolean> {
  const { mskDayString } = await import("./msk");
  const date = mskDayString();
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) return false;
  try {
    await prisma.reminderLog.create({ data: { userId: user.id, date } });
  } catch {
    return false; // уже отправляли сегодня
  }
  const res = await tgApi("sendMessage", {
    chat_id: telegramId,
    parse_mode: "HTML",
    text: `🔥 Серия <b>${streak} дн.</b> сгорит — успей решить кейс дня! Нажми /app.`,
  });
  return res.ok;
}
