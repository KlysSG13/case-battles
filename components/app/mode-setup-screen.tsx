"use client";

import { useState } from "react";
import { ArrowLeft, Clock, Layers, Timer, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Bootstrap, ModeInfo } from "@/lib/client";
import { haptic } from "@/lib/client";
import { cn } from "@/lib/utils";

type Difficulty = "easy" | "normal" | "hard";

const DIFFS: { key: Difficulty; label: string; time: string; rating: string }[] = [
  { key: "easy", label: "Лёгкий", time: "×1.2 времени", rating: "×0.8 очков" },
  { key: "normal", label: "Средний", time: "×1.0 времени", rating: "×1.0 очков" },
  { key: "hard", label: "Сложный", time: "×0.8 времени", rating: "×1.3 очков" },
];

interface ModeSetupScreenProps {
  mode: ModeInfo;
  bootstrap: Bootstrap;
  onBack: () => void;
  onStart: (opts: { domainId: number; difficulty: Difficulty; attempts: number }) => void;
  loading: boolean;
}

export function ModeSetupScreen({ mode, bootstrap, onBack, onStart, loading }: ModeSetupScreenProps) {
  const [domainId, setDomainId] = useState(bootstrap.domains[0]?.id ?? 0);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [attempts, setAttempts] = useState(1);
  const multi = mode.slug === "classic" || mode.slug === "constructor" || mode.slug === "rescue";

  return (
    <div className="animate-rise min-h-dvh space-y-5 p-4 pb-8">
      <header className="flex items-center gap-3 pt-2">
        <button
          onClick={onBack}
          aria-label="Назад"
          className="rounded-lg p-1.5 text-dim transition-colors hover:bg-white/5 hover:text-fog"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="font-display text-[10px] tracking-[0.25em] text-dim">НАСТРОЙКА РАУНДА</p>
          <h1 className="font-display text-lg font-bold text-fog">
            {mode.emoji} {mode.title}
          </h1>
        </div>
      </header>

      <p className="text-[13px] leading-relaxed text-dim">{mode.description}</p>

      <section>
        <h2 className="mb-2 font-display text-[11px] tracking-[0.25em] text-dim">ДОМЕН</h2>
        <div className="grid grid-cols-3 gap-3">
          {bootstrap.domains.map((d) => (
            <button
              key={d.id}
              onClick={() => {
                haptic("light");
                setDomainId(d.id);
              }}
              className={cn(
                "rounded-xl border p-3 text-center transition-all active:scale-95",
                domainId === d.id
                  ? "border-neon/60 bg-neon/10 glow-neon"
                  : "border-line bg-panel/70"
              )}
            >
              <div className="text-2xl">{d.emoji}</div>
              <p className="mt-1.5 font-display text-[10px] font-semibold leading-tight text-fog">{d.title}</p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-[11px] tracking-[0.25em] text-dim">СЛОЖНОСТЬ</h2>
        <div className="space-y-2">
          {DIFFS.map((d) => (
            <button
              key={d.key}
              onClick={() => {
                haptic("light");
                setDifficulty(d.key);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-all",
                difficulty === d.key
                  ? "border-magenta/60 bg-magenta/10"
                  : "border-line bg-panel/50"
              )}
            >
              <span className="flex items-center gap-2 font-display text-sm font-semibold text-fog">
                <Zap className={cn("h-4 w-4", difficulty === d.key ? "text-magenta" : "text-dim")} />
                {d.label}
              </span>
              <span className="text-[11px] text-dim">
                {d.time} · {d.rating}
              </span>
            </button>
          ))}
        </div>
      </section>

      {multi && (
        <section>
          <h2 className="mb-2 font-display text-[11px] tracking-[0.25em] text-dim">ПОПЫТКИ</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 1, label: "Одна", hint: "классический зачёт" },
              { value: 3, label: "Три", hint: "между — только «что упущено», зачёт по лучшей" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  haptic("light");
                  setAttempts(opt.value);
                }}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all",
                  attempts === opt.value ? "border-neon/60 bg-neon/10" : "border-line bg-panel/50"
                )}
              >
                <div className="flex items-center gap-1.5 font-display text-sm font-bold text-fog">
                  <Layers className="h-4 w-4 text-neon" />
                  {opt.label}
                </div>
                <p className="mt-1 text-[10px] leading-tight text-dim">{opt.hint}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2 text-dim">
            <Clock className="h-4 w-4" />
            <span className="text-[12px]">таймер раунда</span>
          </div>
          <span className="font-display text-sm font-bold text-neon">
            {Math.round((mode.baseTimeLimitSec * (difficulty === "easy" ? 1.2 : difficulty === "hard" ? 0.8 : 1)) / 60)} мин
          </span>
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" disabled={loading} onClick={() => onStart({ domainId, difficulty, attempts })}>
        <Timer className="h-4 w-4" />
        {loading ? "ГОТОВИМ…" : "НАЧАТЬ РАУНД"}
      </Button>
    </div>
  );
}
