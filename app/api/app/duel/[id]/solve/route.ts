import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { solveDuel } from "@/lib/duels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/app/duel/[id]/solve {answer, startedAt} — ответ в дуэле (свой или чужой вызов). */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { id } = await ctx.params;
  const duelId = Number(id);
  if (!Number.isInteger(duelId)) {
    return NextResponse.json({ error: "Дуэль не найдена" }, { status: 404 });
  }
  const body = (await req.json().catch(() => null)) as {
    answer?: string;
    startedAt?: string;
  } | null;
  if (!body || typeof body.answer !== "string") {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const result = await solveDuel(auth.user, duelId, body.answer, body.startedAt ?? null);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.status }
    );
  }
  return NextResponse.json({
    attemptId: result.attemptId,
    percent: result.percent,
    duelStatus: result.duel.status,
    duelId: result.duel.id,
  });
}
