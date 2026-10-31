import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lazyDailyGrant } from "@/lib/hints";
import { coreCaseBySlug } from "@/lib/case-bank";
import { MODES } from "@/lib/modes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/app/hint — баланс подсказок (ленивый дневной грант при первом чтении).
 * POST /api/app/hint {roundId} — списать 1 подсказку и получить текст наводки
 * для текущего раунда (classic case.hint / core-case hint / сценарий режима).
 * PvP-дуэли — подсказки недоступны (честность); AI-дуэли используют кейс напрямую.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const grant = lazyDailyGrant(auth.user);
  let user = auth.user;
  if (grant.granted > 0) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { hintsBalance: grant.balance, lastHintGrantDate: grant.grantDate },
    });
  }
  return NextResponse.json({ balance: user.hintsBalance, grantedNow: grant.granted });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const grant = lazyDailyGrant(auth.user);
  let user = auth.user;
  if (grant.granted > 0) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { hintsBalance: grant.balance, lastHintGrantDate: grant.grantDate },
    });
  }
  if (user.hintsBalance <= 0) {
    return NextResponse.json(
      { error: "Подсказки закончились", code: "no_hints", balance: 0 },
      { status: 402 }
    );
  }

  const body = (await req.json().catch(() => null)) as { roundId?: string } | null;
  if (!body?.roundId) {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  // PvP-дуэль по этому кейсу — подсказки недоступны
  const first = await prisma.attempt.findFirst({
    where: { roundId: body.roundId, userId: user.id },
    orderBy: { attemptNo: "asc" },
  });
  if (!first) {
    return NextResponse.json({ error: "Раунд не найден" }, { status: 404 });
  }
  if (first.caseId) {
    const pvpDuel = await prisma.duel.findFirst({
      where: {
        caseId: first.caseId,
        status: { in: ["open", "awaiting"] },
        bUserId: { not: null },
        OR: [{ aUserId: user.id }, { bUserId: user.id }],
      },
      select: { id: true },
    });
    if (pvpDuel) {
      return NextResponse.json(
        { error: "В дуэли с живым соперником подсказки недоступны", code: "pvp_fair" },
        { status: 403 }
      );
    }
  }

  // текст наводки: core-кейс / статический кейс / сценарий режима
  let hint: string | null = null;
  if (first.scenarioJson) {
    try {
      const parsed = JSON.parse(first.scenarioJson) as {
        coreCase?: { slug?: string; hint?: string };
      };
      if (parsed.coreCase?.slug) {
        hint = coreCaseBySlug(parsed.coreCase.slug)?.hint ?? null;
      }
    } catch {
      hint = null;
    }
    if (!hint) {
      // сгенерированный сценарий конструктора
      hint =
        "Сначала собери юнит-экономику на выданных деньгах (сколько продаж в день нужно для нуля), " +
        "затем распредели усилие по каналам с наименьшей стоимостью привлечения и проверь три правила.";
    }
  } else if (first.caseId) {
    const c = await prisma.case.findUnique({ where: { id: first.caseId }, select: { hint: true } });
    hint = c?.hint ?? null;
  }
  if (!hint && first.mode in MODES) {
    hint = MODES[first.mode as keyof typeof MODES].hint;
  }
  if (!hint) {
    return NextResponse.json({ error: "Для этого раунда нет подсказки" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { hintsBalance: { decrement: 1 } },
  });

  return NextResponse.json({ hint, balance: user.hintsBalance - 1 });
}
