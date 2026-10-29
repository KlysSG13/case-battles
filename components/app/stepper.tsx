"use client";

import { cn } from "@/lib/utils";

const STEPS = ["Сфера", "Режим", "Игра"] as const;

interface StepperProps {
  current: 1 | 2 | 3;
  className?: string;
}

/** Хлебные крошки визарда: 1 Сфера · 2 Режим · 3 Игра. */
export function Stepper({ current, className }: StepperProps) {
  return (
    <ol className={cn("flex items-center gap-1.5 px-1", className)} aria-label={`Шаг ${current} из 3`}>
      {STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li key={label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md font-display text-[11px] font-bold transition-colors",
                active && "border border-neon/60 bg-neon/15 text-neon shadow-[0_0_10px_rgba(0,240,255,0.25)]",
                done && "border border-neon/30 bg-transparent text-neon/70",
                !active && !done && "border border-line text-dim/60"
              )}
            >
              {done ? "✓" : step}
            </span>
            <span
              className={cn(
                "font-display text-[10px] tracking-widest",
                active ? "text-fog" : "text-dim/60"
              )}
            >
              {label.toUpperCase()}
            </span>
            {step < STEPS.length && (
              <span className={cn("h-px w-4", step < current ? "bg-neon/40" : "bg-line")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
