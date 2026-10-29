import type { User } from "@prisma/client";

// Единственный источник истины по PRO: proUntil > now.
// Все проверки квот и перков — только через эти функции (колонки isPro в БД нет).

export function isProActive(user: Pick<User, "proUntil">, now: Date = new Date()): boolean {
  return !!user.proUntil && user.proUntil.getTime() > now.getTime();
}

/** Продление PRO: max(now, proUntil) + days. */
export function extendProUntil(
  proUntil: Date | null,
  days: number,
  now: Date = new Date()
): Date {
  const base = proUntil && proUntil.getTime() > now.getTime() ? proUntil : now;
  return new Date(base.getTime() + days * 24 * 3600 * 1000);
}

/** PRO-скин доступен, пока подписка активна. */
export function ownsProCosmetic(
  user: Pick<User, "proUntil">,
  now: Date = new Date()
): boolean {
  return isProActive(user, now);
}
