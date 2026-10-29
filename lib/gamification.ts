import type { Prisma, PrismaClient } from "@prisma/client";
import { dayDiff, mskDayString } from "./msk";
import { levelFromXp } from "./levels";

type Tx = Prisma.TransactionClient | PrismaClient;

export const FREE_DAILY_LIMIT = 3;
export const DAILY_RATE_LIMIT = 30;

/** XP: пороги по проценту + бонус за первую попытку за сутки; повтор кейса — 0. */
export function xpForAttempt(percent: number, isFirstToday: boolean): number {
  let xp: number;
  if (percent >= 85) xp = 60;
  else if (percent >= 70) xp = 45;
  else if (percent >= 50) xp = 30;
  else xp = 15;
  if (isFirstToday) xp += 10;
  return xp;
}

export interface StreakUpdate {
  streakCurrent: number;
  streakBest: number;
}

/** Применяет правила серии к текущим значениям пользователя. */
export function applyStreakRules(
  currentStreak: number,
  bestStreak: number,
  lastActiveDate: Date | null,
  now: Date = new Date()
): StreakUpdate {
  const today = mskDayString(now);
  if (lastActiveDate) {
    const diff = dayDiff(today, mskDayString(lastActiveDate));
    if (diff === 0) {
      return { streakCurrent: currentStreak, streakBest: bestStreak };
    }
    if (diff === 1) {
      const streak = currentStreak + 1;
      return { streakCurrent: streak, streakBest: Math.max(bestStreak, streak) };
    }
  }
  return { streakCurrent: 1, streakBest: Math.max(bestStreak, 1) };
}

const BADGE_CODES = {
  firstCase: "first_case",
  streak7: "streak_7",
  tenCases: "ten_cases",
  top3Week: "top3_week",
  masterDomain: (slug: string) => `master_${slug}`,
  firstDuel: "first_duel",
  duelWin5: "duel_win_5",
  constructorMaster: "constructor_master",
  phoenix: "phoenix",
  pitchPerfect: "pitch_perfect",
} as const;

/**
 * Проверяет и выдаёт бейджи (кроме top3_week — его выдаёт лидерборд).
 * Вызывается в одной транзакции с обновлением Attempt и User.
 */
export async function evaluateBadges(userId: number, tx: Tx): Promise<string[]> {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) return [];

  const awarded: string[] = [];
  const allBadges = await tx.badge.findMany();
  const byCode = new Map(allBadges.map((b) => [b.code, b]));
  const owned = new Set(
    (await tx.userBadge.findMany({ where: { userId }, select: { badgeId: true } })).map(
      (ub) => ub.badgeId
    )
  );

  const grant = async (code: string) => {
    const badge = byCode.get(code);
    if (!badge || owned.has(badge.id)) return;
    await tx.userBadge.create({ data: { userId, badgeId: badge.id } });
    owned.add(badge.id);
    awarded.push(code);
  };

  const [completedCount, domainQualified] = await Promise.all([
    tx.attempt.count({ where: { userId, status: "completed" } }),
    tx.attempt.groupBy({
      by: ["caseId"],
      where: { userId, status: "completed", percent: { gte: 70 } },
      _count: { _all: true },
    }),
  ]);

  if (completedCount >= 1) await grant(BADGE_CODES.firstCase);
  if (completedCount >= 10) await grant(BADGE_CODES.tenCases);
  if (user.streakCurrent >= 7) await grant(BADGE_CODES.streak7);

  // Мастер домена: 5 попыток с percent>=70 в одном домене
  const caseIds = domainQualified
    .map((row) => row.caseId)
    .filter((x): x is number => x !== null);
  if (caseIds.length > 0) {
    const cases = await tx.case.findMany({
      where: { id: { in: caseIds } },
      select: { id: true, domainId: true },
    });
    const perDomain = new Map<number, number>();
    for (const row of domainQualified) {
      const c = cases.find((x) => x.id === row.caseId);
      if (!c) continue;
      perDomain.set(c.domainId, (perDomain.get(c.domainId) ?? 0) + row._count._all);
    }
    const domains = await tx.domain.findMany();
    for (const d of domains) {
      if ((perDomain.get(d.id) ?? 0) >= 5) await grant(BADGE_CODES.masterDomain(d.slug));
    }
  }

  // --- Бейджи «Кейс-баттлов» ---
  const [duelParticipation, duelWins, constructorQualified, pitchPerfect, rescueDuels] =
    await Promise.all([
      tx.duel.count({ where: { OR: [{ aUserId: userId }, { bUserId: userId }] } }),
      tx.duel.count({ where: { winnerUserId: userId } }),
      tx.attempt.count({ where: { userId, status: "completed", mode: "constructor", percent: { gte: 70 } } }),
      tx.attempt.count({ where: { userId, status: "completed", mode: "pitch", percent: { gte: 85 } } }),
      tx.duel.findMany({
        where: { mode: "rescue", status: "finished", winnerUserId: userId },
        select: { aAttemptId: true, bAttemptId: true },
      }),
    ]);

  if (duelParticipation >= 1) await grant(BADGE_CODES.firstDuel);
  if (duelWins >= 5) await grant(BADGE_CODES.duelWin5);
  if (constructorQualified >= 5) await grant(BADGE_CODES.constructorMaster);
  if (pitchPerfect >= 1) await grant(BADGE_CODES.pitchPerfect);

  if (rescueDuels.length > 0) {
    const winAttemptIds = rescueDuels.map((d) => d.aAttemptId ?? d.bAttemptId).filter((x): x is number => x !== null);
    const phoenix = await tx.attempt.count({
      where: { id: { in: winAttemptIds }, userId, percent: { gte: 75 } },
    });
    if (phoenix >= 1) await grant(BADGE_CODES.phoenix);
  }

  return awarded;
}

/** Выдаёт top3_week топ-3 недельного лидерборда (вызывается при подсчёте). */
export async function awardTop3Week(userIds: number[]): Promise<void> {
  if (userIds.length === 0) return;
  const { prisma } = await import("./prisma");
  const badge = await prisma.badge.findUnique({ where: { code: BADGE_CODES.top3Week } });
  if (!badge) return;
  await prisma.$transaction(
    userIds.map((userId) =>
      prisma.userBadge.upsert({
        where: { userId_badgeId: { userId, badgeId: badge.id } },
        create: { userId, badgeId: badge.id },
        update: {},
      })
    )
  );
}

export { BADGE_CODES, levelFromXp };
