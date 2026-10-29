import type { Attempt, Case as CaseRow, User } from "@prisma/client";
import { prisma } from "./prisma";
import {
  MODES,
  type Mode,
  type Difficulty,
  timeLimitFor,
} from "./modes";
import { evaluateAnswer, type CriterionInput } from "./evaluator";
import {
  applyStreakRules,
  evaluateBadges,
  xpForAttempt,
  FREE_DAILY_LIMIT,
} from "./gamification";
import { levelFromXp } from "./levels";
import { mskDayStartUtc } from "./msk";
import type { Scenario } from "./scenario";

/** Рубрика раунда: у классики — рубрика кейса из БД, у режимов — шаблон из конфига. */
export async function rubricInputs(
  mode: Mode,
  caseRow: CaseRow | null
): Promise<CriterionInput[]> {
  if (MODES[mode].usesCaseRubric) {
    if (!caseRow) return [];
    const criteria = await prisma.criterion.findMany({ where: { caseId: caseRow.id } });
    return criteria.map((c) => ({
      name: c.name,
      description: c.description,
      weight: c.weight,
      maxPoints: c.maxPoints,
    }));
  }
  return MODES[mode].rubric;
}

/** Завершённые «раунды» за сегодня (попытка №1) — квота free. */
export async function completedRoundsToday(userId: number): Promise<number> {
  return prisma.attempt.count({
    where: {
      userId,
      status: "completed",
      attemptNo: 1,
      submittedAt: { gte: mskDayStartUtc() },
    },
  });
}

export interface CompleteAttemptArgs {
  user: User;
  attemptId: number;
  caseRow: CaseRow | null;
  scenario: Scenario | null;
  answer: string;
  timeSpentSec: number;
  mode: Mode;
  difficulty: Difficulty;
  roundId: string | null;
  attemptNo: number;
  /** уже решён этот кейс в этом режиме раньше (правило повтора) */
  isRepeatCase: boolean;
}

export type CompleteResult =
  | { ok: true; attempt: Attempt; percent: number; xpEarned: number; engine: "llm" | "mock"; missed: string[]; roundBestPercent: number; isBest: boolean }
  | { ok: false; error: string };

/**
 * Оценка ответа + начисление XP/серии/бейджей в ОДНОЙ транзакции.
 * XP-леджер раунда: попытка №1 — полная формула (с бонусом первого за день);
 * попытки 2–3 — только прирост базы до нового лучшего процента.
 */
