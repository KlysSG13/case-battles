import { prisma } from "./prisma";
import { mskWeekStartUtc } from "./msk";
import { levelFromXp } from "./levels";
import { leagueFor } from "./modes";
import { isProActive } from "./entitlements";

export interface LeaderboardRow {
  place: number;
  name: string;
  level: number;
  xp: number;
  isMe?: boolean;
  isPro?: boolean;
}

export interface LeaderboardResult {
  period: "week" | "all" | "league";
  rows: LeaderboardRow[]; // топ-20 (публичные профили)
  me: LeaderboardRow | null; // позиция текущего юзера (всегда, даже приватного)
  topUserIds: number[]; // userId топ-3 недельного топа (для выдачи бейджа top3_week)
}

export type LeaderboardPeriod = "week" | "all" | "league";

async function weekXpByUser(weekStart: Date): Promise<Map<number, number>> {
  const grouped = await prisma.attempt.groupBy({
    by: ["userId"],
    where: {
      status: "completed",
      submittedAt: { gte: weekStart },
      user: { profilePublic: true },
    },
    _sum: { xpEarned: true },
  });
  const map = new Map<number, number>();
  for (const row of grouped) {
    map.set(row.userId, row._sum.xpEarned ?? 0);
  }
  return map;
}

export async function getLeaderboard(
  period: LeaderboardPeriod,
  currentUserId?: number
): Promise<LeaderboardResult> {
  let scores: { userId: number; xp: number; level: number }[];

  if (period === "week") {
    const map = await weekXpByUser(mskWeekStartUtc());
    const ids = [...map.keys()];
    const users = ids.length
      ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, xpTotal: true } })
      : [];
    const xpByUser = new Map(users.map((u) => [u.id, u.xpTotal]));
    scores = [...map.entries()]
      .map(([userId, xp]) => ({ userId, xp, level: levelFromXp(xpByUser.get(userId) ?? xp) }))
      .filter((s) => s.xp > 0);
  } else if (period === "league") {
    const users = await prisma.user.findMany({
      where: { profilePublic: true, rating: { gt: 0 } },
      select: { id: true, rating: true, xpTotal: true },
    });
    scores = users.map((u) => ({ userId: u.id, xp: u.rating, level: levelFromXp(u.xpTotal) }));
  } else {
    const users = await prisma.user.findMany({
      where: { profilePublic: true, xpTotal: { gt: 0 } },
      select: { id: true, xpTotal: true },
    });
    scores = users.map((u) => ({ userId: u.id, xp: u.xpTotal, level: levelFromXp(u.xpTotal) }));
  }

  scores.sort((a, b) => b.xp - a.xp || a.userId - b.userId);

  const topIds = scores.slice(0, 20).map((s) => s.userId);
  const meInclude = currentUserId && !topIds.includes(currentUserId) ? [currentUserId] : [];
  const users = await prisma.user.findMany({
    where: { id: { in: [...topIds, ...meInclude] } },
    select: { id: true, firstName: true, username: true, xpTotal: true, proUntil: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const rows: LeaderboardRow[] = scores.slice(0, 20).map((s, i) => {
    const u = byId.get(s.userId);
    return {
      place: i + 1,
      name: u?.firstName || u?.username || "Игрок",
      level: s.level,
      xp: s.xp,
      isMe: s.userId === currentUserId,
      isPro: u ? isProActive(u) : false,
    };
  });

  let me: LeaderboardRow | null = null;
  if (currentUserId) {
    const idx = scores.findIndex((s) => s.userId === currentUserId);
    const u = byId.get(currentUserId);
    if (idx >= 0) {
      me = {
        place: idx + 1,
        name: u?.firstName || u?.username || "Игрок",
        level: scores[idx].level,
        xp: scores[idx].xp,
        isMe: true,
      };
    } else if (period === "league") {
      // приватный юзер: своей строчки в публичном топе нет — вернём свою позицию по рейтингу
      const priv = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { firstName: true, username: true, rating: true, xpTotal: true },
      });
      const better = await prisma.user.count({
        where: { profilePublic: true, rating: { gt: priv?.rating ?? 0 } },
      });
      me = {
        place: better + 1,
        name: `${priv?.firstName ?? "Игрок"} (скрытый профиль)`,
        level: levelFromXp(priv?.xpTotal ?? 0),
        xp: priv?.rating ?? 0,
        isMe: true,
      };
    }
  }

  return { period, rows, me, topUserIds: scores.slice(0, 3).map((s) => s.userId) };
}

export { leagueFor };
