import type { User } from "@prisma/client";
import { levelProgress } from "./levels";
import { leagueFor, nextLeagueFor, LEAGUES } from "./modes";
import { isProActive } from "./entitlements";

export interface ProfilePayload {
  firstName: string;
  username: string | null;
  level: number;
  xpTotal: number;
  streakCurrent: number;
  streakBest: number;
  isPro: boolean;
  profilePublic: boolean;
  rating: number;
  league: {
    key: string;
    title: string;
    emoji: string;
    color: string;
    next: { title: string; min: number } | null;
    progressPct: number; // прогресс до следующей лиги
  };
  mascot: {
    charge: number;
    sleeping: boolean;
    label: string;
    xpBonusActive: boolean;
  };
  rewardsUnlocked: boolean;
  progress: {
    level: number;
    xpIntoLevel: number;
    xpToNext: number;
    nextLevelXp: number;
    progressPct: number;
  };
}

export function leagueProgress(rating: number): ProfilePayload["league"] {
  const current = leagueFor(rating);
  const next = nextLeagueFor(rating);
  let progressPct = 100;
  if (next) {
    const prevMin = current.min;
    progressPct = Math.max(
      0,
      Math.min(100, Math.round(((rating - prevMin) / (next.min - prevMin)) * 100))
    );
  }
  return {
    key: current.key,
    title: current.title,
    emoji: current.emoji,
    color: current.color,
    next: next ? { title: next.title, min: next.min } : null,
    progressPct,
  };
}

export function profilePayload(
  user: User,
  mascot: { charge: number; sleeping: boolean; label: string } = {
    charge: user.mascotCharge,
    sleeping: user.mascotCharge <= 0,
    label: user.mascotCharge <= 0 ? "в спячке" : user.mascotCharge >= 60 ? "на связи" : "в тонусе",
  }
): ProfilePayload {
  const progress = levelProgress(user.xpTotal);
  return {
    firstName: user.firstName,
    username: user.username,
    level: progress.level,
    xpTotal: user.xpTotal,
    streakCurrent: user.streakCurrent,
    streakBest: user.streakBest,
    isPro: isProActive(user),
    proUntil: user.proUntil?.toISOString() ?? null,
    hintsBalance: user.hintsBalance,
    profilePublic: user.profilePublic,
    rating: user.rating,
    league: leagueProgress(user.rating),
    mascot: {
      charge: mascot.charge,
      sleeping: mascot.sleeping,
      label: mascot.label,
      xpBonusActive: mascot.charge >= 60,
    },
    rewardsUnlocked: !!user.rewardsUnlockedAt,
    progress: {
      level: progress.level,
      xpIntoLevel: progress.xpIntoLevel,
      xpToNext: progress.xpToNext,
      nextLevelXp: progress.nextLevelXp,
      progressPct: progress.progressPct,
    },
  };
}

export { LEAGUES };
