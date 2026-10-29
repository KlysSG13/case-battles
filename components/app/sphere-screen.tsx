"use client";

import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Stepper } from "@/components/app/stepper";
import { haptic, type DomainInfo } from "@/lib/client";

interface SphereScreenProps {
  domains: DomainInfo[];
  onBack: () => void;
  onPick: (domainId: number) => void;
}

const SPHERE_DESCRIPTIONS: Record<string, string> = {
  business: "деньги, команда, переговоры",
  product: "продукт, метрики, эксперименты",
  law: "договоры, риски, права",
};

/** Шаг 1 визарда: выбор сферы. */
export function SphereScreen({ domains, onBack, onPick }: SphereScreenProps) {
  return (
    <div className="animate-rise min-h-dvh p-4 pb-8">
      <header className="flex items-center gap-3 pt-2 pb-4">
        <button
          onClick={onBack}
          aria-label="Назад"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-dim transition-colors hover:bg-white/5 hover:text-fog"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Stepper current={1} />
      </header>

      <h1 className="font-display text-lg font-bold text-fog">Выбери сферу</h1>
      <p className="mt-1 text-[13px] text-dim">Откуда брать кейсы в этом заходе</p>

      <div className="mt-5 space-y-3">
        {domains.map((d) => (
          <button
            key={d.id}
            onClick={() => {
              haptic("light");
              onPick(d.id);
            }}
            className="block w-full text-left active:scale-[0.99]"
          >
            <Card>
              <CardContent className="flex items-center gap-4 p-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-panel-2 text-2xl">
                  {d.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-bold text-fog">{d.title}</p>
                  <p className="text-[12px] text-dim">
                    {SPHERE_DESCRIPTIONS[d.slug] ?? "кейсы и решения"}
                  </p>
                </div>
                <span className="font-display text-sm text-dim/50">→</span>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
