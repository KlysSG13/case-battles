import type { User } from "@prisma/client";
import { isProActive } from "./entitlements";
import { mskDayString } from "./msk";

export const HINT_DAILY_FREE = 1;
export const HINT_DAILY_PRO = 3;
export const HINT_FREE_CAP = 20; // кап только для бесплатных грантов, покупки — без капа

export interface DailyGrant {
  balance: number; // итоговый баланс
  granted: number; // сколько начислено сейчас (0 — уже получал сегодня)
  grantDate: Date | null; // новое значение lastHintGrantDate
}

/**
 * Ленивый дневной грант подсказок при первом чтении за сутки (Europe/Moscow):
 * free +1, PRO +3; бесплатные гранты не выводят баланс выше 20.
 */
export function lazyDailyGrant(
  user: Pick<User, "hintsBalance" | "lastHintGrantDate" | "proUntil">,
  now: Date = new Date()
): DailyGrant {
  const today = mskDayString(now);
  const lastGrantDay = user.lastHintGrantDate ? mskDayString(user.lastHintGrantDate) : null;
  if (lastGrantDay === today) {
    return { balance: user.hintsBalance, granted: 0, grantDate: null };
  }
  const amount = isProActive(user, now) ? HINT_DAILY_PRO : HINT_DAILY_FREE;
  const room = Math.max(0, HINT_FREE_CAP - user.hintsBalance);
  const granted = Math.min(amount, room);
  return {
    balance: user.hintsBalance + granted,
    granted,
    grantDate: new Date(),
  };
}
