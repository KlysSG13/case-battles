import type { Duel, User, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  MODES,
  type Mode,
  type Difficulty,
  type RivalStyle,
  ratingDelta,
  DUEL_DRAW_DELTA,
  DUEL_WIN_XP_BONUS,
  DUEL_TTL_HOURS,
  leagueFor,
  isMode,
  isDifficulty,
} from "./modes";
import { generateRivalAnswer } from "./rival";
import { evaluateAnswer } from "./evaluator";
import { rubricInputs, completeAttempt, completedRoundsToday } from "./rounds";
import { FREE_DAILY_LIMIT, DAILY_RATE_LIMIT } from "./gamification";
import { levelFromXp } from "./levels";
import { mskDayStartUtc } from "./msk";
import { tgApi } from "./telegram";

export async function createAiDuel(
  user: User,
  caseId: number,
  mode: Mode,
  style: RivalStyle,
  difficulty: Difficulty
): Promise<Duel | { error: string }> {
  const found = await prisma.case.findUnique({ where: { id: caseId } });
  if (!found || !found.isActive) return { error: "Кейс не найден" };
  return prisma.duel.create({
    data: {
      caseId,
      mode,
      difficulty,
      aUserId: user.id,
      style,
      status: "open",
      expiresAt: new Date(Date.now() + DUEL_TTL_HOURS * 3600_000),
    },
  });
}

export async function createPvpDuel(
  user: User,
  domainId: number,
  mode: Mode,
  difficulty: Difficulty
): Promise<Duel | { error: string }> {
  const cases = await prisma.case.findMany({
    where: { domainId, isActive: true },
    select: { id: true },
  });
  if (cases.length === 0) return { error: "В домене нет активных кейсов" };
  const caseId = cases[Math.floor(Math.random() * cases.length)].id;
  return prisma.duel.create({
    data: {
      caseId,
      mode,
      difficulty,
      aUserId: user.id,
      status: "open",
      expiresAt: new Date(Date.now() + DUEL_TTL_HOURS * 3600_000),
    },
  });
}

export interface RivalState {
  answer: string;
  percent: number;
  engine: "llm" | "mock";
}

export function parseRival(duel: Duel): RivalState | null {
  if (!duel.rivalJson) return null;
  try {
    const raw = JSON.parse(duel.rivalJson) as RivalState;
    return typeof raw?.percent === "number" ? raw : null;
  } catch {
    return null;
  }
}

type Tx = Prisma.TransactionClient;

async function applyRating(
  tx: Tx,
  userId: number,
  duelId: number,
  delta: number
): Promise<{ before: number; after: number }> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  const before = user.rating;
  const after = Math.max(0, before + delta);
  await tx.user.update({ where: { id: userId }, data: { rating: after } });
  await tx.ratingMatch.create({
    data: { userId, duelId, delta, before, after },
  });
  return { before, after };
}

/** Награды: переход в лигу выше или винстрик 3 в AI-дуэлях. */
async function maybeUnlockRewards(userId: number): Promise<boolean> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.rewardsUnlockedAt) return false;
  const aiDuels = await prisma.duel.findMany({
    where: { aUserId: userId, bUserId: null, status: "finished" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { winnerUserId: true },
  });
  let streak = 0;
  for (const d of aiDuels) {
    if (d.winnerUserId === userId) streak++;
    else break;
  }
  if (streak >= 3) {
    await prisma.user.update({
      where: { id: userId },
      data: { rewardsUnlockedAt: new Date() },
    });
    return true;
  }
  return false;
}

async function grantWinBonus(userId: number): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const xp = user.xpTotal + DUEL_WIN_XP_BONUS;
  await prisma.user.update({
    where: { id: userId },
    data: { xpTotal: xp, level: levelFromXp(xp) },
  });
}

async function notify(telegramId: number, text: string): Promise<void> {
  await tgApi("sendMessage", { chat_id: telegramId, parse_mode: "HTML", text }).catch(() => null);
}

