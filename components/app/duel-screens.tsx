"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, Link2, Send, Swords, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRing } from "@/components/app/rings";
import {
  apiFetch,
  haptic,
  type Bootstrap,
  type DuelState,
} from "@/lib/client";
import { cn } from "@/lib/utils";

type Difficulty = "easy" | "normal" | "hard";

const MODE_OPTIONS = [
  { slug: "classic", title: "Классика", emoji: "📘" },
  { slug: "constructor", title: "Конструктор", emoji: "🏗️" },
  { slug: "rescue", title: "Спасение", emoji: "🚨" },
  { slug: "pitch", title: "Питч", emoji: "🎤" },
] as const;

// ---------- Лобби дуэлей ----------

interface LobbyProps {
  bootstrap: Bootstrap | null;
  onBack: () => void;
  onOpenDuel: (duelId: number) => void;
  onAiDuelSetup: () => void;
  showToast: (text: string) => void;
  refreshToken: number;
}

interface MyDuel {
  id: number;
  status: string;
  mode: string;
  iWon: boolean;
  isDraw: boolean;
}

export function DuelLobbyScreen({ bootstrap, onBack, onOpenDuel, onAiDuelSetup, showToast, refreshToken }: LobbyProps) {
  const [mode, setMode] = useState<string>("classic");
  const [domainId, setDomainId] = useState<number>(bootstrap?.domains[0]?.id ?? 0);
  const [creating, setCreating] = useState(false);
  const [myDuels, setMyDuels] = useState<MyDuel[]>([]);

  const load = useCallback(async () => {
    try {
      const me = await apiFetch<{ duels: MyDuel[] }>("/api/app/me");
      setMyDuels(me.duels ?? []);
    } catch {
      setMyDuels([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await apiFetch<{ duels: MyDuel[] }>("/api/app/me").catch(() => null);
      if (!cancelled && me) setMyDuels(me.duels ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const createChallenge = async () => {
    setCreating(true);
    try {
      const res = await apiFetch<{ duelId: number; link: string | null; linkHint: string | null }>(
        "/api/app/duel/create",
        { method: "POST", body: JSON.stringify({ domainId, mode }) }
      );
      if (res.link) {
        await navigator.clipboard?.writeText(res.link).catch(() => null);
        showToast("Ссылка на дуэль скопирована — отправь другу!");
      } else {
        showToast(res.linkHint ?? "Вызов создан — ссылка появится после настройки бота");
      }
      load();
      onOpenDuel(res.duelId);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Не удалось создать вызов");
    } finally {
      setCreating(false);
    }
  };

  const statusLabel: Record<string, string> = {
    open: "ждёт соперника",
    awaiting: "соперник отвечает",
    finished: "завершена",
    expired: "истекла",
  };

  return (
    <div className="animate-rise min-h-dvh space-y-5 p-4 pb-8">
      <header className="flex items-center gap-3 pt-2">
        <button onClick={onBack} aria-label="Назад" className="rounded-lg p-1.5 text-dim hover:text-fog">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="font-display text-[10px] tracking-[0.25em] text-dim">РЕЙТИНГ · ЛИГИ</p>
          <h1 className="font-display text-lg font-bold text-fog">⚔️ Дуэли</h1>
        </div>
      </header>

      <Card className="border-neon/30 glow-neon">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-neon">
            <Bot className="h-4 w-4" />
            <span className="font-display text-[11px] tracking-[0.2em]">AI-ДУЭЛЬ</span>
          </div>
          <p className="text-[12px] leading-relaxed text-dim">
            Мгновенный матч: соперник-ИИ в одном из трёх стилей мышления. Победа — рейтинг и +20 XP.
          </p>
          <Button className="w-full" onClick={onAiDuelSetup}>
            <Bot className="h-4 w-4" /> ИГРАТЬ ПРОТИВ ИИ
          </Button>
        </CardContent>
      </Card>

      <Card className="border-magenta/30">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-magenta">
            <Users className="h-4 w-4" />
            <span className="font-display text-[11px] tracking-[0.2em]">ВЫЗОВ ДРУГУ (PVP)</span>
          </div>
          <p className="text-[12px] leading-relaxed text-dim">
            Случайный кейс по домену и режиму. Ссылка шарится в чат, у соперника 48 часов.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.slug}
                onClick={() => setMode(m.slug)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 font-display text-[10px] font-semibold",
                  mode === m.slug ? "border-magenta/60 bg-magenta/15 text-magenta" : "border-line text-dim"
                )}
              >
                {m.emoji} {m.title.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(bootstrap?.domains ?? []).map((d) => (
              <button
                key={d.id}
                onClick={() => setDomainId(d.id)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-[11px]",
                  domainId === d.id ? "border-neon/60 bg-neon/10 text-neon" : "border-line text-dim"
                )}
              >
                {d.emoji} {d.title}
              </button>
            ))}
          </div>
          <Button variant="secondary" className="w-full" disabled={creating} onClick={createChallenge}>
            <Link2 className="h-4 w-4" />
            {creating ? "СОЗДАЁМ…" : "СОЗДАТЬ ВЫЗОВ + ССЫЛКА"}
          </Button>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-2 font-display text-[11px] tracking-[0.25em] text-dim">МОИ ДУЭЛИ</h2>
        {myDuels.length === 0 ? (
          <Card>
            <CardContent className="p-5 text-center text-[13px] text-dim">
              Пока пусто. Создайте вызов или сыграйте против ИИ!
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {myDuels.map((d) => (
              <button
                key={d.id}
                onClick={() => onOpenDuel(d.id)}
                className="flex w-full items-center justify-between rounded-lg border border-line bg-panel/50 px-3.5 py-3 text-left active:scale-[0.99]"
              >
                <div>
                  <p className="font-display text-[13px] font-semibold text-fog">
                    {MODE_OPTIONS.find((m) => m.slug === d.mode)?.emoji ?? "⚔️"} Дуэль #{d.id}
                  </p>
                  <p className="text-[11px] text-dim">{statusLabel[d.status] ?? d.status}</p>
                </div>
                {d.status === "finished" && (
                  <span
                    className={cn(
                      "font-display text-[11px] font-bold",
                      d.isDraw ? "text-dim" : d.iWon ? "text-neon" : "text-magenta"
                    )}
                  >
                    {d.isDraw ? "НИЧЬЯ" : d.iWon ? "ПОБЕДА" : "ПОРАЖЕНИЕ"}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- Сетап AI-дуэли: стиль соперника ----------

const STYLES = [
  { key: "analyst", title: "Аналитик", description: "Сухие цифры, консервативные ставки", emoji: "📊" },
  { key: "hustler", title: "Хастлер", description: "Агрессивный рост и продажи", emoji: "⚡" },
  { key: "systemizer", title: "Системщик", description: "Процессы и операционка", emoji: "🛠️" },
] as const;

interface AiSetupProps {
  bootstrap: Bootstrap | null;
  onBack: () => void;
  onStart: (opts: { style: string; mode: string; domainId: number; difficulty: Difficulty }) => void;
  loading: boolean;
}

export function AiDuelSetupScreen({ bootstrap, onBack, onStart, loading }: AiSetupProps) {
  const [style, setStyle] = useState<string>("analyst");
  const [mode, setMode] = useState<string>("classic");
  const [domainId, setDomainId] = useState<number>(bootstrap?.domains[0]?.id ?? 0);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");

  return (
    <div className="animate-rise min-h-dvh space-y-5 p-4 pb-8">
      <header className="flex items-center gap-3 pt-2">
        <button onClick={onBack} aria-label="Назад" className="rounded-lg p-1.5 text-dim hover:text-fog">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="font-display text-[10px] tracking-[0.25em] text-dim">AI-ДУЭЛЬ</p>
          <h1 className="font-display text-lg font-bold text-fog">Выбери соперника</h1>
        </div>
      </header>

      <div className="space-y-2">
        {STYLES.map((s) => (
          <button
            key={s.key}
            onClick={() => {
              haptic("light");
              setStyle(s.key);
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all",
              style === s.key ? "border-neon/60 bg-neon/10 glow-neon" : "border-line bg-panel/50"
            )}
          >
            <span className="text-2xl">{s.emoji}</span>
            <div>
              <p className="font-display text-sm font-bold text-fog">{s.title}</p>
              <p className="text-[11px] text-dim">{s.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {MODE_OPTIONS.map((m) => (
          <button
            key={m.slug}
            onClick={() => setMode(m.slug)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 font-display text-[10px] font-semibold",
              mode === m.slug ? "border-neon/60 bg-neon/10 text-neon" : "border-line text-dim"
            )}
          >
            {m.emoji} {m.title.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(bootstrap?.domains ?? []).map((d) => (
          <button
            key={d.id}
            onClick={() => setDomainId(d.id)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-[11px]",
              domainId === d.id ? "border-neon/60 bg-neon/10 text-neon" : "border-line text-dim"
            )}
          >
            {d.emoji} {d.title}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        {(["easy", "normal", "hard"] as const).map((d) => (
          <button
            key={d}
            onClick={() => setDifficulty(d)}
            className={cn(
              "flex-1 rounded-lg border py-1.5 font-display text-[10px] font-semibold",
              difficulty === d ? "border-magenta/60 bg-magenta/10 text-magenta" : "border-line text-dim"
            )}
          >
            {d === "easy" ? "ЛЁГКИЙ" : d === "normal" ? "СРЕДНИЙ" : "СЛОЖНЫЙ"}
          </button>
        ))}
      </div>

      <Button className="w-full" size="lg" disabled={loading} onClick={() => onStart({ style, mode, domainId, difficulty })}>
        <Swords className="h-4 w-4" /> {loading ? "СОБИРАЕМ МАТЧ…" : "В БОЙ"}
      </Button>
    </div>
  );
}

// ---------- Экран дуэли: решение + сравнение ----------

interface DuelScreenProps {
  duelId: number;
  onBack: () => void;
  onRematch: (duel: DuelState) => void;
  showToast: (text: string) => void;
}

export function DuelScreen({ duelId, onBack, onRematch, showToast }: DuelScreenProps) {
  const [duel, setDuel] = useState<DuelState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState(240);
  const startedRef = useRef(new Date().toISOString());

  const load = useCallback(async () => {
    // setState только после await: эффект зовёт load() напрямую
    try {
      const state = await apiFetch<DuelState>(`/api/app/duel/${duelId}`);
      setDuel(state);
      setRemaining(state.timeLimitSec);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Дуэль недоступна");
    } finally {
      setLoading(false);
    }
  }, [duelId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setRemaining((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  const canSolve =
    duel &&
    duel.status !== "finished" &&
    duel.status !== "expired" &&
    !duel.iSolved;

  const submit = async () => {
    if (!duel || submitting) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/app/duel/${duelId}/solve`, {
        method: "POST",
        body: JSON.stringify({ answer, startedAt: startedRef.current }),
      });
      haptic("success");
      await load();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "quota") {
        showToast("Бесплатные раунды на сегодня закончились");
      } else {
        showToast(e instanceof Error ? e.message : "Не удалось отправить ответ");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !duel) {
    return (
      <div className="space-y-3 p-4 pt-8">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (error && !duel) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-dim">{error}</p>
        <Button variant="outline" onClick={onBack}>НАЗАД</Button>
      </div>
    );
  }
  if (!duel) return null;

  // ---- Сравнение (финал) ----
  if (duel.status === "finished" || duel.status === "expired") {
    const verdictText =
      duel.status === "expired"
        ? duel.verdict === "draw"
          ? "Истекла — ничья"
          : "Истекла"
        : duel.verdict === "me"
          ? "🏆 ПОБЕДА!"
          : duel.verdict === "draw"
            ? "🤝 НИЧЬЯ"
            : "💤 ПОРАЖЕНИЕ";
    return (
      <div className="animate-rise min-h-dvh space-y-4 p-4 pb-8">
        <header className="flex items-center gap-3 pt-2">
          <button onClick={onBack} aria-label="Назад" className="rounded-lg p-1.5 text-dim hover:text-fog">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="font-display text-[10px] tracking-[0.25em] text-dim">{duel.modeTitle.toUpperCase()}</p>
            <h1 className="font-display text-lg font-bold text-fog">Дуэль #{duel.duelId}</h1>
          </div>
        </header>

        <div
          className={cn(
            "rounded-xl border p-4 text-center font-display text-lg font-bold",
            duel.verdict === "me"
              ? "border-neon/50 bg-neon/10 text-neon glow-neon"
              : duel.verdict === "draw"
                ? "border-line bg-panel text-fog"
                : "border-magenta/50 bg-magenta/10 text-magenta"
          )}
        >
          {verdictText}
          {duel.myRating && duel.myRating.delta !== 0 && (
            <div className="mt-1 font-display text-sm text-dim">
              рейтинг: {duel.myRating.before} → {duel.myRating.after} ({duel.myRating.delta > 0 ? "+" : ""}{duel.myRating.delta})
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[duel.a, duel.b].map((side, idx) =>
            side ? (
              <Card
                key={idx}
                className={cn(
                  "flex flex-col items-center p-3",
                  side.isMe ? "border-neon/50" : "border-line"
                )}
              >
                <p className="truncate text-center font-display text-[11px] font-semibold text-dim">
                  {side.isMe ? "ВЫ" : side.name}
                </p>
                <ProgressRing value={side.percent} size={90} stroke={7} color={side.isMe ? "#00f0ff" : "#ff2d78"}>
                  <span className="font-display text-xl font-bold text-fog">{side.percent}</span>
                </ProgressRing>
                {duel.status === "finished" && (
                  <p className="mt-1 font-display text-[10px] text-dim">+{side.xpEarned} XP</p>
                )}
              </Card>
            ) : (
              <Card key={idx} className="flex items-center justify-center p-3 text-[12px] text-dim">
                нет ответа
              </Card>
            )
          )}
        </div>

        {duel.status === "finished" && [duel.a, duel.b].map((side, idx) =>
          side?.answer ? (
            <Card key={idx}>
              <CardContent className="p-4">
                <p className="font-display text-[10px] tracking-[0.2em] text-dim">
                  ОТВЕТ · {side.isMe ? "ВЫ" : side.name.toUpperCase()}
                </p>
                <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-fog/90">{side.answer}</p>
              </CardContent>
            </Card>
          ) : null
        )}

        <div className="flex gap-3">
          {duel.style && (
            <Button className="flex-1" onClick={() => onRematch(duel)}>
              <Swords className="h-4 w-4" /> РЕВАНШ
            </Button>
          )}
          <Button variant="outline" className="flex-1" onClick={onBack}>
            В ЛОББИ
          </Button>
        </div>
      </div>
    );
  }

  // ---- Ожидание (уже ответил или ждём соперника) ----
  if (!canSolve) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <Swords className="h-10 w-10 text-neon" />
        <p className="font-display text-base font-bold text-fog">
          {duel.iSolved ? "Ответ принят!" : "Ожидаем соперника"}
        </p>
        <p className="max-w-xs text-[13px] leading-relaxed text-dim">
          {duel.iSolved
            ? duel.b === null && duel.style
              ? "ИИ-соперник думает над ответом — обновим через пару секунд."
              : "Как только соперник ответит, здесь появится сравнение."
            : duel.isAuthor
              ? "Сначала ответьте сами, затем поделитесь ссылкой."
              : "Отличная возможность занять голову, пока ждём."}
        </p>
        <Button variant="outline" onClick={load}>ОБНОВИТЬ</Button>
        <Button variant="ghost" onClick={onBack}>НАЗАД</Button>
      </div>
    );
  }

  // ---- Решение ----
  const len = answer.length;
  const canSubmit = len >= duel.answerMin && !submitting;
  return (
    <div className="animate-rise flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-ink/90 px-4 py-3 backdrop-blur-md">
        <button onClick={onBack} aria-label="Назад" className="rounded-lg p-1.5 text-dim hover:text-fog">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[10px] tracking-[0.2em] text-dim">
            ДУЭЛЬ · {duel.modeTitle.toUpperCase()}
          </p>
          <h1 className="truncate font-display text-sm font-bold text-fog">{duel.case?.title}</h1>
        </div>
        <ProgressRing
          value={(remaining / duel.timeLimitSec) * 100}
          size={52}
          stroke={4}
          color={remaining < 60 ? "#ff2d78" : "#00f0ff"}
        >
          <span className="font-display text-[10px] font-bold text-neon">
            {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
          </span>
        </ProgressRing>
      </header>

      <div className="flex-1 space-y-4 p-4 pb-40">
        <Card>
          <CardContent className="p-4">
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-fog/90">{duel.case?.body}</p>
          </CardContent>
        </Card>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="font-display text-[11px] tracking-[0.2em] text-dim">ВАШ ОТВЕТ</label>
            <span className={cn("font-display text-[11px]", canSubmit ? "text-neon" : "text-dim")}>
              {len}/{duel.answerMax}
            </span>
          </div>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value.slice(0, duel.answerMax))}
            rows={8}
            placeholder="Убеди соперника и оценщика…"
            className="w-full resize-none rounded-xl border border-line bg-panel-2 p-3.5 text-[15px] leading-relaxed text-fog placeholder:text-dim/60 focus:border-neon/50 focus:outline-none"
          />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/90 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-md">
        <div className="mx-auto max-w-md">
          <Button className="w-full" size="lg" disabled={!canSubmit} onClick={submit}>
            <Send className="h-4 w-4" /> {submitting ? "ОЦЕНИВАЕМ…" : "ОТПРАВИТЬ В ДУЭЛЬ"}
          </Button>
        </div>
      </div>
    </div>
  );
}
