"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, type LeaderboardData } from "@/lib/client";
import { cn } from "@/lib/utils";

type Period = "week" | "all" | "league";

interface LeaderboardScreenProps {
  refreshToken: number;
}

export function LeaderboardScreen({ refreshToken }: LeaderboardScreenProps) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBoard = useCallback(
    async (period: Period): Promise<LeaderboardData> =>
      apiFetch<LeaderboardData>(`/api/app/leaderboard?period=${period}`),
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const board = await fetchBoard("week");
        if (!cancelled) setData(board);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Не удалось загрузить рейтинг");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchBoard, refreshToken]);

  const switchPeriod = useCallback(
    async (period: Period) => {
      if (data?.period === period) return;
      setLoading(true);
      setError(null);
      try {
        setData(await fetchBoard(period));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось загрузить рейтинг");
      } finally {
        setLoading(false);
      }
    },
    [data?.period, fetchBoard]
  );

  const medals = ["🥇", "🥈", "🥉"];

  const renderRow = (row: LeaderboardData["rows"][number], unit: "XP" | "RT") => (
    <div
      key={`${row.place}-${row.name}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5",
        row.isMe ? "border-neon/50 bg-neon/10 glow-neon" : "border-line bg-panel/50"
      )}
    >
      <span className="w-8 shrink-0 text-center font-display text-sm font-bold text-dim">
        {row.place <= 3 ? medals[row.place - 1] : row.place}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[14px] font-semibold", row.isMe ? "text-neon" : "text-fog")}>
          {row.name} {row.isMe && "· вы"}
          {row.isPro && <span className="ml-1 rounded bg-magenta/20 px-1 py-px font-display text-[8px] font-bold text-magenta">PRO</span>}
        </p>
        <p className="text-[11px] text-dim">уровень {row.level}</p>
      </div>
      <span className="font-display text-sm font-bold text-fog">
        {row.xp} {unit === "XP" ? "XP" : ""}
      </span>
    </div>
  );

  return (
    <div className="animate-rise min-h-dvh space-y-4 p-4 pb-6">
      <div className="flex items-center gap-2 pt-2">
        <Trophy className="h-5 w-5 text-neon" />
        <h1 className="font-display text-lg font-bold text-fog">Лидерборд</h1>
      </div>

      <Tabs defaultValue="week" onValueChange={(v) => switchPeriod(v as Period)}>
        <TabsList className="w-full">
          <TabsTrigger value="week">НЕДЕЛЯ</TabsTrigger>
          <TabsTrigger value="all">ВСЁ ВРЕМЯ</TabsTrigger>
          <TabsTrigger value="league">ЛИГА</TabsTrigger>
        </TabsList>
        <TabsContent value="week">
          <LeaderboardBody
            loading={loading}
            error={error}
            data={data}
            unit="XP"
            renderRow={renderRow}
            onRetry={() => switchPeriod("week")}
            emptyText="На этой неделе ещё никто не набрал XP. Реши кейс первым!"
            footer="неделя — с понедельника 00:00 по Москве"
          />
        </TabsContent>
        <TabsContent value="all">
          <LeaderboardBody
            loading={loading}
            error={error}
            data={data}
            unit="XP"
            renderRow={renderRow}
            onRetry={() => switchPeriod("all")}
            emptyText="Пока пусто. Реши первый кейс!"
            footer="суммарный XP за всё время"
          />
        </TabsContent>
        <TabsContent value="league">
          <LeaderboardBody
            loading={loading}
            error={error}
            data={data}
            unit="RT"
            renderRow={renderRow}
            onRetry={() => switchPeriod("league")}
            emptyText="Пока пусто. Сыграй дуэль, чтобы подняться в лиге!"
            footer="рейтинг дуэлей: Бронза < 1100 · Серебро · Золото · Платина ≥ 1600"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LeaderboardBody({
  loading,
  error,
  data,
  unit,
  renderRow,
  onRetry,
  emptyText,
  footer,
}: {
  loading: boolean;
  error: string | null;
  data: LeaderboardData | null;
  unit: "XP" | "RT";
  renderRow: (row: LeaderboardData["rows"][number], unit: "XP" | "RT") => React.ReactNode;
  onRetry: () => void;
  emptyText: string;
  footer: string;
}) {
  if (loading && !data) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-dim">{error}</p>
        <button
          onClick={onRetry}
          className="rounded-lg border border-neon/50 bg-neon/10 px-5 py-2 font-display text-sm text-neon"
        >
          ПОВТОРИТЬ
        </button>
      </div>
    );
  }
  if (!data) return null;

  const meInTop = data.rows.some((r) => r.isMe);
  const meOutside = !meInTop && data.me;

  return (
    <div className="space-y-2">
      {data.rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-[13px] text-dim">{emptyText}</CardContent>
        </Card>
      ) : (
        data.rows.map((r) => renderRow(r, unit))
      )}
      {meOutside && (
        <>
          <p className="pt-2 text-center font-display text-[10px] tracking-[0.25em] text-dim">· · ·</p>
          {renderRow({ ...meOutside, isMe: true }, unit)}
        </>
      )}
      <p className="pt-2 text-center text-[11px] text-dim">{footer}</p>
    </div>
  );
}
