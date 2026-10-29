import {
  sendApp,
  sendDuelLobby,
  sendLeaderboard,
  sendModes,
  sendProfile,
  sendPro,
  sendStart,
  tgApi,
} from "./telegram";
import { parsePayload, findSku } from "./catalog";
import { applySuccessfulPayment } from "./payments";

interface TgUpdate {
  message?: {
    chat: { id: number };
    from?: { id: number };
    text?: string;
    successful_payment?: {
      currency?: string;
      total_amount?: number;
      invoice_payload?: string;
      telegram_payment_charge_id?: string;
      provider_payment_charge_id?: string | null;
    };
  };
  callback_query?: { id: string };
  pre_checkout_query?: {
    id: string;
    from: { id: number };
    currency?: string;
    total_amount?: number;
    invoice_payload?: string;
  };
}

export async function handleUpdate(update: TgUpdate): Promise<void> {
  // --- Telegram Stars: pre-checkout (ответ обязателен в течение 10 с) ---
  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    const parsed = q.invoice_payload ? parsePayload(q.invoice_payload) : null;
    const item = parsed ? findSku(parsed.sku) : undefined;
    const valid =
      !!parsed &&
      !!item &&
      parsed.userId === q.from.id &&
      (q.total_amount ?? item.stars) === item.stars &&
      (q.currency ?? "XTR") === "XTR";
    await tgApi("answerPreCheckoutQuery", {
      pre_checkout_query_id: q.id,
      ok: valid,
      ...(valid ? {} : { error_message: "Не удалось подтвердить покупку: проверьте корзину и повторите" }),
    });
    return;
  }

  // --- Telegram Stars: успешная оплата — единственная точка зачисления ---
  const sp = update.message?.successful_payment;
  if (sp?.telegram_payment_charge_id && sp.invoice_payload) {
    const fromId = update.message?.from?.id;
    if (!fromId) return;
    const result = await applySuccessfulPayment({
      fromId,
      payload: sp.invoice_payload,
      stars: sp.total_amount ?? 0,
      telegramPaymentChargeId: sp.telegram_payment_charge_id,
      providerPaymentChargeId: sp.provider_payment_charge_id ?? null,
    });
    if (!result.ok && (result.reason === "bad_payload" || result.reason === "bad_sku" || result.reason === "user_mismatch")) {
      // перманентная проблема payload — подтверждаем обработку, чтобы не зациклить вебхук
      console.warn("successful_payment отклонён (payload):", result.reason);
      return;
    }
    if (!result.ok) {
      // price_mismatch и прочее — транзиентно-опасные: 500 => Telegram повторит, идемпотентно
      throw new Error(`successful_payment не применён: ${result.reason}`);
    }
    return;
  }

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
    case "/pro":
      await sendPro(chatId);
      break;
    default:
      break;
  }
}