export async function completeAttempt(args: CompleteAttemptArgs): Promise<CompleteResult> {
  const { user, attemptId, caseRow, scenario, answer, timeSpentSec, mode, difficulty } = args;

  // core-кейс хранится в scenarioJson под ключом coreCase (лёгкие режимы)
  let coreCase: { title: string; blocks: unknown[]; missedFactors: string[] } | null = null;
  {
    const raw = await prisma.attempt.findUnique({
      where: { id: attemptId },
      select: { scenarioJson: true },
    });
    if (raw?.scenarioJson) {
      try {
        const parsed = JSON.parse(raw.scenarioJson) as {
          coreCase?: { title?: string; blocks?: unknown[]; missedFactors?: string[] };
        };
        if (parsed.coreCase?.title && Array.isArray(parsed.coreCase.blocks)) {
          coreCase = {
            title: parsed.coreCase.title,
            blocks: parsed.coreCase.blocks,
            missedFactors: parsed.coreCase.missedFactors ?? [],
          };
        }
      } catch {
        coreCase = null;
      }
    }
  }

  const caseTitle = coreCase?.title ?? scenario?.title ?? caseRow?.title ?? "Раунд";
  const caseBody = coreCase
    ? (await import("./task-blocks")).blocksToPlainText(coreCase.blocks as never[])
    : scenario
      ? (await import("./scenario")).scenarioToCaseText(scenario)
      : (caseRow?.body ?? "");
  const criteria = await rubricInputs(mode, caseRow);

  const outcome = await evaluateAnswer({
    caseTitle,
    caseBody,
    criteria,
    answer,
    timeSpentSec,
    modeContext: MODES[mode].promptContext || undefined,
    missedFactors: coreCase?.missedFactors ?? scenario?.missedFactors,
  });

  if (!outcome.ok) {
    const aiRaw = JSON.stringify({
      engine: "llm",
      error: outcome.error,
      attemptsUsed: outcome.attemptsUsed,
      durationMs: outcome.durationMs,
      rawContent: outcome.rawContent?.slice(0, 6000) ?? null,
      timeSpentSec,
    });
    await prisma.attempt.update({
      where: { id: attemptId },
      data: { status: "failed", submittedAt: new Date(), timeSpentSec, aiRaw },
    });
    return { ok: false, error: outcome.error };
  }

  // --- XP-леджер раунда ---
  const previous = args.roundId
    ? await prisma.attempt.findMany({
        where: { roundId: args.roundId, userId: user.id, status: "completed" },
        select: { percent: true, xpEarned: true },
      })
    : [];

  const prevBestPercent = previous.reduce((m, a) => Math.max(m, a.percent ?? 0), 0);
  const dayStart = mskDayStartUtc();
  const completedRoundsBefore = await prisma.attempt.count({
    where: {
      userId: user.id,
      status: "completed",
      attemptNo: 1,
      submittedAt: { gte: dayStart },
      id: { not: attemptId },
    },
  });
  const isFirstToday = completedRoundsBefore === 0;

  let xpEarned: number;
  if (args.attemptNo === 1) {
    xpEarned = args.isRepeatCase ? 0 : xpForAttempt(outcome.percent, isFirstToday);
  } else {
    const base = (p: number) => xpForAttempt(p, false);
    xpEarned = outcome.percent > prevBestPercent ? base(outcome.percent) - base(prevBestPercent) : 0;
  }

  // дрон: заряд >= 60 -> +10% к XP матча
  if (xpEarned > 0 && user.mascotCharge >= 60) {
    xpEarned = Math.round(xpEarned * 1.1);
  }

  const aiRaw = JSON.stringify({
    engine: outcome.engine,
    attemptsUsed: outcome.attemptsUsed,
    durationMs: outcome.durationMs,
    rawContent: outcome.rawContent?.slice(0, 6000) ?? null,
    evaluation: outcome.evaluation,
    timeSpentSec,
    mode,
    difficulty,
  });

  const updated = await prisma.$transaction(async (tx) => {
    const attempt = await tx.attempt.update({
      where: { id: attemptId },
      data: {
        answer,
        status: "completed",
        submittedAt: new Date(),
        timeSpentSec,
        percent: outcome.percent,
        xpEarned,
        aiRaw,
        missedJson: JSON.stringify(outcome.missed),
      },
    });

    // isBest пересчитывается по раунду
    let isBest = true;
    if (args.roundId) {
      await tx.attempt.updateMany({
        where: { roundId: args.roundId, userId: user.id },
        data: { isBest: false },
      });
      const best = await tx.attempt.findFirst({
        where: { roundId: args.roundId, userId: user.id, status: "completed" },
        orderBy: [{ percent: "desc" }, { submittedAt: "asc" }],
      });
      if (best) {
        await tx.attempt.update({ where: { id: best.id }, data: { isBest: true } });
        isBest = best.id === attemptId;
      }
    }

    const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    const streak = applyStreakRules(
      fresh.streakCurrent,
      fresh.streakBest,
      fresh.lastActiveDate
    );
    await tx.user.update({
      where: { id: user.id },
      data: {
        xpTotal: fresh.xpTotal + xpEarned,
        level: levelFromXp(fresh.xpTotal + xpEarned),
        streakCurrent: streak.streakCurrent,
        streakBest: streak.streakBest,
        lastActiveDate: new Date(),
      },
    });

    await evaluateBadges(user.id, tx);
    return { attempt, isBest };
  });

  const roundBestPercent = Math.max(prevBestPercent, outcome.percent);
  return {
    ok: true,
    attempt: updated.attempt,
    percent: outcome.percent,
    xpEarned,
    engine: outcome.engine,
    missed: outcome.missed,
    roundBestPercent,
    isBest: updated.isBest,
  };
}

export { timeLimitFor, FREE_DAILY_LIMIT };
