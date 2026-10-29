import { NextRequest, NextResponse } from "next/server";
import { expireOutdatedDuels } from "@/lib/duels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

/** Экспирация дуэлей старше 48 часов (ничья для двух участников). */
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const expired = await expireOutdatedDuels();
  return NextResponse.json({ ok: true, expired });
}
