import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expireDuel, parseRival } from "@/lib/duels";
import { MODES, type Mode } from "@/lib/modes";
import { levelProgress } from "@/lib/levels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/app/duel/[id] — состояние дуэли.
 * До финала ответы/проценты соперников скрыты; после — экран сравнения.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const user = auth.user;
  const { id } = await ctx.params;
  const duelId = Number(id);
  if (!Number.isInteger(duelId)) {
    return NextResponse.json({ error: "Дуэль не найдена" }, { status: 404 });
  }

  let duel = await prisma.duel.findUnique({ where: { id: duelId } });
  if (!duel) {
    return NextResponse.json({ error: "Дуэль не найдена" }, { status: 404 });
  }
  if (duel.status !== "finished" && duel.status !== "expired" && duel.expiresAt < new Date()) {
    await expireDuel(duel);
    duel = await prisma.duel.findUniqueOrThrow({ where: { id: duelId } });
  }

  const isParticipant = duel.aUserId === user.id || duel.bUserId === user.id;
  const mode: Mode = (duel.mode as Mode) in MODES ? (duel.mode as Mode) : "classic";
  const config = MODES[mode];
  const caseRow = await prisma.case.findUnique({
    where: { id: duel.caseId },
    include: { domain: true },
  });

  const base = {
    duelId: duel.id,
    status: duel.status,
    mode,
    modeTitle: config.title,
    difficulty: duel.difficulty,
    style: duel.style,
    isParticipant,
    isAuthor: duel.aUserId === user.id,
    timeLimitSec: Math.round(config.baseTimeLimitSec * (duel.difficulty === "easy" ? 1.2 : duel.difficulty === "hard" ? 0.8 : 1)),
    answerMin: config.answerMin,
    answerMax: config.answerMax,
    case: caseRow
      ? {
          id: caseRow.id,
          title: caseRow.title,
          body: caseRow.body,
          domain: { id: caseRow.domain.id, slug: caseRow.domain.slug, title: caseRow.domain.title, emoji: caseRow.domain.emoji },
        }
      : null,
    mySide: duel.aUserId === user.id ? "a" : duel.bUserId === user.id ? "b" : null,
    iSolved: (duel.aUserId === user.id && !!duel.aAttemptId) || (duel.bUserId === user.id && !!duel.bAttemptId),
    expiresAt: duel.expiresAt.toISOString(),
  };

  if (duel.status !== "finished" && duel.status !== "expired") {
    // до финала — только своё состояние, ответы соперника скрыты
    return NextResponse.json(base);
  }

  // --- Финал: сравнение ---
  const rival = parseRival(duel);
  const [aAttempt, bAttempt] = await Promise.all([
    duel.aAttemptId
      ? prisma.attempt.findUnique({ where: { id: duel.aAttemptId } })
      : Promise.resolve(null),
    duel.bAttemptId
      ? prisma.attempt.findUnique({ where: { id: duel.bAttemptId } })
      : Promise.resolve(null),
  ]);
  const aUser = await prisma.user.findUnique({ where: { id: duel.aUserId } });
  const bUser = duel.bUserId ? await prisma.user.findUnique({ where: { id: duel.bUserId } }) : null;

  const verdict =
    duel.winnerUserId === null
      ? "draw"
      : duel.winnerUserId === user.id
        ? "me"
        : "rival";

  const attemptsMeta = await prisma.ratingMatch.findMany({
    where: { duelId: duel.id },
    select: { userId: true, delta: true, before: true, after: true },
  });
  const myRating = attemptsMeta.find((r) => r.userId === user.id) ?? null;

  return NextResponse.json({
    ...base,
    verdict,
    winnerUserId: duel.winnerUserId,
    a: {
      name: aUser?.firstName ?? "Игрок",
      isMe: duel.aUserId === user.id,
      percent: aAttempt?.percent ?? 0,
      answer: duel.status === "finished" ? (aAttempt?.answer ?? null) : null,
      xpEarned: aAttempt?.xpEarned ?? 0,
      ratingDelta: attemptsMeta.find((r) => r.userId === duel.aUserId)?.delta ?? 0,
    },
    b: rival
      ? {
          name: `ИИ · ${duel.style === "hustler" ? "Хастлер" : duel.style === "systemizer" ? "Системщик" : "Аналитик"}`,
          isMe: false,
          percent: rival.percent,
          answer: rival.answer,
          xpEarned: 0,
          ratingDelta: 0,
          engine: rival.engine,
        }
      : bUser
        ? {
            name: bUser.firstName,
            isMe: duel.bUserId === user.id,
            percent: bAttempt?.percent ?? 0,
            answer: duel.status === "finished" ? (bAttempt?.answer ?? null) : null,
            xpEarned: bAttempt?.xpEarned ?? 0,
            ratingDelta: attemptsMeta.find((r) => r.userId === duel.bUserId)?.delta ?? 0,
          }
        : null,
    myRating: myRating ? { delta: myRating.delta, before: myRating.before, after: myRating.after } : null,
    user: (() => {
      const progress = levelProgress(user.xpTotal);
      return { level: progress.level, xpTotal: user.xpTotal, rating: user.rating };
    })(),
  });
}
