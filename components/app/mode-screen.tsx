"use client";

import { useState } from "react";
import { ArrowLeft, Clock, Layers } from "lucide-react";
import { Stepper } from "@/components/app/stepper";
import { Button } from "@/components/ui/button";
import { haptic, type Bootstrap } from "@/lib/client";
import { cn } from "@/lib/utils";

type Difficulty = "easy" | "normal" | "hard";

const DIFFS: { key: Difficulty; label: string; hint: string }[] = [
  { key: "easy", label: "ЛЁГКИЙ", hint: "×1.2 времени" },
  { key: "normal", label: "СРЕДНИЙ", hint: "×1.0" },
  { key: "hard", label: "СЛОЖНЫЙ", hint: "×1.3 очков" },
];

const TIME_HINT: Record<string, string> = { easy: "×1.2", normal: "×1.0", hard: "×0.8" };

interface ModeScreenProps {
  bootstrap: Bootstrap;
  domainId: number;
  onBack: () => void;
  onStart: (opts: { mode: string; difficulty: Difficulty; attempts: number }) => void;
  loadingMode: string | null;
}

/** Шаг 2 визарда: режим. Тап по карточке режима = старт (≤3 тапа от хаба). */
export function ModeScreen({ bootstrap, domainId, onBack, onStart, loadingMode }: ModeScreenProps) {
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [attempts, setAttempts] = useState(1);
  const domain = bootstrap.domains.find((d) => d.id === domainId);

  return (
    <div className="animate-rise min-h-dvh p-4 pb-8">
      <header className="flex items-center gap-3 pt-2 pb-4">
        <button
          onClick={onBack}
          aria-label="Назад к сферам"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-dim transition-colors hover:bg-white/5 hover:text-fog"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Stepper current={2} />
      </header>

      <p className="font-display text-[10px] tracking-[0.25em] text-dim">
        {domain?.emoji} {(domain?.title ?? "СФЕРА").toUpperCase()}
      </p>
      <h1 className="mt-0.5 font-display text-lg font-bold text-fog">Режим захода</h1>

      <div className="mt-5 space-y-2.5">
        {bootstrap.modes.map((m) => (
          <button
            key={m.slug}
            disabled={loadingMode !== null}
            onClick={() => {
              haptic("light");
              onStart({ mode: m.slug, difficulty, attempts });
            }}
            className={cn(
              "flex w-full items-center gap-3.5 rounded-xl border bg-panel/60 p-4 text-left transition-all active:scale-[0.99]",
              loadingMode === m.slug ? "border-neon/60 glow-neon" : "border-line",
              loadingMode !== null && loadingMode !== m.slug && "opacity-50"
            )}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-panel-2 text-xl">
              {m.emoji}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[14px] font-bold text-fog">{m.title}</span>
              <span className="block text-[12px] leading-snug text-dim">{m.short}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1 font-display text-[10px] text-dim">
              <Clock className="h-3 w-3" />
              {Math.round((m.baseTimeLimitSec * (difficulty === "easy" ? 1.2 : difficulty === "hard" ? 0.8 : 1)) / 60)}м
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        <div>
          <p className="mb-1.5 font-display text-[10px] tracking-[0.25em] text-dim">СЛОЖНОСТЬ</p>
          <div className="flex gap-2">
            {DIFFS.map((d) => (
              <button
                key={d.key}
                onClick={() => {
                  haptic("light");
                  setDifficulty(d.key);
                }}
                className={cn(
                  "flex-1 rounded-lg border py-2.5 font-display text-[10px] font-bold tracking-wider transition-colors",
                  difficulty === d.key
                    ? "border-magenta/60 bg-magenta/10 text-magenta"
                    : "border-line text-dim"
                )}
              >
                {d.label}
                <span className="mt-0.5 block text-[8px] font-normal opacity-70">{d.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 font-display text-[10px] tracking-[0.25em] text-dim">ПОПЫТКИ</p>
          <div className="flex gap-2">
            {[1, 3].map((n) => (
              <button
                key={n}
                onClick={() => {
                  haptic("light");
                  setAttempts(n);
                }}
                className={cn(
                  "flex-1 rounded-lg border py-2.5 font-display text-[10px] font-bold tracking-wider transition-colors",
                  attempts === n ? "border-neon/60 bg-neon/10 text-neon" : "border-line text-dim"
                )}
              >
                <Layers className="mr-1 inline h-3 w-3" />
                {n === 1 ? "ОДНА" : "ТРИ · ЛУЧШАЯ"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-5 text-center text-[11px] leading-relaxed text-dim">
        Нажми на режим — заход начнётся сразу с выбранной сложностью
        <span className="opacity-70"> ({TIME_HINT[difficulty]} времени)</span>
      </p>
      <Button variant="ghost" className="mt-2 w-full" onClick={onBack}>
        ← СМЕНИТЬ СФЕРУ
      </Button>
    </div>
  );
}
