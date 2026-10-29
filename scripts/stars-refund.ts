/**
 * Ручной возврат Telegram Stars: chargeId → refundStarPayment + Payment.status="refunded".
 * Косметика отзывается и снимается с экипировки; proUntil/подсказки ретроактивно не отзываются.
 * Использование: npm run stars:refund -- <telegram_payment_charge_id>
 */
export {}; // файл — модуль, а не глобальный скрипт

try {
  process.loadEnvFile?.();
} catch {
  /* переменные могут быть заданы снаружи */
}

import { refundPayment } from "../lib/payments";
import { prisma } from "../lib/prisma";

async function main(): Promise<void> {
  const chargeId = process.argv[2];
  if (!chargeId) {
    console.log("Использование: npm run stars:refund -- <telegram_payment_charge_id>");
    process.exit(1);
  }
  const res = await refundPayment(chargeId);
  if (!res.ok) {
    console.error(`✗ Возврат не выполнен: ${res.reason}`);
    process.exit(1);
  }
  if (!res.refunded) {
    console.log(`ℹ️  Платёж уже был возвращён ранее (${res.reason})`);
    return;
  }
  console.log(`✅ Возврат выполнен: sku=${res.sku}, user=${res.userId}, charge=${chargeId}`);
}

main()
  .catch((e) => {
    console.error("Ошибка возврата:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
