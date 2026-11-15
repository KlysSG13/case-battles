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
 * Ежедневный cron (00:05 MSK):
 *  1) burn — серия сгорает: lastActiveDate раньше начала вчера → streakCurrent = 0.
 *     Юзер пропустил весь «льготный» день — повторных напоминаний больше не будет.
 *     Burn выполняется ВСЕГДА (операция с данными, не зависит от BOT_TOKEN).
 *  2) напоминание «серия сгорит» — ТОЛЬКО юзерам с lastActiveDate = вчера
 *     (серия жива, но под угрозой — ровно один шанс успеть сегодня).
 *  3) PRO истекает через ≤2 дней — напоминание (дедуп 1/сутки на тип).
 *  4) пересчёт заряда синт-дрона (+15/−10) и «дрон в спячке» при charge ≤ 20.
 */
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const hasBot = !!process.env.BOT_TOKEN;
  const todayStart = mskDayStartUtc();
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 3600 * 1000); // MSK без DST
  const today = mskDayString();

  // --- 1) burn: серия сгорела (юзер не пришёл в льготный день) ---
  const burnResult = await prisma.user.updateMany({
    where: {
      streakCurrent: { gt: 0 },
      lastActiveDate: { lt: yesterdayStart },
    },
    data: { streakCurrent: 0 },
  });

  // --- 2) напоминание: только активным вчера (серия жива, но под угрозой) ---
  const streakCandidates = await prisma.user.findMany({
    where: {
      streakCurrent: { gt: 0 },
      lastActiveDate: { gte: yesterdayStart, lt: todayStart },
    },
    select: { telegramId: true, streakCurrent: true },
  });

  let sent = 0;
  let skipped = 0;
  if (hasBot) {
    for (const candidate of streakCandidates) {
      const ok = await sendStreakReminder(candidate.telegramId, candidate.streakCurrent);
      if (ok) sent++;
      else skipped++;
    }
  }

  // --- 3) PRO истекает через ≤2 дней — напоминание (дедуп 1/сутки, тип pro_expiry) ---
  let proExpiryNotified = 0;
  if (hasBot) {
    const soon = new Date(Date.now() + 2 * 24 * 3600 * 1000);
    const proUsers = await prisma.user.findMany({
      where: { proUntil: { gt: new Date(), lte: soon } },
      select: { id: true, telegramId: true, proUntil: true },
    });
    for (const u of proUsers) {
      try {
        await prisma.reminderLog.create({
          data: { userId: u.id, date: today, type: "pro_expiry" },
        });
      } catch {
        continue; // уже уведомляли сегодня
      }
      const until = u.proUntil?.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" }) ?? "";
      const res = await tgApi("sendMessage", {
        chat_id: u.telegramId,
        parse_mode: "HTML",
        text: `💎 PRO истекает ${until}. Продлите, чтобы сохранить безлимит раундов и подсказки: /pro`,
      });
      if (res.ok) proExpiryNotified++;
    }
  }

  // --- 4) дрон: пересчёт за прошедший день + «заряди матчами» при низком заряде ---
  let mascotNotified = 0;
  if (hasBot) {
    const allUsers = await prisma.user.findMany({
      select: { id: true, telegramId: true },
      take: 5000,
    });
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
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    burned: burnResult.count,
    mascotNotified,
    proExpiryNotified,
    total: streakCandidates.length,
    mock: hasBot ? undefined : true,
  });
}
