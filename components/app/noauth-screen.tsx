"use client";

import { Bot } from "lucide-react";

export function NoAuthScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-neon/40 bg-neon/10 glow-neon">
        <Bot className="h-9 w-9 text-neon" />
      </div>
      <div>
        <p className="font-display text-lg font-bold text-fog">Открой приложение через Telegram</p>
        <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-dim">
          Кейс-игры работают как Telegram Mini App. Запустите бота и нажмите кнопку «Открыть
          Кейс-игры».
        </p>
      </div>
    </div>
  );
}
