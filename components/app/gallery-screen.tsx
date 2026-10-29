"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, type GalleryItem } from "@/lib/client";
import { cn } from "@/lib/utils";

interface GalleryScreenProps {
  caseId: number | null; // null -> «мои публичные ответы»
  caseTitle?: string;
  onBack: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export function GalleryScreen({ caseId, caseTitle, onBack }: GalleryScreenProps) {
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const url = caseId
        ? `/api/app/gallery?caseId=${caseId}`
        : "/api/app/gallery?userId=me";
      setItems((await apiFetch<{ items: GalleryItem[] }>(url)).items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить галерею");
    }
  }, [caseId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = caseId ? `/api/app/gallery?caseId=${caseId}` : "/api/app/gallery?userId=me";
      try {
        const res = await apiFetch<{ items: GalleryItem[] }>(url);
        if (!cancelled) setItems(res.items);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Не удалось загрузить галерею");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  return (
    <div className="animate-rise min-h-dvh space-y-4 p-4 pb-8">
      <header className="flex items-center gap-3 pt-2">
        <button onClick={onBack} aria-label="Назад" className="rounded-lg p-1.5 text-dim hover:text-fog">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="font-display text-[10px] tracking-[0.25em] text-dim">ГАЛЕРЕЯ</p>
          <h1 className="font-display text-base font-bold text-fog">
            {caseId ? (caseTitle ?? "Лучшие ответы") : "Мои публичные ответы"}
          </h1>
        </div>
      </header>

      {!items && !error && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}
      {error && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-dim">{error}</p>
          <Button variant="outline" onClick={load}>ПОВТОРИТЬ</Button>
        </div>
      )}
      {items && items.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-[13px] text-dim">
            Пока пусто. {caseId ? "Стань первым, кто решит этот кейс на высокий процент!" : "Реши кейс — и лучшие ответы появятся здесь."}
          </CardContent>
        </Card>
      )}

      {items?.map((item) => (
        <Card key={item.attemptId} className={cn(item.isMine && "border-neon/40")}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-display text-[13px] font-bold text-fog">{item.author}</p>
                <p className="text-[11px] text-dim">
                  {item.mode === "classic" ? "классика" : item.mode} · {formatDate(item.submittedAt)} · +{item.xpEarned} XP
                </p>
              </div>
              <div className="text-right">
                <p
                  className={cn(
                    "font-display text-lg font-bold",
                    item.percent >= 70 ? "text-neon" : item.percent >= 40 ? "text-amber-400" : "text-magenta"
                  )}
                >
                  {item.percent}%
                </p>
              </div>
            </div>

            <button
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line py-2 font-display text-[10px] tracking-widest text-dim transition-colors hover:text-neon"
              onClick={() => setExpanded(expanded === item.attemptId ? null : item.attemptId)}
            >
              <Eye className="h-3.5 w-3.5" />
              {expanded === item.attemptId ? "СКРЫТЬ РАЗБОР" : "ОТВЕТ И РАЗБОР"}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded === item.attemptId && "rotate-180")} />
            </button>

            {expanded === item.attemptId && (
              <div className="mt-3 space-y-3">
                <div>
                  <p className="font-display text-[9px] tracking-widest text-dim">ТЕКСТ ОТВЕТА</p>
                  <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-fog/90">{item.answer}</p>
                </div>
                {item.criteria.length > 0 && (
                  <div>
                    <p className="font-display text-[9px] tracking-widest text-dim">ПО КРИТЕРИЯМ</p>
                    <div className="mt-1 space-y-1">
                      {item.criteria.map((c) => (
                        <div key={c.name} className="flex items-center justify-between text-[12px]">
                          <span className="text-fog/90">{c.name}</span>
                          <span className="font-display text-neon">{c.points}/{c.maxPoints}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {item.missed.length > 0 && (
                  <div>
                    <p className="font-display text-[9px] tracking-widest text-magenta">ЧТО УПУЩЕНО</p>
                    <ul className="mt-1 space-y-0.5">
                      {item.missed.map((m, i) => (
                        <li key={i} className="text-[12px] text-fog/85">• {m}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {item.modelAnswer && (
                  <div>
                    <p className="font-display text-[9px] tracking-widest text-dim">ЭТАЛОН</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-fog/80">{item.modelAnswer}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
