import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendStreakReminder, tgApi } from "@/lib/telegram";
import { mskDayStartUtc, mskDayString } from "@/lib/msk";
import { tickMascot } from "@/lib/mascot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  if (header === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

/**
 * Ежедневный cron:
 *  1) напоминания о серии (streakCurrent > 0, не активен сегодня) — дедуп 1/сутки на тип;
 *  2) пересчёт заряда синт-дрона (+15/−10) и уведомление «дрон в спячке» при charge ≤ 20.
 */
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.BOT_TOKEN) {
    return NextResponse.json({ ok: true, sent: 0, skipped: 0, mock: true });
  }

  const streakCandidates = await prisma.user.findMany({
    where: {
      streakCurrent: { gt: 0 },
      lastActiveDate: { lt: mskDayStartUtc() },
    },
    select: { telegramId: true, streakCurrent: true },
  });

  let sent = 0;
  let skipped = 0;
  for (const candidate of streakCandidates) {
    const ok = await sendStreakReminder(candidate.telegramId, candidate.streakCurrent);
    if (ok) sent++;
    else skipped++;
  }

  // дрон: пересчёт за прошедший день + «заряди матчами» при низком заряде
  const allUsers = await prisma.user.findMany({
    select: { id: true, telegramId: true },
    take: 5000,
  });
  let mascotNotified = 0;
  const today = mskDayString();
  for (const u of allUsers) {
    const state = await tickMascot(u.id);
    if (state.charge <= 20) {
      try {
        await prisma.reminderLog.create({
          data: { userId: u.id, date: today, type: "mascot" },
        });
      } catch {
        continue; // уже уведомляли сегодня
      }
      const res = await tgApi("sendMessage", {
        chat_id: u.telegramId,
        parse_mode: "HTML",
        text: "🔋 Дрон в спячке — заряди его матчами! Один раунд сегодня вернёт +15 заряда. /app",
      });
      if (res.ok) mascotNotified++;
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    mascotNotified,
    total: streakCandidates.length,
  });
}
