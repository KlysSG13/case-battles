"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, haptic, tgWebApp, type Profile } from "@/lib/client";
import { cn } from "@/lib/utils";

interface PaymentRow {
  sku: string;
  kind: string;
  stars: number;
  status: string;
  createdAt: string;
}

interface HistoryData {
  catalog: { sku: string; stars: number; title: string }[];
  payments: PaymentRow[];
}

interface ProScreenProps {
  profile: Profile | null;
  onBack: () => void;
  showToast: (text: string) => void;
}

const PERKS = [
  "Безлимит раундов в сутки (free — 3)",
  "3 подсказки в день вместо 1",
  "PRO-скин дрона «Квант», пока подписка активна",
  "PRO-бейдж в профиле и лидербордах",
];

/** Экран PRO: статус подписки, перки, покупка за Stars, последние платежи. */
export function ProScreen({ profile, onBack, showToast }: ProScreenProps) {
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [busy, setBusy] = useState(false);
  const proPrice = history?.catalog.find((c) => c.sku === "pro30")?.stars ?? 250;

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        setHistory(await apiFetch<HistoryData>("/api/app/payments/history"));
      } catch {
        setHistory({ catalog: [], payments: [] });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const buy = async () => {
    setBusy(true);
    try {
      const res = await apiFetch<{ link: string }>("/api/app/payments/invoice", {
        method: "POST",
        body: JSON.stringify({ sku: "pro30" }),
      });
      haptic("light");
      const tg = tgWebApp() as { openInvoice?: (link: string) => void } | null;
      if (tg?.openInvoice) tg.openInvoice(res.link);
      else if (typeof window !== "undefined") window.open(res.link, "_blank");
    } catch (e) {
      const code = (e as { code?: string }).code;
      showToast(
        code === "bot_unconfigured"
          ? "Платежи недоступны: бот не настроен (BOT_TOKEN)"
          : "Не удалось открыть оплату — попробуйте позже"
      );
    } finally {
      setBusy(false);
    }
  };

  const isPro = profile?.isPro ?? false;
  const until = profile?.proUntil ? new Date(profile.proUntil).toLocaleDateString("ru-RU") : null;

  return (
    <div className="animate-rise min-h-dvh space-y-4 p-4 pb-8">
      <header className="flex items-center gap-3 pt-2">
        <button
          onClick={onBack}
          aria-label="Назад"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-dim hover:text-fog"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="font-display text-[10px] tracking-[0.25em] text-dim">ПОДПИСКА</p>
          <h1 className="font-display text-lg font-bold text-fog">PRO</h1>
        </div>
      </header>

      <Card className={cn(isPro ? "border-neon/50 glow-neon" : "border-magenta/40")}>
        <CardContent className="flex items-center gap-4 p-4">
          <div
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border",
              isPro ? "border-neon/50 bg-neon/10 text-neon" : "border-magenta/40 bg-magenta/10 text-magenta"
            )}
          >
            <Crown className="h-7 w-7" />
          </div>
          <div>
            {isPro ? (
              <>
                <p className="font-display text-base font-bold text-fog">PRO активна</p>
                <p className="text-[12px] text-dim">до {until}</p>
              </>
            ) : (
              <>
                <p className="font-display text-base font-bold text-fog">PRO-подписка на 30 дней</p>
                <p className="text-[12px] text-dim">разовая покупка · продление вручную</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="font-display text-[10px] tracking-[0.25em] text-dim">ЧТО ВХОДИТ</p>
          {PERKS.map((perk) => (
            <p key={perk} className="flex items-start gap-2 text-[13px] leading-snug text-fog/90">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon" />
              {perk}
            </p>
          ))}
        </CardContent>
      </Card>

      <Button
        variant={isPro ? "outline" : "default"}
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={buy}
      >
        <Crown className="h-4 w-4" />
        {isPro ? `ПРОДЛИТЬ · ${proPrice} ⭐` : `ОФОРМИТЬ ЗА ${proPrice} ⭐`}
      </Button>
      <p className="text-center text-[11px] text-dim">
        Оплата Telegram Stars · рекуррентные списания не подключаются
      </p>

      <section>
        <h2 className="mb-2 font-display text-[11px] tracking-[0.25em] text-dim">ПОСЛЕДНИЕ ПЛАТЕЖИ</h2>
        {!history ? (
          <Skeleton className="h-16 w-full" />
        ) : history.payments.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-center text-[12px] text-dim">Покупок пока не было</CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {history.payments.map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-line bg-panel/50 px-3 py-2.5"
              >
                <div>
                  <p className="text-[13px] font-semibold text-fog">{p.sku}</p>
                  <p className="text-[11px] text-dim">
                    {new Date(p.createdAt).toLocaleDateString("ru-RU")}
                  </p>
                </div>
                <span
                  className={cn(
                    "font-display text-[12px] font-bold",
                    p.status === "refunded" ? "text-magenta" : "text-neon"
                  )}
                >
                  {p.stars} ⭐{p.status === "refunded" ? " · возврат" : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
