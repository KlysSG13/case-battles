import {
  sendApp,
  sendDuelLobby,
  sendLeaderboard,
  sendModes,
  sendProfile,
  sendStart,
} from "./telegram";

interface TgUpdate {
  message?: {
    chat: { id: number };
    from?: { id: number };
    text?: string;
  };
  callback_query?: { id: string };
}

export async function handleUpdate(update: TgUpdate): Promise<void> {
  const msg = update.message;
  if (!msg?.text) return;
  const chatId = msg.chat.id;
  const telegramId = msg.from?.id ?? chatId;
  const command = msg.text.trim().split(/[\s@]/)[0].toLowerCase();

  switch (command) {
    case "/start":
      await sendStart(chatId);
      break;
    case "/app":
      await sendApp(chatId);
      break;
    case "/profile":
      await sendProfile(chatId, telegramId);
      break;
    case "/leaderboard":
      await sendLeaderboard(chatId);
      break;
    case "/modes":
      await sendModes(chatId);
      break;
    case "/duel":
      await sendDuelLobby(chatId);
      break;
    default:
      break;
  }
}
