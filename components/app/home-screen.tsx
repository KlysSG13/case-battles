"use client";

import { ChevronRight, Flame, Play, Plus, Swords, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { Bootstrap } from "@/lib/client";
import { haptic } from "@/lib/client";

interface HomeScreenProps {
  data: Bootstrap | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onContinue: () => void;
  onNewRun: () => void;
  onDuels: () => void;
  startingMode: string | null;
}

/**
 * Хаб: максимум 3 первичных действия — продолжить / новый заход / дуэли.
 * Серия и уровень — компактная строка статуса; всё второстепенное — в профиле.
 */
export function HomeScreen({
  data,
  loading,
  error,
  onRetry,
  onContinue,
  onNewRun,
  onDuels,
  startingMode,
}: HomeScreenProps) {
  if (loading && !data) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-14 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <p className="text-dim">{error}</p>
        <button
          onClick={onRetry}
          className="rounded-lg border border-neon/50 bg-neon/10 px-5 py-2.5 font-display text-sm text-neon glow-neon"
        >
          ПОВТОРИТЬ
        </button>
      </div>
    );
  }

  if (!data) return null;
  const { profile, dailyCase, quota } = data;

  return (
    <div className="animate-rise space-y-5 p-4 pb-6">
      <header className="flex items-end justify-between pt-3">
        <div>
          <p className="font-display text-[11px] tracking-[0.25em] text-dim">КЕЙС-БАТТЛЫ</p>
          <h1 className="font-display text-xl font-bold text-fog">
            Привет, <span className="text-neon text-glow">{profile.firstName}</span>
          </h1>
        </div>
        <div className="flex items-center gap-3 text-dim">
          <span className="flex items-center gap-1 font-display text-[12px]" title="Серия дней">
            <Flame className="h-3.5 w-3.5 text-magenta" />
            {profile.streakCurrent}
          </span>
          <span className="flex items-center gap-1 font-display text-[12px]" title={`Лига ${profile.league.title}`}>
            {profile.league.emoji}
            {profile.rating}
          </span>
        </div>
      </header>

      <div className="rounded-xl bg-panel/50 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-[11px] tracking-widest text-dim">
            УРОВЕНЬ {profile.progress.level}
          </span>
          <span className="font-display text-[11px] text-dim">
            {profile.xpTotal} XP · ещё {profile.progress.xpToNext}
          </span>
        </div>
        <div className="mt-2">
          <Progress value={profile.progress.progressPct} />
        </div>
      </div>

      {/* Три первичных действия */}
      <div className="space-y-3">
        <button
          className="block w-full text-left active:scale-[0.99]"
          disabled={startingMode !== null}
          onClick={() => {
            haptic("light");
            onContinue();
          }}
        >
          <Card className="border-neon/30 bg-gradient-to-br from-panel to-panel-2 glow-neon">
            <CardContent className="flex items-center gap-4 p-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-neon/30 bg-neon/10 text-2xl">
                {dailyCase?.domainEmoji ?? "📘"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[10px] tracking-[0.2em] text-neon">
                  ПРОДОЛЖИТЬ · КЕЙС ДНЯ
                </span>
                <span className="block truncate font-display text-sm font-semibold text-fog">
                  {dailyCase?.title ?? "Классический кейс"}
                </span>
                {quota.limit !== null && (
                  <span className="block text-[11px] text-dim">
                    раундов сегодня: {quota.remaining}/3
                  </span>
                )}
              </span>
              <Play className="h-5 w-5 shrink-0 text-neon" />
            </CardContent>
          </Card>
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button
            className="active:scale-[0.98]"
            disabled={startingMode !== null}
            onClick={() => {
              haptic("light");
              onNewRun();
            }}
          >
            <Card className="h-full">
              <CardContent className="flex h-full flex-col gap-2 p-4">
                <Plus className="h-5 w-5 text-fog" />
                <span className="font-display text-[13px] font-bold leading-tight text-fog">
                  Новый заход
                </span>
                <span className="text-[11px] leading-tight text-dim">сфера → режим → игра</span>
              </CardContent>
            </Card>
          </button>
          <button
            className="active:scale-[0.98]"
            disabled={startingMode !== null}
            onClick={() => {
              haptic("light");
              onDuels();
            }}
          >
            <Card className="h-full border-magenta/30">
              <CardContent className="flex h-full flex-col gap-2 p-4">
                <Swords className="h-5 w-5 text-magenta" />
                <span className="font-display text-[13px] font-bold leading-tight text-fog">Дуэли</span>
                <span className="text-[11px] leading-tight text-dim">ИИ или друг · рейтинг</span>
              </CardContent>
            </Card>
          </button>
        </div>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-dim">
        <Zap className="h-3 w-3" />
        оценка ИИ по рубрике · дрон и бейджи — в профиле
        <ChevronRight className="h-3 w-3" />
      </p>
    </div>
  );
}
