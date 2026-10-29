import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getLeaderboard, type LeaderboardPeriod } from "@/lib/leaderboard";
import { awardTop3Week } from "@/lib/gamification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const periodParam = req.nextUrl.searchParams.get("period");
  const period: LeaderboardPeriod =
    periodParam === "all" ? "all" : periodParam === "league" ? "league" : "week";

  // бейдж top3_week начисляется при подсчёте недельного лидерборда
  if (period === "week") {
    const weekBoard = await getLeaderboard("week", auth.user.id);
    await awardTop3Week(weekBoard.topUserIds);
    return NextResponse.json({
      period: weekBoard.period,
      rows: weekBoard.rows,
      me: weekBoard.me,
    });
  }

  const board = await getLeaderboard(period, auth.user.id);
  return NextResponse.json({
    period: board.period,
    rows: board.rows,
    me: board.me,
  });
}
