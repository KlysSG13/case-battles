import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { profilePayload } from "@/lib/profile";
import { FREE_DAILY_LIMIT } from "@/lib/gamification";
import { tickMascot, mascotLabel } from "@/lib/mascot";
import { mskDayStartUtc } from "@/lib/msk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const user = auth.user;
  const mascotState = await tickMascot(user.id);

  const [allBadges, ownedBadges, attempts, completedRounds, myDuels] = await Promise.all([
    prisma.badge.findMany({ orderBy: { id: "asc" } }),
    prisma.userBadge.findMany({ where: { userId: user.id } }),
    prisma.attempt.findMany({
      where: { userId: user.id, status: "completed" },
      orderBy: { submittedAt: "desc" },
      take: 10,
      include: { case: { include: { domain: true } } },
    }),
    prisma.attempt.count({
      where: { userId: user.id, status: "completed", attemptNo: 1, submittedAt: { gte: mskDayStartUtc() } },
    }),
    prisma.duel.findMany({
      where: { OR: [{ aUserId: user.id }, { bUserId: user.id }] },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const ownedByBadge = new Map(ownedBadges.map((ub) => [ub.badgeId, ub.awardedAt]));

  return NextResponse.json({
    profile: profilePayload(user, {
      charge: mascotState.charge,
      sleeping: mascotState.sleeping,
      label: mascotLabel(mascotState),
    }),
    quota: {
      usedToday: completedRounds,
      limit: user.isPro ? null : FREE_DAILY_LIMIT,
      remaining: user.isPro ? null : Math.max(0, FREE_DAILY_LIMIT - completedRounds),
    },
    badges: allBadges.map((b) => ({
      code: b.code,
      title: b.title,
      description: b.description,
      emoji: b.emoji,
      earned: ownedByBadge.has(b.id),
      awardedAt: ownedByBadge.get(b.id)?.toISOString() ?? null,
    })),
    attempts: attempts.map((a) => ({
      id: a.id,
      caseTitle: a.case?.title ?? a.mode,
      domainEmoji: a.case?.domain.emoji ?? "🎮",
      domainTitle: a.case?.domain.title ?? a.mode,
      percent: a.percent ?? 0,
      xpEarned: a.xpEarned,
      submittedAt: a.submittedAt?.toISOString() ?? null,
      mode: a.mode,
    })),
    duels: myDuels.map((d) => ({
      id: d.id,
      status: d.status,
      mode: d.mode,
      iWon: d.winnerUserId === user.id,
      isDraw: d.status === "finished" && d.winnerUserId === null,
    })),
  });
}

/** POST /api/app/me {profilePublic: boolean} — тумблер приватности. */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const body = (await req.json().catch(() => null)) as { profilePublic?: boolean } | null;
  if (!body || typeof body.profilePublic !== "boolean") {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const user = await prisma.user.update({
    where: { id: auth.user.id },
    data: { profilePublic: body.profilePublic },
  });
  return NextResponse.json({ profilePublic: user.profilePublic });
}
