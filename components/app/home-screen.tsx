"use client";

import { BatteryCharging, ChevronRight, Flame, Swords, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { Bootstrap, ModeInfo } from "@/lib/client";
import { haptic } from "@/lib/client";
import { cn } from "@/lib/utils";

interface HomeScreenProps {
  data: Bootstrap | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenCase: (caseId: number) => void;
  onOpenMode: (mode: ModeInfo) => void;
  onOpenDuels: () => void;
  onOpenRewards: () => void;
  startingMode: string | null;
}

function DifficultyDots({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Сложность ${level} из 3`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i <= level ? "bg-magenta shadow-[0_0_6px_rgba(255,45,120,0.8)]" : "bg-white/15"
          )}
        />
      ))}
    </span>
  );
}

export function HomeScreen({
  data,
  loading,
  error,
  onRetry,
  onOpenCase,
  onOpenMode,
  onOpenDuels,
  onOpenRewards,
  startingMode,
}: HomeScreenProps) {
  if (loading && !data) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-16 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
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
  const { profile, modes, dailyCase, quota } = data;
  const league = profile.league;

  return (
    <div className="animate-rise space-y-4 p-4 pb-6">
      <header className="flex items-end justify-between pt-2">
        <div>
          <p className="font-display text-[11px] tracking-[0.25em] text-dim">КЕЙС-БАТТЛЫ</p>
          <h1 className="font-display text-xl font-bold text-fog">
            Привет, <span className="text-neon text-glow">{profile.firstName}</span>
          </h1>
        </div>
        {quota.limit !== null && (
          <div className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-right">
            <p className="font-display text-[9px] tracking-wider text-dim">РАУНДОВ СЕГОДНЯ</p>
            <p className="font-display text-sm font-bold text-neon">{quota.remaining}/3</p>
          </div>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Card className="glow-magenta border-magenta/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-magenta">
              <Flame className="h-4 w-4" />
              <span className="font-display text-[10px] tracking-widest">СЕРИЯ</span>
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-fog">
              {profile.streakCurrent} <span className="text-sm text-dim">дн.</span>
            </p>
            <p className="mt-1 text-[11px] text-dim">рекорд: {profile.streakBest} дн.</p>
          </CardContent>
        </Card>

        <Card className="glow-soft">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-neon">
              <Zap className="h-4 w-4" />
              <span className="font-display text-[10px] tracking-widest">УРОВЕНЬ {profile.progress.level}</span>
            </div>
            <p className="mt-2 font-display text-2xl font-bold text-fog">
              {profile.xpTotal} <span className="text-sm text-dim">XP</span>
            </p>
            <div className="mt-2">
              <Progress value={profile.progress.progressPct} />
              <p className="mt-1 text-[10px] text-dim">
                до ур. {profile.progress.level + 1}: {profile.progress.xpToNext} XP
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => { haptic("light"); onOpenDuels(); }} className="text-left active:scale-[0.99]">
          <Card className="h-full border-line">
            <CardContent className="flex items-center gap-3 p-3.5">
              <span className="text-xl">{league.emoji}</span>
              <div className="min-w-0">
                <p className="font-display text-[10px] tracking-widest text-dim">ЛИГА</p>
                <p className="font-display text-sm font-bold" style={{ color: league.color }}>
                  {league.title} · {profile.rating}
                </p>
                {league.next && (
                  <p className="text-[10px] text-dim">до {league.next.title}: {league.next.min - profile.rating}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </button>

        <button onClick={() => { haptic("light"); onOpenDuels(); }} className="text-left active:scale-[0.99]">
          <Card className={cn("h-full", profile.mascot.sleeping ? "border-line" : "border-neon/30")}>
            <CardContent className="flex items-center gap-3 p-3.5">
              <BatteryCharging className={cn("h-6 w-6 shrink-0", profile.mascot.charge >= 60 ? "text-neon" : profile.mascot.sleeping ? "text-dim" : "text-amber-400")} />
              <div className="min-w-0 flex-1">
                <p className="font-display text-[10px] tracking-widest text-dim">СИНТ-ДРОН</p>
                <p className={cn("font-display text-sm font-bold", profile.mascot.sleeping ? "text-dim" : "text-fog")}>
                  {profile.mascot.charge}% · {profile.mascot.label}
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn("h-full rounded-full", profile.mascot.charge >= 60 ? "bg-neon" : profile.mascot.charge > 20 ? "bg-amber-400" : "bg-magenta")}
                    style={{ width: `${profile.mascot.charge}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </button>
      </div>

      {dailyCase && (
        <button
          className="w-full text-left"
          onClick={() => {
            haptic("light");
            onOpenCase(dailyCase.id);
          }}
        >
          <Card className="group border-neon/30 bg-gradient-to-br from-panel to-panel-2 glow-neon transition-transform active:scale-[0.99]">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-neon/30 bg-neon/10 text-2xl">
                {dailyCase.domainEmoji}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[10px] tracking-[0.2em] text-neon">КЕЙС ДНЯ · КЛАССИКА</p>
                <p className="mt-0.5 truncate font-display text-sm font-semibold text-fog">
                  {dailyCase.title}
                </p>
                <div className="mt-1.5 flex items-center gap-3">
                  <span className="text-[11px] text-dim">{dailyCase.domainTitle}</span>
                  <DifficultyDots level={dailyCase.difficulty} />
                </div>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-neon" />
            </CardContent>
          </Card>
        </button>
      )}

      <section>
        <h2 className="mb-2.5 font-display text-[11px] tracking-[0.25em] text-dim">РЕЖИМЫ</h2>
        <div className="grid grid-cols-2 gap-3">
          {modes.map((m) => (
            <button
              key={m.slug}
              disabled={startingMode !== null}
              onClick={() => {
                haptic("light");
                onOpenMode(m);
              }}
              className={cn(
                "rounded-xl border border-line bg-panel/70 p-3 text-left transition-all active:scale-95",
                startingMode === m.slug && "border-neon/60 glow-neon",
                startingMode !== null && startingMode !== m.slug && "opacity-50"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{m.emoji}</span>
                <span className="font-display text-[10px] text-dim">{Math.round(m.baseTimeLimitSec / 60)} мин</span>
              </div>
              <p className="mt-2 font-display text-[12px] font-bold text-fog">{m.title}</p>
              <p className="mt-0.5 text-[10px] leading-tight text-dim">{m.short}</p>
            </button>
          ))}
          <button
            onClick={() => {
              haptic("light");
              onOpenDuels();
            }}
            className="rounded-xl border border-magenta/40 bg-magenta/8 p-3 text-left transition-all active:scale-95 glow-magenta"
          >
            <div className="flex items-center justify-between">
              <Swords className="h-6 w-6 text-magenta" />
              <span className="font-display text-[10px] text-dim">PVP · AI</span>
            </div>
            <p className="mt-2 font-display text-[12px] font-bold text-fog">Дуэли</p>
            <p className="mt-0.5 text-[10px] leading-tight text-dim">рейтинг, лиги, реванш</p>
          </button>
        </div>
      </section>

      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] text-dim">3 бесплатных раунда в сутки · оценка ИИ по рубрике</p>
        {profile.rewardsUnlocked && (
          <button onClick={onOpenRewards} className="shrink-0 text-[11px] text-neon">
            🎁 награды
          </button>
        )}
      </div>
    </div>
  );
}
