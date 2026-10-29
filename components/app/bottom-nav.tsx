"use client";

import { Home, Trophy, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/client";

export type Screen =
  | "home"
  | "setup"
  | "round"
  | "result"
  | "lobby"
  | "ai-setup"
  | "duel"
  | "gallery"
  | "top"
  | "profile"
  | "rewards"
  | "limit";

interface BottomNavProps {
  active: Screen;
  onNavigate: (screen: Screen) => void;
}

const items: { key: Screen; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "home", label: "Главная", icon: Home },
  { key: "top", label: "Топ", icon: Trophy },
  { key: "profile", label: "Профиль", icon: User },
];

export function BottomNav({ active, onNavigate }: BottomNavProps) {
  return (
    <nav className="sticky bottom-0 z-20 mt-auto border-t border-line bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      <div className="mx-auto flex max-w-md items-stretch">
        {items.map(({ key, label, icon: Icon }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => {
                haptic("light");
                onNavigate(key);
              }}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 font-display text-[10px] tracking-wider transition-colors",
                isActive ? "text-neon" : "text-dim hover:text-fog"
              )}
            >
              <Icon className={cn("h-5 w-5", isActive && "drop-shadow-[0_0_8px_rgba(0,240,255,0.7)]")} />
              {label.toUpperCase()}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
