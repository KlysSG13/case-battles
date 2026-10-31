import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MODES,
  isMode,
  isDifficulty,
  newRoundId,
  type Mode,
  type Difficulty,
  timeLimitFor,
} from "@/lib/modes";
import { generateScenario, toPublicScenario } from "@/lib/scenario";
import { coreCasesForDomain } from "@/lib/case-bank";
import { completedRoundsToday } from "@/lib/rounds";
import { FREE_DAILY_LIMIT, DAILY_RATE_LIMIT } from "@/lib/gamification";
import { mskDayStartUtc } from "@/lib/msk";
import { isProActive } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/app/round/start {mode, domainId?, difficulty, attempts}
 * Создаёт раунд: pending-попытка №1 с кейсом или сгенерированным сценарием.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const user = auth.user;

  const body = (await req.json().catch(() => null)) as {
    mode?: string;
    domainId?: number;
    difficulty?: string;
    attempts?: number;
    caseId?: number;
  } | null;

  if (!body || !isMode(body.mode)) {
    return NextResponse.json({ error: "Неизвестный режим", code: "bad_mode" }, { status: 400 });
  }
  const mode = body.mode as Mode;
  if (!isDifficulty(body.difficulty)) {
    return NextResponse.json({ error: "Неизвестная сложность", code: "bad_difficulty" }, { status: 400 });
  }
  const difficulty = body.difficulty as Difficulty;
  const config = MODES[mode];

  const attempts = config.allowsMultiAttempt && body.attempts === 3 ? 3 : 1;

  // лимиты (квота — в раундах; rate — по попыткам за сутки)
  const dayStart = mskDayStartUtc();
  const [roundsToday, attemptsToday] = await Promise.all([
    completedRoundsToday(user.id),
    prisma.attempt.count({ where: { userId: user.id, startedAt: { gte: dayStart } } }),
  ]);
  if (!isProActive(user) && roundsToday >= FREE_DAILY_LIMIT) {
    return NextResponse.json(
      { error: "Бесплатные раунды на сегодня закончились", code: "quota" },
      { status: 403 }
    );
  }
  if (attemptsToday >= DAILY_RATE_LIMIT) {
    return NextResponse.json(
      { error: "Слишком много попыток за сутки", code: "rate_limit" },
      { status: 429 }
    );
  }

  let domainId = Number.isInteger(body.domainId) ? (body.domainId as number) : null;
  let domain = domainId
    ? await prisma.domain.findUnique({ where: { id: domainId } })
    : null;
  if (!domain) {
    domain = await prisma.domain.findFirst({ orderBy: { sort: "asc" } });
    domainId = domain?.id ?? null;
  }
  if (!domain) {
    return NextResponse.json({ error: "Домены не найдены", code: "no_domains" }, { status: 404 });
  }

  // суффикс "-a3" кодирует режим «Три попытки» (лимит читает attempt-роут)
  const roundId = attempts === 3 ? `${newRoundId()}-a3` : newRoundId();

  // --- Источник контента раунда ---
  let scenarioPublic: ReturnType<typeof toPublicScenario> | null = null;
  let scenarioJson: string | null = null;
  let fallbackCaseId: number | null = null;
  let casePayload: {
    id: number;
    title: string;
    body: string;
    domain: { id: number; slug: string; title: string; emoji: string };
  } | null = null;
  // core-режимы (лёгкая подача): задача из core-банка в блоках
  let taskPayload: {
    title: string;
    blocks: unknown[];
    domainSlug: string;
    domainTitle: string;
    domainEmoji: string;
  } | null = null;

  if (config.tier === "core" && !config.allowsScenario) {
    // Спасение/Питч: одношаговый лёгкий кейс выбранной сферы (банк в коде)
    const pool = coreCasesForDomain(domain.slug);
    if (pool.length > 0) {
      const solvedCore = await prisma.attempt.findMany({
        where: { userId: user.id, status: "completed", mode },
        select: { scenarioJson: true },
        take: 50,
      });
      const solvedSlugs = new Set(
        solvedCore
          .map((a) => {
            try {
              const parsed = JSON.parse(a.scenarioJson ?? "{}") as { coreCase?: { slug?: string } };
              return parsed.coreCase?.slug;
            } catch {
              return undefined;
            }
          })
          .filter((x): x is string => !!x)
      );
      const fresh = pool.filter((c) => !solvedSlugs.has(c.slug));
      const source = fresh.length > 0 ? fresh : pool;
      const core = source[Math.floor(Math.random() * source.length)];
      scenarioJson = JSON.stringify({ coreCase: core });
      taskPayload = {
        title: core.title,
        blocks: core.blocks,
        domainSlug: domain.slug,
        domainTitle: domain.title,
        domainEmoji: domain.emoji,
      };
    }
  }

  if (config.allowsScenario && !taskPayload) {
    const outcome = await generateScenario(mode as "constructor" | "rescue", domain.title, async () => {
      const candidates = await prisma.case.findMany({
        where: { domainId: domain!.id, isActive: true },
        select: { id: true },
      });
      const id = candidates[Math.floor(Math.random() * candidates.length)]?.id ?? 0;
      const c = await prisma.case.findUnique({ where: { id }, include: { domain: true } });
      return { caseId: id, caseBody: c?.body ?? "", caseTitle: c?.title ?? "Кейс" };
    });
    if (outcome.kind === "generated") {
      scenarioPublic = toPublicScenario(outcome.scenario);
      scenarioJson = JSON.stringify(outcome.scenario);
      fallbackCaseId = null;
    } else {
      // фолбэк: статический кейс домена, режим не падает (рубрика режима сохраняется)
      const c = await prisma.case.findUnique({
        where: { id: outcome.caseId },
        include: { domain: true },
      });
      if (c) {
        fallbackCaseId = c.id;
        casePayload = {
          id: c.id,
          title: c.title,
          body: c.body,
          domain: { id: c.domain.id, slug: c.domain.slug, title: c.domain.title, emoji: c.domain.emoji },
        };
      }
    }
  } else if (!taskPayload) {
    // классика (hard-банк из БД): конкретный кейс (оверрайд, например «кейс дня») или
    // наименее решённый нерешённый активный кейс домена
    let nextId: number | null = null;
    if (Number.isInteger(body.caseId)) {
      const forced = await prisma.case.findUnique({
        where: { id: body.caseId as number },
        select: { id: true, isActive: true },
      });
      if (forced?.isActive) nextId = forced.id;
    }
    if (nextId === null) {
      const activeCases = await prisma.case.findMany({
        where: { domainId: domain.id, isActive: true },
        select: { id: true },
        orderBy: { id: "asc" },
      });
      if (activeCases.length === 0) {
        return NextResponse.json({ error: "Кейсы в домене не найдены", code: "no_cases" }, { status: 404 });
      }
      const solved = await prisma.attempt.findMany({
        where: { userId: user.id, status: "completed", caseId: { in: activeCases.map((c) => c.id) } },
        select: { caseId: true },
      });
      const solvedIds = new Set(solved.map((a) => a.caseId));
      const unsolved = activeCases.filter((c) => !solvedIds.has(c.id));
      if (unsolved.length > 0) {
        const counts = await prisma.attempt.groupBy({
          by: ["caseId"],
          where: { status: "completed", caseId: { in: unsolved.map((c) => c.id) } },
          _count: { _all: true },
        });
        const countByCase = new Map(counts.map((row) => [row.caseId, row._count._all]));
        unsolved.sort(
          (a, b) => (countByCase.get(a.id) ?? 0) - (countByCase.get(b.id) ?? 0) || a.id - b.id
        );
        nextId = unsolved[0].id;
      } else {
        nextId = activeCases[Math.floor(Math.random() * activeCases.length)].id;
      }
    }
    const c = await prisma.case.findUnique({ where: { id: nextId }, include: { domain: true } });
    if (c) {
      fallbackCaseId = c.id;
      casePayload = {
        id: c.id,
        title: c.title,
        body: c.body,
        domain: { id: c.domain.id, slug: c.domain.slug, title: c.domain.title, emoji: c.domain.emoji },
      };
    }
  }

  const attempt = await prisma.attempt.create({
    data: {
      userId: user.id,
      caseId: fallbackCaseId,
      answer: "",
      status: "pending",
      startedAt: new Date(),
      mode,
      difficulty,
      roundId,
      attemptNo: 1,
      scenarioJson,
    },
  });

  return NextResponse.json({
    roundId,
    attemptId: attempt.id,
    mode,
    modeTitle: config.title,
    difficulty,
    attempts,
    timeLimitSec: timeLimitFor(mode, difficulty),
    answerMin: config.answerMin,
    answerMax: config.answerMax,
    modeHint: config.hint,
    domain: { slug: domain.slug, title: domain.title, emoji: domain.emoji },
    task: taskPayload,
    scenario: scenarioPublic,
    scenarioFallback: !scenarioPublic && !taskPayload && config.allowsScenario,
    case: casePayload,
  });
}