export type SolveResult =
  | { ok: true; duel: Duel; attemptId: number; percent: number }
  | { ok: false; status: number; code: string; message: string };

/** Ответ в дуэле (AI: автор; PvP: автор или соперник, claim по факту решения). */
export async function solveDuel(
  user: User,
  duelId: number,
  answer: string,
  startedAtIso: string | null
): Promise<SolveResult> {
  let duel = await prisma.duel.findUnique({ where: { id: duelId } });
  if (!duel) return { ok: false, status: 404, code: "not_found", message: "Дуэль не найдена" };
  // посторонний — 403 независимо от статуса (AI-дуэль чужой тоже закрыта)
  const isOutsider =
    duel.aUserId !== user.id &&
    duel.bUserId !== user.id &&
    !(duel.bUserId === null && duel.style === null);
  if (isOutsider) {
    return { ok: false, status: 403, code: "forbidden", message: "Вы не участник этой дуэли" };
  }
  if (duel.status === "expired" || duel.expiresAt < new Date()) {
    if (duel.status !== "expired") await expireDuel(duel);
    return { ok: false, status: 410, code: "expired", message: "Дуэль истекла" };
  }
  if (duel.status === "finished") {
    return { ok: false, status: 409, code: "finished", message: "Дуэль уже завершена" };
  }

  const mode: Mode = isMode(duel.mode) ? duel.mode : "classic";
  const difficulty: Difficulty = isDifficulty(duel.difficulty) ? duel.difficulty : "normal";
  const config = MODES[mode];
  const trimmed = answer.trim().slice(0, config.answerMax);
  if (trimmed.length < config.answerMin) {
    return {
      ok: false,
      status: 400,
      code: "answer_too_short",
      message: `Минимум ${config.answerMin} символов в режиме «${config.title}»`,
    };
  }

  let side: "a" | "b";
  if (duel.aUserId === user.id) {
    side = "a";
  } else if (duel.bUserId === null) {
    // PvP: соперник «забирает» вызов фактом участия
    if (duel.style !== null) {
      return { ok: false, status: 403, code: "forbidden", message: "Это AI-дуэль" };
    }
    side = "b";
    duel = await prisma.duel.update({
      where: { id: duel.id },
      data: { bUserId: user.id, status: "awaiting" },
    });
  } else if (duel.bUserId === user.id) {
    side = "b";
  } else {
    return { ok: false, status: 403, code: "forbidden", message: "Вы не участник этой дуэли" };
  }

  if ((side === "a" && duel.aAttemptId) || (side === "b" && duel.bAttemptId)) {
    return { ok: false, status: 409, code: "already_solved", message: "Вы уже ответили в этой дуэли" };
  }

  // лимиты: free-квота в раундах + rate limit
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const dayStart = mskDayStartUtc();
  const [roundsToday, attemptsToday] = await Promise.all([
    completedRoundsToday(user.id),
    prisma.attempt.count({ where: { userId: user.id, startedAt: { gte: dayStart } } }),
  ]);
  if (!fresh.isPro && roundsToday >= FREE_DAILY_LIMIT) {
    return { ok: false, status: 403, code: "quota", message: "Бесплатные раунды на сегодня закончились" };
  }
  if (attemptsToday >= DAILY_RATE_LIMIT) {
    return { ok: false, status: 429, code: "rate_limit", message: "Слишком много попыток за сутки" };
  }

  const startedMs = startedAtIso ? Date.parse(startedAtIso) : NaN;
  const startedAt = new Date(Number.isFinite(startedMs) ? startedMs : Date.now());
  const timeSpentSec = Math.max(0, Math.min(3600, Math.round((Date.now() - startedAt.getTime()) / 1000)));

  const caseRow = await prisma.case.findUnique({ where: { id: duel.caseId } });
  const isRepeatCase = !!(await prisma.attempt.findFirst({
    where: { userId: user.id, status: "completed", caseId: duel.caseId, mode },
    select: { id: true },
  }));

  const attempt = await prisma.attempt.create({
    data: {
      userId: user.id,
      caseId: duel.caseId,
      answer: trimmed,
      status: "pending",
      startedAt,
      mode,
      difficulty,
      attemptNo: 1,
    },
  });

  const completed = await completeAttempt({
    user: fresh,
    attemptId: attempt.id,
    caseRow,
    scenario: null,
    answer: trimmed,
    timeSpentSec,
    mode,
    difficulty,
    roundId: null,
    attemptNo: 1,
    isRepeatCase,
  });
  if (!completed.ok) {
    return { ok: false, status: 502, code: "ai_failed", message: "ИИ не смог оценить ответ — попробуйте ещё раз" };
  }

  duel = await prisma.duel.update({
    where: { id: duel.id },
    data: side === "a" ? { aAttemptId: attempt.id } : { bAttemptId: attempt.id },
  });

  // --- AI-дуэль: соперник генерируется ТОЛЬКО после ответа игрока ---
  if (duel.bUserId === null && duel.style && duel.aAttemptId) {
    duel = await finishAiDuel(duel, fresh.telegramId);
  } else if (duel.aAttemptId && duel.bAttemptId) {
    duel = await finishPvpDuel(duel);
  }

  return { ok: true, duel, attemptId: attempt.id, percent: completed.percent };
}

