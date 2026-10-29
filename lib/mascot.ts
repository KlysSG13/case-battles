import type { User } from "@prisma/client";
import { prisma } from "./prisma";
import { mskDayString, dayDiff } from "./msk";

export const MASCOT_ACTIVE_BONUS = 15;
export const MASCOT_IDLE_PENALTY = -10;
export const MASCOT_XP_THRESHOLD = 60; // при заряде >= 60 -> +10% к XP матча

export interface MascotState {
  charge: number;
  mascotDay: Date | null;
  sleeping: boolean;
}

/**
 * Синт-дрон: день с завершённым матчем +15 (max 100), день без −10, при 0 — «спячка».
 * Активный день = lastActiveDate сегодня или вчера (по Москве).
 */
export function computeMascot(user: Pick<User, "mascotCharge" | "mascotDay" | "lastActiveDate">): MascotState {
  const today = mskDayString();
  const processedDay = user.mascotDay ? mskDayString(user.mascotDay) : null;
  if (processedDay === today) {
    return { charge: user.mascotCharge, mascotDay: user.mascotDay, sleeping: user.mascotCharge <= 0 };
  }
  if (processedDay === null) {
    // первый вход: дрон стартует с 50, без штрафа — фиксируем день
    return { charge: user.mascotCharge, mascotDay: new Date(), sleeping: user.mascotCharge <= 0 };
  }
  const lastActive = user.lastActiveDate ? mskDayString(user.lastActiveDate) : null;
  const gap = lastActive ? dayDiff(today, lastActive) : Infinity;
  const wasActive = gap <= 1;
  const charge = Math.max(0, Math.min(100, user.mascotCharge + (wasActive ? MASCOT_ACTIVE_BONUS : MASCOT_IDLE_PENALTY)));
  return { charge, mascotDay: new Date(), sleeping: charge <= 0 };
}

/** Ленивый пересчёт (bootstrap/me) — сохраняет новое состояние при смене дня. */
export async function tickMascot(userId: number): Promise<MascotState> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const state = computeMascot(user);
  if (state.charge !== user.mascotCharge) {
    await prisma.user.update({
      where: { id: userId },
      data: { mascotCharge: state.charge, mascotDay: state.mascotDay },
    });
  }
  return state;
}

export function mascotLabel(state: MascotState): string {
  if (state.sleeping) return "в спячке";
  if (state.charge >= 80) return "на связи";
  if (state.charge >= 40) return "в тонусе";
  return "экономит энергию";
}
