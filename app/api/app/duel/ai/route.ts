import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { createAiDuel } from "@/lib/duels";
import { isMode, isDifficulty, type Mode, type Difficulty, type RivalStyle } from "@/lib/modes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/app/duel/ai {caseId, mode, style, difficulty} — создать AI-дуэль. */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const body = (await req.json().catch(() => null)) as {
    caseId?: number;
    mode?: string;
    style?: string;
    difficulty?: string;
  } | null;
  if (!body || !Number.isInteger(body.caseId) || !isMode(body.mode)) {
    return NextResponse.json({ error: "Некорректный запрос", code: "bad_request" }, { status: 400 });
  }
  const style: RivalStyle =
    body.style === "hustler" || body.style === "systemizer" ? body.style : "analyst";
  const difficulty: Difficulty = isDifficulty(body.difficulty) ? body.difficulty : "normal";

  const duel = await createAiDuel(
    auth.user,
    body.caseId as number,
    body.mode as Mode,
    style,
    difficulty
  );
  if ("error" in duel) {
    return NextResponse.json({ error: duel.error }, { status: 404 });
  }
  return NextResponse.json({ duelId: duel.id, status: duel.status });
}
