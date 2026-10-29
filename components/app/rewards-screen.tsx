"use client";

import { ArrowLeft, Gift, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Profile } from "@/lib/client";
import { cn } from "@/lib/utils";

const REWARDS = [
  {
    title: "Разбор с наставником",
    description: "Часовой разбор ваших решений с практикующим наставником",
    emoji: "🧭",
  },
  {
    title: "Доступ к клубу инвесторов",
    description: "Питч перед небольшим клубом ранних инвесторов",
    emoji: "🎩",
  },
  {
    title: "Скидка на курс",
    description: "Промокод на продвинутый курс по выбранному домену",
    emoji: "🎟️",
  },
];

interface RewardsScreenProps {
  profile: Profile | null;
  onBack: () => void;
}

export function RewardsScreen({ profile, onBack }: RewardsScreenProps) {
  const unlocked = profile?.rewardsUnlocked ?? false;
  return (
    <div className="animate-rise min-h-dvh space-y-4 p-4 pb-8">
      <header className="flex items-center gap-3 pt-2">
        <button onClick={onBack} aria-label="Назад" className="rounded-lg p-1.5 text-dim hover:text-fog">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="font-display text-[10px] tracking-[0.25em] text-dim">ДОСТИЖЕНИЯ</p>
          <h1 className="font-display text-lg font-bold text-fog">🎁 Награды</h1>
        </div>
      </header>

      {!unlocked && (
        <Card className="border-line">
          <CardContent className="p-4 text-[13px] leading-relaxed text-dim">
            Награды открываются за <span className="text-fog">переход в новую лигу</span> или{" "}
            <span className="text-fog">3 победы подряд в AI-дуэлях</span>. Дрон верит в вас.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {REWARDS.map((r) => (
          <Card
            key={r.title}
            className={cn(
              unlocked ? "border-neon/40 bg-neon/5 glow-neon" : "border-line bg-panel/40"
            )}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-2xl",
                  unlocked ? "border-neon/40 bg-neon/10" : "border-line opacity-40 grayscale"
                )}
              >
                {r.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn("font-display text-sm font-bold", unlocked ? "text-fog" : "text-dim")}>
                  {r.title}
                </p>
                <p className="mt-0.5 text-[12px] leading-snug text-dim">{r.description}</p>
                <p className="mt-1 font-display text-[10px] tracking-widest text-magenta">СКОРО</p>
              </div>
              {!unlocked && <Lock className="h-4 w-4 shrink-0 text-dim/50" />}
              {unlocked && <Gift className="h-4 w-4 shrink-0 text-neon" />}
            </CardContent>
          </Card>
        ))}
      </div>

      <Button variant="outline" className="w-full" onClick={onBack}>НАЗАД В ПРОФИЛЬ</Button>
    </div>
  );
}
