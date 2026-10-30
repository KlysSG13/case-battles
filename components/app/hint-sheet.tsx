"use client";

import { Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { haptic, tgWebApp } from "@/lib/client";
import { cn } from "@/lib/utils";

interface HintSheetProps {
  open: boolean;
  balance: number | null;
  busy: boolean;
  onUse: () => void;
  onClose: () => void;
  onBuy: (sku: string) => void;
}

/**
 * Sheet подсказки: баланс → подтверждение; при 0 — инлайн-оффер hints10.
 * Наводка не влияет на XP/percent — продаём линию мышления, не победу.
 */
export function HintSheet({ open, balance, busy, onUse, onClose, onBuy }: HintSheetProps) {
  if (!open) return null;
  const empty = (balance ?? 0) <= 0;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="animate-rise w-full max-w-md rounded-t-2xl border-t border-line bg-panel px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-2 font-display text-[11px] tracking-[0.25em] text-neon">
            <Lightbulb className="h-4 w-4" /> ПОДСКАЗКА
          </p>
          <button onClick={onClose} aria-label="Закрыть" className="flex h-9 w-9 items-center justify-center text-dim">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!empty ? (
          <>
            <p className="text-[13px] leading-relaxed text-dim">
              Наводка на линию мышления — не готовый ответ. Баланс после использования:{" "}
              <span className="font-display text-fog">{Math.max(0, (balance ?? 1) - 1)}</span>.
            </p>
            <p className="mt-2 font-display text-[12px] text-fog">
              Доступно подсказок: <span className="text-neon">{balance}</span>
            </p>
            <Button className="mt-4 w-full" size="lg" disabled={busy} onClick={() => { haptic("light"); onUse(); }}>
              {busy ? "ОТКРЫВАЕМ…" : "ИСПОЛЬЗОВАТЬ ПОДСКАЗКУ"}
            </Button>
          </>
        ) : (
          <>
            <p className="text-[13px] leading-relaxed text-dim">
              Подсказки закончились. PRO получает 3 подсказки в день, пачка из 10 — один раунд покупок.
            </p>
            <Button
              variant="secondary"
              className="mt-4 w-full"
              size="lg"
              onClick={() => {
                haptic("light");
                onBuy("hints10");
              }}
            >
              КУПИТЬ 10 ПОДСКАЗОК · 50 ⭐
            </Button>
            <p className="mt-2 text-center text-[11px] text-dim">Оплата Telegram Stars</p>
          </>
        )}
      </div>
    </div>
  );
}
