import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { profilePayload } from "@/lib/profile";
import { FREE_DAILY_LIMIT } from "@/lib/gamification";
import { tickMascot, mascotLabel } from "@/lib/mascot";
import { MODE_LIST } from "@/lib/modes";
import { mskDayStartUtc, mskDayString } from "@/lib/msk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deterministicIndex(seed: string, modulo: number): number {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return modulo > 0 ? hash % modulo : 0;
}

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const user = auth.user;

  // ленивый пересчёт дрона (день сменился)
  const mascotState = await tickMascot(user.id);

  const [domains, activeCases, solvedCases, completedToday] = await Promise.all([
    prisma.domain.findMany({ orderBy: { sort: "asc" } }),
    prisma.case.findMany({
      where: { isActive: true },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
    prisma.attempt.findMany({
      where: { userId: user.id, status: "completed" },
      select: { caseId: true },
    }),
    // квота считается в РАУНДАХ (попытка №1), а не в попытках
    prisma.attempt.count({
      where: {
        userId: user.id,
        status: "completed",
        attemptNo: 1,
        submittedAt: { gte: mskDayStartUtc() },
      },
    }),
  ]);

  const solvedIds = new Set(solvedCases.map((a) => a.caseId));
  const freshCases = activeCases.filter((c) => !solvedIds.has(c.id));
  const pool = freshCases.length > 0 ? freshCases : activeCases;
  const daySeed = mskDayString();
  const pickedId = pool[deterministicIndex(daySeed, pool.length)]?.id ?? null;

  const dailyCase = pickedId
    ? await prisma.case.findUnique({
        where: { id: pickedId },
        include: { domain: true },
      })
    : null;

  return NextResponse.json({
    profile: profilePayload(user, {
      charge: mascotState.charge,
      sleeping: mascotState.sleeping,
      label: mascotLabel(mascotState),
    }),
    modes: MODE_LIST.map((m) => ({
      slug: m.slug,
      title: m.title,
      short: m.short,
      description: m.description,
      emoji: m.emoji,
      baseTimeLimitSec: m.baseTimeLimitSec,
    })),
    domains: domains.map((d) => ({
      id: d.id,
      slug: d.slug,
      title: d.title,
      emoji: d.emoji,
    })),
    dailyCase: dailyCase
      ? {
          id: dailyCase.id,
          title: dailyCase.title,
          difficulty: dailyCase.difficulty,
          domainId: dailyCase.domain.id,
          domainSlug: dailyCase.domain.slug,
          domainTitle: dailyCase.domain.title,
          domainEmoji: dailyCase.domain.emoji,
        }
      : null,
    quota: {
      usedToday: completedToday,
      limit: user.isPro ? null : FREE_DAILY_LIMIT,
      remaining: user.isPro ? null : Math.max(0, FREE_DAILY_LIMIT - completedToday),
    },
  });
}
