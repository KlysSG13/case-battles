import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Наименее решённый активный кейс домена, который юзер ещё не решал.
 * Если решены все — случайный активный кейс домена.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const domainId = Number(req.nextUrl.searchParams.get("domainId"));
  if (!Number.isInteger(domainId) || domainId <= 0) {
    return NextResponse.json({ error: "Некорректный domainId" }, { status: 400 });
  }

  const [domain, activeCases] = await Promise.all([
    prisma.domain.findUnique({ where: { id: domainId } }),
    prisma.case.findMany({
      where: { domainId, isActive: true },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
  ]);
  if (!domain || activeCases.length === 0) {
    return NextResponse.json({ error: "Кейсы в домене не найдены" }, { status: 404 });
  }

  const solved = await prisma.attempt.findMany({
    where: {
      userId: auth.user.id,
      status: "completed",
      caseId: { in: activeCases.map((c) => c.id) },
    },
    select: { caseId: true },
  });
  const solvedIds = new Set(solved.map((a) => a.caseId));

  const unsolved = activeCases.filter((c) => !solvedIds.has(c.id));
  let nextId: number;
  if (unsolved.length > 0) {
    const counts = await prisma.attempt.groupBy({
      by: ["caseId"],
      where: { status: "completed", caseId: { in: unsolved.map((c) => c.id) } },
      _count: { _all: true },
    });
    const countByCase = new Map(counts.map((row) => [row.caseId, row._count._all]));
    unsolved.sort(
      (a, b) =>
        (countByCase.get(a.id) ?? 0) - (countByCase.get(b.id) ?? 0) || a.id - b.id
    );
    nextId = unsolved[0].id;
  } else {
    nextId = activeCases[Math.floor(Math.random() * activeCases.length)].id;
  }

  const found = await prisma.case.findUnique({
    where: { id: nextId },
    include: { domain: true },
  });
  if (!found) {
    return NextResponse.json({ error: "Кейс не найден" }, { status: 404 });
  }
  return NextResponse.json({
    id: found.id,
    title: found.title,
    body: found.body,
    timeLimitSec: found.timeLimitSec,
    difficulty: found.difficulty,
    domain: {
      id: found.domain.id,
      slug: found.domain.slug,
      title: found.domain.title,
      emoji: found.domain.emoji,
    },
  });
}
