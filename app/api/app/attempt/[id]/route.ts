import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { levelProgress } from "@/lib/levels";
import { MODES } from "@/lib/modes";
import type { Evaluation } from "@/lib/evaluator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AiRaw {
  engine?: "llm" | "mock";
  evaluation?: Evaluation;
  error?: string;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { id } = await ctx.params;
  const attemptId = Number(id);
  if (!Number.isInteger(attemptId)) {
    return NextResponse.json({ error: "Попытка не найдена" }, { status: 404 });
  }

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { case: { include: { criteria: true, domain: true } } },
  });
  if (!attempt || attempt.userId !== auth.user.id) {
    return NextResponse.json({ error: "Попытка не найдена" }, { status: 404 });
  }

  if (attempt.status === "pending") {
    return NextResponse.json({ status: "pending" });
  }
  if (attempt.status === "failed") {
    return NextResponse.json({
      status: "failed",
      message: "ИИ не смог оценить ответ. Отправьте его повторно.",
    });
  }

  let aiRaw: AiRaw = {};
  try {
    aiRaw = JSON.parse(attempt.aiRaw ?? "{}") as AiRaw;
  } catch {
    aiRaw = {};
  }
  const evaluation = aiRaw.evaluation;
  if (!evaluation) {
    return NextResponse.json({
      status: "failed",
      message: "Оценка не сохранилась. Отправьте ответ повторно.",
    });
  }

  let missed: string[] = [];
  try {
    const parsed = JSON.parse(attempt.missedJson ?? "[]") as unknown;
    if (Array.isArray(parsed)) missed = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    missed = [];
  }

  const rubricCriteria = attempt.case?.criteria ?? [];
  const maxByCriterion = new Map(rubricCriteria.map((c) => [c.name, c.maxPoints]));
  const modeConfig = MODES[attempt.mode as keyof typeof MODES] ?? MODES.classic;
  if (!attempt.case) {
    // режим с шаблонной рубрикой — maxPoints из конфига
    for (const c of modeConfig.rubric) maxByCriterion.set(c.name, c.maxPoints);
  }

  // раунд: сколько попыток осталось и можно ли открывать эталон
  let attemptsLeft: number | null = null;
  let roundBestPercent: number | null = null;
  if (attempt.roundId) {
    const roundAttempts = await prisma.attempt.findMany({
      where: { roundId: attempt.roundId, userId: attempt.userId, status: "completed" },
      select: { percent: true, isBest: true },
    });
    roundBestPercent = roundAttempts.reduce((m, a) => Math.max(m, a.percent ?? 0), 0);
    const roundMax = attempt.roundId.endsWith("-a3") ? 3 : 1;
    attemptsLeft = Math.max(0, roundMax - roundAttempts.length);
  }
  const showModelAnswer = attemptsLeft === null || attemptsLeft <= 0;

  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.user.id } });
  const progress = levelProgress(user.xpTotal);

  return NextResponse.json({
    status: "completed",
    attemptId: attempt.id,
    caseTitle: attempt.case?.title ?? (attempt.scenarioJson ? modeConfig.title : "Раунд"),
    mode: attempt.mode,
    modeTitle: modeConfig.title,
    difficulty: attempt.difficulty,
    attemptNo: attempt.attemptNo,
    isBest: attempt.isBest,
    roundId: attempt.roundId,
    attemptsLeft,
    roundBestPercent,
    percent: attempt.percent ?? 0,
    xpEarned: attempt.xpEarned,
    engine: aiRaw.engine ?? "llm",
    criteria: evaluation.criteria.map((c) => ({
      name: c.name,
      points: c.points,
      maxPoints: maxByCriterion.get(c.name) ?? 10,
      comment: c.comment,
    })),
    strengths: evaluation.strengths,
    improvements: evaluation.improvements,
    missed,
    modelAnswer: showModelAnswer ? evaluation.model_answer : null,
    user: {
      level: progress.level,
      xpTotal: user.xpTotal,
      streakCurrent: user.streakCurrent,
      streakBest: user.streakBest,
      progressPct: progress.progressPct,
      xpToNext: progress.xpToNext,
      rating: user.rating,
    },
  });
}