async function finishAiDuel(duel: Duel, aTelegramId: number): Promise<Duel> {
  const caseRow = await prisma.case.findUniqueOrThrow({ where: { id: duel.caseId } });
  const rubric = await rubricInputs(duel.mode as Mode, caseRow);
  const style = (duel.style ?? "analyst") as RivalStyle;

  const rival = await generateRivalAnswer({
    style,
    caseText: caseRow.body,
    caseTitle: caseRow.title,
    rubric,
  });
  const rivalAnswer = rival.ok ? rival.answer : "";
  const rivalEval = rivalAnswer
    ? await evaluateAnswer({
        caseTitle: caseRow.title,
        caseBody: caseRow.body,
        criteria: rubric,
        answer: rivalAnswer,
        timeSpentSec: 240,
        modeContext: MODES[duel.mode as Mode].promptContext || undefined,
      })
    : null;
  const rivalPercent = rivalEval?.ok ? rivalEval.percent : 0;

  const playerAttempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: duel.aAttemptId! },
  });
  const playerPercent = playerAttempt.percent ?? 0;
  const diff = playerPercent - rivalPercent;

  const outcome: "win" | "loss" | "draw" =
    Math.abs(diff) < DUEL_DRAW_DELTA ? "draw" : diff > 0 ? "win" : "loss";
  const delta = ratingDelta("ai", outcome, duel.difficulty as Difficulty);
  const winnerUserId = outcome === "draw" ? null : outcome === "win" ? duel.aUserId : null;

  const updated = await prisma.duel.update({
    where: { id: duel.id },
    data: {
      status: "finished",
      winnerUserId,
      delta,
      rivalJson: JSON.stringify({
        answer: rivalAnswer,
        percent: rivalPercent,
        engine: rival.ok && rival.engine === "llm" ? "llm" : "mock",
        evaluation: rivalEval?.ok
          ? {
              criteria: rivalEval.evaluation.criteria,
              strengths: rivalEval.evaluation.strengths,
              improvements: rivalEval.evaluation.improvements,
            }
          : null,
      }),
    },
  });

  const after = await prisma.$transaction(async (tx) => {
    const r = await applyRating(tx, duel.aUserId, duel.id, delta);
    return r;
  });
  const leagueBefore = leagueFor(after.before);
  const leagueAfter = leagueFor(after.after);
  if (outcome === "win") await grantWinBonus(duel.aUserId);
  await maybeUnlockRewards(duel.aUserId);
  if (leagueAfter.min > leagueBefore.min) await maybeUnlockRewards(duel.aUserId);

  const verdict =
    outcome === "win" ? "🏆 Победа!" : outcome === "loss" ? "Поражение — реванш?" : "Ничья";
  notify(
    aTelegramId,
    `⚔️ <b>Дуэль завершена</b>\n\n${verdict}\nВы: ${playerPercent}% · Соперник: ${rivalPercent}%\nРейтинг: ${after.before} → ${after.after}`
  );

  return updated;
}

