"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PERCENT_COLORS } from "@/lib/design-tokens";

type DroneState = "idle" | "happy" | "sleep";

interface DroneProps {
  charge: number; // 0..100 — уровень читается цветом ядра и свечением
  state?: DroneState;
  size?: number; // базовый размер в px (мини 56 / реакция 96 / полный 140)
  className?: string;
}

function coreColor(charge: number): string {
  if (charge >= 60) return "var(--color-neon)";
  if (charge >= 25) return PERCENT_COLORS.mid;
  return "var(--color-magenta)";
}

/**
 * Синт-дрон: чистый SVG + CSS-анимации, без картинок и зависимостей.
 * Парение, вращение сопел, пульс глаза-сенсора, редкий глитч; уровень —
 * цвет ядра и модули на корпусе. prefers-reduced-motion замирает.
 */
export function Drone({ charge, state = "idle", size = 96, className }: DroneProps) {
  const [glitch, setGlitch] = useState(false);
  useEffect(() => {
    if (state === "sleep") return;
    // редкий глитч: раз в 6–14 секунд на 0.35 с
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setGlitch(true);
        setTimeout(() => setGlitch(false), 350);
        schedule();
      }, 6000 + Math.random() * 8000);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [state]);

  const core = coreColor(charge);
  const sleeping = state === "sleep";
  const happy = state === "happy";
  const modules = charge >= 60 ? 2 : charge >= 40 ? 1 : 0;

  return (
    <div
      className={cn("drone relative select-none", sleeping && "drone-sleep", happy && "drone-happy", glitch && "drone-glitch", className)}
      style={{ width: size, height: size * 1.15 }}
      role="img"
      aria-label={`Дрон-компаньон: заряд ${charge}%, ${sleeping ? "спячка" : happy ? "радуется" : "на связи"}`}
    >
      <svg viewBox="0 0 100 115" width="100%" height="100%">
        {/* верхние пропеллеры/ионные сопла */}
        <g className="drone-prop" style={{ transformOrigin: "24px 26px" }}>
          <ellipse cx="24" cy="26" rx="17" ry="3" fill="none" stroke={core} strokeOpacity="0.5" strokeWidth="1.4" />
          <ellipse cx="24" cy="26" rx="10" ry="1.8" fill="none" stroke={core} strokeOpacity="0.8" strokeWidth="1.2" />
        </g>
        <g className="drone-prop drone-prop-ccw" style={{ transformOrigin: "76px 26px" }}>
          <ellipse cx="76" cy="26" rx="17" ry="3" fill="none" stroke={core} strokeOpacity="0.5" strokeWidth="1.4" />
          <ellipse cx="76" cy="26" rx="10" ry="1.8" fill="none" stroke={core} strokeOpacity="0.8" strokeWidth="1.2" />
        </g>
        {/* штанги */}
        <line x1="30" y1="30" x2="38" y2="38" stroke={core} strokeOpacity="0.55" strokeWidth="1.6" />
        <line x1="70" y1="30" x2="62" y2="38" stroke={core} strokeOpacity="0.55" strokeWidth="1.6" />
        {/* корпус */}
        <ellipse cx="50" cy="58" rx="34" ry="24" fill="url(#droneBody)" stroke={core} strokeOpacity="0.85" strokeWidth="1.6" />
        {/* панели корпуса */}
        <path d="M22 58a28 20 0 0 1 56 0" fill="none" stroke={core} strokeOpacity="0.25" strokeWidth="1" />
        {/* модули на корпусе (уровень дрона) */}
        {Array.from({ length: modules }).map((_, i) => (
          <rect
            key={i}
            x={40 + i * 9}
            y="72"
            width="6"
            height="4"
            rx="1"
            fill={core}
            fillOpacity="0.9"
          />
        ))}
        {/* ядро/глаз-сенсор */}
        <circle cx="50" cy="56" r="13" fill="var(--color-ink)" stroke={core} strokeWidth="1.5" />
        <circle cx="50" cy="56" r="7.5" fill={core} className="drone-core" />
        {sleeping ? (
          /* закрытый глаз: две дуги */
          <>
            <path d="M43 56q3.5 3 7 0" fill="none" stroke="var(--color-dim)" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M50 56q3.5 3 7 0" fill="none" stroke="var(--color-dim)" strokeWidth="1.6" strokeLinecap="round" />
          </>
        ) : (
          <circle cx="50" cy="56" r="2.6" fill="var(--color-ink)" />
        )}
        {/* нижние сопла */}
        <line x1="36" y1="80" x2="33" y2="92" stroke={core} strokeOpacity="0.6" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="64" y1="80" x2="67" y2="92" stroke={core} strokeOpacity="0.6" strokeWidth="1.6" strokeLinecap="round" />
        <defs>
          <linearGradient id="droneBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-panel-2)" />
            <stop offset="100%" stopColor="var(--color-panel)" />
          </linearGradient>
        </defs>
      </svg>
      {/* тень под дроном */}
      <span
        className="drone-shadow absolute left-1/2 -translate-x-1/2 rounded-[50%]"
        style={{ bottom: -2, width: size * 0.52, height: size * 0.09, background: "rgba(0,0,0,0.45)", filter: "blur(2px)" }}
      />
      {sleeping && (
        <span className="absolute right-0 top-1 font-display text-[10px] text-dim drone-zzz">z</span>
      )}
    </div>
  );
}
