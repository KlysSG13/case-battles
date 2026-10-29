"use client";

import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Stepper } from "@/components/app/stepper";
import { SphereGlyph } from "@/components/app/sphere-glyph";
import { sphereMeta } from "@/lib/design-tokens";
import { haptic, type DomainInfo } from "@/lib/client";

interface SphereScreenProps {
  domains: DomainInfo[];
  onBack: () => void;
  onPick: (domainId: number) => void;
}

/** Шаг 1 визарда: выбор сферы (уникальный цвет + глиф + описание). */
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
        {domains.map((d) => {
          const meta = sphereMeta(d.slug);
          return (
            <button
              key={d.id}
              onClick={() => {
                haptic("light");
                onPick(d.id);
              }}
              className="block w-full text-left active:scale-[0.99]"
            >
              <Card style={{ borderColor: `${meta.color}55` }}>
                <CardContent className="flex items-center gap-4 p-4">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: `${meta.color}14`, boxShadow: `0 0 14px ${meta.color}33` }}
                  >
                    <SphereGlyph slug={d.slug} color={meta.color} className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-bold" style={{ color: meta.color }}>
                      {d.title}
                    </p>
                    <p className="text-[12px] text-dim">{meta.description}</p>
                  </div>
                  <span className="font-display text-sm opacity-40" style={{ color: meta.color }}>
                    →
                  </span>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}
