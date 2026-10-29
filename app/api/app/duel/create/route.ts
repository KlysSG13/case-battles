import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { createPvpDuel } from "@/lib/duels";
import { getBotUsername } from "@/lib/telegram";
import { isMode, isDifficulty, type Mode, type Difficulty } from "@/lib/modes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/app/duel/create {domainId, mode, difficulty?} — открытый PvP-вызов + deep link. */
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const body = (await req.json().catch(() => null)) as {
    domainId?: number;
    mode?: string;
    difficulty?: string;
  } | null;
  if (!body || !Number.isInteger(body.domainId) || !isMode(body.mode)) {
    return NextResponse.json({ error: "Некорректный запрос", code: "bad_request" }, { status: 400 });
  }
  const difficulty: Difficulty = isDifficulty(body.difficulty) ? body.difficulty : "normal";

  const duel = await createPvpDuel(auth.user, body.domainId as number, body.mode as Mode, difficulty);
  if ("error" in duel) {
    return NextResponse.json({ error: duel.error }, { status: 404 });
  }

  const shortName = (process.env.APP_SHORT_NAME ?? "").trim();
  const botUsername = await getBotUsername();
  const link =
    shortName && botUsername
      ? `https://t.me/${botUsername}/${shortName}?startapp=duel_${duel.id}`
      : null;

  return NextResponse.json({
    duelId: duel.id,
    status: duel.status,
    link,
    linkHint: link
      ? null
      : "Задайте APP_SHORT_NAME и BOT_TOKEN в .env, чтобы получить прямую ссылку t.me/<bot>/<app>?startapp=duel_<id>",
  });
}