async function finishPvpDuel(duel: Duel): Promise<Duel> {
  const aAttempt = await prisma.attempt.findUniqueOrThrow({ where: { id: duel.aAttemptId! } });
  const bAttempt = await prisma.attempt.findUniqueOrThrow({ where: { id: duel.bAttemptId! } });
  const aPercent = aAttempt.percent ?? 0;
  const bPercent = bAttempt.percent ?? 0;
  const diff = aPercent - bPercent;
  const draw = Math.abs(diff) < DUEL_DRAW_DELTA;
  const winnerUserId = draw ? null : diff > 0 ? duel.aUserId : duel.bUserId;

  const difficulty = duel.difficulty as Difficulty;
  const aOutcome = draw ? "draw" : diff > 0 ? "win" : "loss";
  const bOutcome = draw ? "draw" : diff > 0 ? "loss" : "win";
  const aDelta = ratingDelta("pvp", aOutcome, difficulty);
  const bDelta = ratingDelta("pvp", bOutcome, difficulty);

  const updated = await prisma.duel.update({
    where: { id: duel.id },
    data: { status: "finished", winnerUserId, delta: aDelta },
  });

  const after = await prisma.$transaction(async (tx) => {
    const ra = await applyRating(tx, duel.aUserId, duel.id, aDelta);
    const rb = await applyRating(tx, duel.bUserId!, duel.id, bDelta);
    return { ra, rb };
  });
  if (winnerUserId) await grantWinBonus(winnerUserId);
  await maybeUnlockRewards(duel.aUserId);
  await maybeUnlockRewards(duel.bUserId!);
  if (leagueFor(after.rb.after).min > leagueFor(after.rb.before).min) {
    await maybeUnlockRewards(duel.bUserId!);
  }

  const [aUser, bUser] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: duel.aUserId } }),
    prisma.user.findUniqueOrThrow({ where: { id: duel.bUserId! } }),
  ]);
  const textFor = (won: boolean, me: number, rival: number, before: number, afterR: number) =>
    `⚔️ <b>Дуэль завершена</b>\n\n${won ? "🏆 Победа!" : draw ? "Ничья" : "Поражение — реванш?"}\nВы: ${me}% · Соперник: ${rival}%\nРейтинг: ${before} → ${afterR}`;
  notify(aUser.telegramId, textFor(aOutcome === "win", aPercent, bPercent, after.ra.before, after.ra.after));
  notify(bUser.telegramId, textFor(bOutcome === "win", bPercent, aPercent, after.rb.before, after.rb.after));

  return updated;
}

/** Экспирация: > 48 ч → expired; ничья, если оба участника есть. */
export async function expireDuel(duel: Duel): Promise<void> {
  if (duel.status === "finished" || duel.status === "expired") return;
  await prisma.duel.update({ where: { id: duel.id }, data: { status: "expired", winnerUserId: null, delta: 0 } });
  if (duel.bUserId) {
    await prisma.$transaction(async (tx) => {
      await applyRating(tx, duel.aUserId, duel.id, 0);
      await applyRating(tx, duel.bUserId!, duel.id, 0);
    });
  }
}

export async function expireOutdatedDuels(): Promise<number> {
  const stale = await prisma.duel.findMany({
    where: { status: { in: ["open", "awaiting"] }, expiresAt: { lt: new Date() } },
    take: 200,
  });
  for (const duel of stale) await expireDuel(duel);
  return stale.length;
}
