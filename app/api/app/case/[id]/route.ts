import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Текст кейса без рубрики и критериев — они не отдаются до отправки ответа.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { id } = await ctx.params;
  const caseId = Number(id);
  if (!Number.isInteger(caseId)) {
    return NextResponse.json({ error: "Кейс не найден" }, { status: 404 });
  }
  const found = await prisma.case.findUnique({
    where: { id: caseId },
    include: { domain: true },
  });
  if (!found || !found.isActive) {
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
