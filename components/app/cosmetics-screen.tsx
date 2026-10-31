"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Drone } from "@/components/app/drone";
import { apiFetch, haptic, tgWebApp, type Profile } from "@/lib/client";
import { cn } from "@/lib/utils";

interface CosmeticItem {
  sku: string;
  slot: "skin" | "aura";
  title: string;
  description: string;
  stars: number;
  source: "purchase" | "level" | "pro";
  requiredLevel?: number;
  owned: boolean;
  status: "equipped" | "owned" | "locked" | "buy" | "pro";
  lockReason: string | null;
}

interface CosmeticsData {
  items: CosmeticItem[];
  equipped: { skin: string | null; aura: string | null };
  level: number;
  isPro: boolean;
}

interface CosmeticsScreenProps {
  profile: Profile | null;
  onBack: () => void;
  showToast: (text: string) => void;
}

const STATUS_LABEL: Record<CosmeticItem["status"], string> = {
  equipped: "НАДЕТО",
  owned: "КУПЛЕНО",
  locked: "ЗА УРОВЕНЬ",
  buy: "КУПИТЬ",
  pro: "PRO",
};

/** Экран дрона в профиле: каталог косметики с живым превью на дроне. */
export function CosmeticsScreen({ profile, onBack, showToast }: CosmeticsScreenProps) {
  const [data, setData] = useState<CosmeticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busySku, setBusySku] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<CosmeticsData>("/api/app/cosmetics");
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить каталог");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const buy = async (sku: string) => {
    setBusySku(sku);
    try {
      const res = await apiFetch<{ link: string }>("/api/app/payments/invoice", {
        method: "POST",
        body: JSON.stringify({ sku }),
      });
      const tg = tgWebApp() as { openInvoice?: (link: string) => void } | null;
      if (tg?.openInvoice) tg.openInvoice(res.link);
      else if (typeof window !== "undefined") window.open(res.link, "_blank");
    } catch {
      showToast("Покупка недоступна: бот не настроен");
    } finally {
      setBusySku(null);
    }
  };

  const equip = async (slot: "skin" | "aura", sku: string | null) => {
    setBusySku(sku ?? "none");
    try {
      await apiFetch("/api/app/cosmetics", {
        method: "POST",
        body: JSON.stringify({ slot, sku }),
      });
      haptic("light");
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Не удалось изменить экипировку");
    } finally {
      setBusySku(null);
    }
  };

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
          <p className="font-display text-[10px] tracking-[0.25em] text-dim">МАСТЕРСКАЯ ДРОНА</p>
          <h1 className="font-display text-lg font-bold text-fog">Косметика</h1>
        </div>
      </header>

      {!data && !error && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}
      {error && <p className="py-8 text-center text-[13px] text-dim">{error}</p>}

      {data && (
        <>
          <div className="flex justify-center py-2">
            <Drone
              charge={profile?.mascot.charge ?? 50}
              state={profile?.mascot.sleeping ? "sleep" : "idle"}
              size={110}
              skinSku={data.equipped.skin}
              auraSku={data.equipped.aura}
            />
          </div>
          <p className="text-center font-display text-[11px] text-dim">
            скин: {data.items.find((i) => i.sku === data.equipped.skin)?.title ?? "стандартный"} · аура:{" "}
            {data.items.find((i) => i.sku === data.equipped.aura)?.title ?? "нет"}
          </p>

          <div className="grid grid-cols-2 gap-3">
            {data.items.map((item) => {
              const equippedNow =
                (item.slot === "skin" && data.equipped.skin === item.sku) ||
                (item.slot === "aura" && data.equipped.aura === item.sku);
              return (
                <Card
                  key={item.sku}
                  className={cn(
                    "flex flex-col",
                    item.status === "equipped" && "border-neon/50",
                    item.status === "locked" && "opacity-70"
                  )}
                >
                  <CardContent className="flex flex-1 flex-col items-center gap-2 p-3">
                    <Drone
                      charge={70}
                      size={56}
                      previewSku={item.sku}
                      className={cn(item.slot === "aura" && !item.owned && "opacity-40")}
                    />
                    <p className="text-center font-display text-[11px] font-bold leading-tight text-fog">
                      {item.title}
                    </p>
                    <p className="min-h-[28px] text-center text-[10px] leading-tight text-dim">
                      {item.description}
                      {item.requiredLevel ? ` · ур. ${item.requiredLevel}` : ""}
                    </p>
                    {item.status === "buy" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        disabled={busySku === item.sku}
                        onClick={() => buy(item.sku)}
                      >
                        {item.stars} ⭐
                      </Button>
                    ) : item.status === "pro" ? (
                      <Button size="sm" variant="ghost" className="w-full" disabled>
                        ПОДПИСКА PRO
                      </Button>
                    ) : equippedNow ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        disabled={busySku === item.sku}
                        onClick={() => equip(item.slot, null)}
                      >
                        СНЯТЬ
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={item.status === "locked" || busySku === item.sku}
                        onClick={() => equip(item.slot, item.sku)}
                      >
                        {item.status === "locked" ? (
                          <>
                            <Lock className="mr-1 h-3 w-3" /> {STATUS_LABEL.locked}
                          </>
                        ) : (
                          <>
                            <Check className="mr-1 h-3 w-3" /> ЭКИПИРОВАТЬ
                          </>
                        )}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <p className="text-center text-[11px] text-dim">
            Оплата Telegram Stars · PRO-скин доступен, пока активна подписка
          </p>
        </>
      )}
    </div>
  );
}
