"use client";

import { Crown, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LimitScreenProps {
  onHome: () => void;
  onPro: () => void;
}

export function LimitScreen({ onHome, onPro }: LimitScreenProps) {
  return (
    <div className="animate-rise flex min-h-dvh flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-magenta/40 bg-magenta/10 glow-magenta">
        <Crown className="h-9 w-9 text-magenta" />
      </div>
      <div>
        <p className="font-display text-lg font-bold text-fog">
          Бесплатные кейсы на сегодня закончились
        </p>
        <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-dim">
          Лимит — 3 кейса в сутки. Новый набор откроется завтра в 00:00 по Москве. С PRO — без
          ограничений.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Button variant="secondary" size="lg" onClick={onPro}>
          <Crown className="h-4 w-4" /> ОФОРМИТЬ PRO
        </Button>
        <Button variant="ghost" onClick={onHome}>
          <Home className="h-4 w-4" /> НА ГЛАВНУЮ
        </Button>
      </div>
    </div>
  );
}
