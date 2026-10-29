import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MODES, isMode, type Mode, type Difficulty } from "@/lib/modes";
import { completeAttempt, completedRoundsToday } from "@/lib/rounds";
import { FREE_DAILY_LIMIT, DAILY_RATE_LIMIT } from "@/lib/gamification";
import { mskDayStartUtc } from "@/lib/msk";
import { isProActive } from "@/lib/entitlements";
import type { Scenario } from "@/lib/scenario";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/app/attempt
 *  - legacy: {caseId, answer, startedAt} — классика, один кейс
 *  - раунд:  {roundId, answer} — попытка №N раунда (режимы/«Три попытки»)
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const user = auth.user;

  const body = (await req.json().catch(() => null)) as {
    caseId?: number;
    answer?: string;
    startedAt?: string;
    roundId?: string;
  } | null;
  if (!body || typeof body.answer !== "string" || (!body.roundId && !Number.isInteger(body.caseId))) {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const dayStart = mskDayStartUtc();
  const [roundsToday, attemptsToday] = await Promise.all([
    completedRoundsToday(user.id),
    prisma.attempt.count({ where: { userId: user.id, startedAt: { gte: dayStart } } }),
  ]);

  let attemptId: number;
  let scenario: Scenario | null = null;
  let mode: Mode = "classic";
  let difficulty: Difficulty = "normal";
  let roundId: string | null = null;
  let attemptNo = 1;
  let startedAt: Date;
  let timeSpentSec: number;
  let isRepeatCase = false;

  if (body.roundId) {
    // ---- Раундовый путь ----
    const roundAttempts = await prisma.attempt.findMany({
      where: { roundId: body.roundId, userId: user.id },
      orderBy: { attemptNo: "asc" },
    });
    if (roundAttempts.length === 0) {
      return NextResponse.json({ error: "Раунд не найден", code: "round_not_found" }, { status: 404 });
    }
    const first = roundAttempts[0];
    if (first.userId !== user.id) {
      return NextResponse.json({ error: "Раунд не найден", code: "round_not_found" }, { status: 404 });
    }
    mode = isMode(first.mode) ? first.mode : "classic";
    difficulty = (first.difficulty as Difficulty) ?? "normal";
    roundId = body.roundId;
    const config = MODES[mode];

    const completed = roundAttempts.filter((a) => a.status === "completed");
    // лимит попыток раунда закодирован суффиксом roundId: "-a3" = три попытки
    const roundMax = config.allowsMultiAttempt && roundId.endsWith("-a3") ? 3 : 1;

    if (completed.length >= roundMax) {
      return NextResponse.json(
        { error: "Попытки раунда исчерпаны", code: "attempts_exhausted" },
        { status: 409 }
      );
    }
    if (roundAttempts.some((a) => a.status === "pending" && a.id !== first.id)) {
      return NextResponse.json({ error: "Дождитесь оценки предыдущей попытки", code: "busy" }, { status: 409 });
    }

    // квота: раунд уже оплачен квотой при попытке №1; новая квота — только для нового раунда
    const roundCounted = completed.some((a) => a.attemptNo === 1);
    if (!roundCounted) {
      if (!isProActive(user) && roundsToday >= FREE_DAILY_LIMIT) {
        return NextResponse.json(
          { error: "Бесплатные раунды на сегодня закончились", code: "quota" },
          { status: 403 }
        );
      }
    }
    if (attemptsToday >= DAILY_RATE_LIMIT) {
      return NextResponse.json(
        { error: "Слишком много попыток за сутки. Возвращайтесь завтра!", code: "rate_limit" },
        { status: 429 }
      );
    }

    attemptNo = completed.length + 1;
    if (attemptNo > 1 && !config.allowsMultiAttempt) {
      return NextResponse.json(
        { error: "В этом режиме одна попытка", code: "single_attempt" },
        { status: 409 }
      );
    }

    const answer = body.answer.trim().slice(0, config.answerMax);
    if (answer.length < config.answerMin) {
      return NextResponse.json(
        { error: `Минимум ${config.answerMin} символов — раскройте решение подробнее`, code: "answer_too_short" },
        { status: 400 }
      );
    }

    if (first.scenarioJson) {
      try {
        scenario = JSON.parse(first.scenarioJson) as Scenario;
      } catch {
        scenario = null;
      }
    }
    if (first.caseId) {
      const c = await prisma.case.findUnique({ where: { id: first.caseId } });
      if (c) {
        isRepeatCase = !!(await prisma.attempt.findFirst({
          where: { userId: user.id, status: "completed", caseId: c.id, mode },
          select: { id: true },
        }));
      }
    }

    const pending =
      attemptNo === 1 && first.status === "pending" && !first.answer
        ? first
        : await prisma.attempt.create({
            data: {
              userId: user.id,
              caseId: first.caseId,
              answer: "",
              status: "pending",
              startedAt: new Date(),
              mode,
              difficulty,
              roundId,
              attemptNo,
              scenarioJson: first.scenarioJson,
            },
          });
    attemptId = pending.id;
    startedAt = pending.startedAt;
    timeSpentSec = Math.max(0, Math.min(3600, Math.round((Date.now() - startedAt.getTime()) / 1000)));

    const result = await completeAttempt({
      user,
      attemptId,
      caseRow: first.caseId ? await prisma.case.findUnique({ where: { id: first.caseId } }) : null,
      scenario,
      answer,
      timeSpentSec,
      mode,
      difficulty,
      roundId,
      attemptNo,
      isRepeatCase,
    });
    if (!result.ok) {
      return NextResponse.json({ attemptId, status: "failed" });
    }
    return NextResponse.json({
      attemptId,
      status: result.attempt.status,
      percent: result.percent,
      xpEarned: result.xpEarned,
      roundBestPercent: result.roundBestPercent,
      attemptsUsed: attemptNo,
    });
  }

  // ---- Legacy: классика по caseId (старые клиенты и e2e) ----
  const config = MODES.classic;
  const answer = body.answer!.trim().slice(0, config.answerMax);
  if (answer.length < config.answerMin) {
    return NextResponse.json(
      { error: `Минимум ${config.answerMin} символов — раскройте решение подробнее`, code: "answer_too_short" },
      { status: 400 }
    );
  }
  if (!isProActive(user) && roundsToday >= FREE_DAILY_LIMIT) {
    return NextResponse.json(
      { error: "Бесплатные кейсы на сегодня закончились", code: "quota" },
      { status: 403 }
    );
  }
  if (attemptsToday >= DAILY_RATE_LIMIT) {
    return NextResponse.json(
      { error: "Слишком много попыток за сутки. Возвращайтесь завтра!", code: "rate_limit" },
      { status: 429 }
    );
  }

  const startedMs = body.startedAt ? Date.parse(body.startedAt) : NaN;
  startedAt = new Date(Number.isFinite(startedMs) ? startedMs : Date.now());
  timeSpentSec = Math.max(0, Math.min(3600, Math.round((Date.now() - startedAt.getTime()) / 1000)));

  const found = await prisma.case.findUnique({ where: { id: body.caseId as number } });
  if (!found || !found.isActive) {
    return NextResponse.json({ error: "Кейс не найден" }, { status: 404 });
  }
  isRepeatCase = !!(await prisma.attempt.findFirst({
    where: { userId: user.id, status: "completed", caseId: found.id, mode: "classic" },
    select: { id: true },
  }));

  const attempt = await prisma.attempt.create({
    data: {
      userId: user.id,
      caseId: found.id,
      answer,
      status: "pending",
      startedAt,
      mode: "classic",
      difficulty: "normal",
      attemptNo: 1,
    },
  });

  const result = await completeAttempt({
    user,
    attemptId: attempt.id,
    caseRow: found,
    scenario: null,
    answer,
    timeSpentSec,
    mode: "classic",
    difficulty: "normal",
    roundId: null,
    attemptNo: 1,
    isRepeatCase,
  });
  if (!result.ok) {
    return NextResponse.json({ attemptId: attempt.id, status: "failed" });
  }
  return NextResponse.json({ attemptId: attempt.id, status: result.attempt.status });
}
