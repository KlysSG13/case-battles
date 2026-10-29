"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, EyeOff, Home, RotateCcw, ThumbsDown, ThumbsUp, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRing } from "@/components/app/rings";
import { apiFetch, haptic, type AttemptResult, type CompletedAttempt } from "@/lib/client";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 2000;
const OVERALL_TIMEOUT_MS = 70_000;

export interface ResultPayload {
  roundId: string;
  answer: string;
  attemptNo: number;
  maxAttempts: number;
  prevLevel: number;
}

interface ResultScreenProps {
  payload: ResultPayload;
  onHome: () => void;
  onProfile: () => void;
  onRetry: () => void;
  onNextAttempt: (payload: ResultPayload, missed: string[]) => void;
  onQuota: () => void;
  onCompleted: () => void;
}

type Phase =
  | { kind: "evaluating" }
  | { kind: "timeout" }
  | { kind: "failed" }
  | { kind: "done"; result: CompletedAttempt };

function percentColor(percent: number): string {
  if (percent >= 70) return "#00f0ff";
  if (percent >= 40) return "#ffb020";
  return "#ff2d78";
}

export function ResultScreen({
  payload,
  onHome,
  onProfile,
  onRetry,
  onNextAttempt,
  onQuota,
  onCompleted,
}: ResultScreenProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "evaluating" });
  const [showXp, setShowXp] = useState(false);
  const completedRef = useRef(false);
  // один POST на все запуски эффекта (React StrictMode монтирует эффект дважды)
  const postRef = useRef<Promise<number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const deadline = Date.now() + OVERALL_TIMEOUT_MS;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    if (!postRef.current) {
      postRef.current = apiFetch<{ attemptId: number }>("/api/app/attempt", {
        method: "POST",
        body: JSON.stringify({ roundId: payload.roundId, answer: payload.answer }),
      }).then((res) => res.attemptId);
    }

    (async () => {
      let attemptId: number;
      try {
        attemptId = await postRef.current!;
      } catch (e) {
        if (cancelled) return;
        const code = (e as { code?: string }).code;
        if (code === "quota") {
          onQuota();
          return;
        }
        setPhase({ kind: "timeout" });
        return;
      }

      while (!cancelled && Date.now() < deadline) {
        try {
          const st = await apiFetch<AttemptResult>(`/api/app/attempt/${attemptId}`);
          if (st.status === "completed") {
            if (!cancelled && !completedRef.current) {
              completedRef.current = true;
              setPhase({ kind: "done", result: st as CompletedAttempt });
              haptic("success");
              onCompleted();
              setTimeout(() => !cancelled && setShowXp(true), 400);
            }
            return;
          }
          if (st.status === "failed") {
            if (!cancelled && !completedRef.current) {
              completedRef.current = true;
              setPhase({ kind: "failed" });
              haptic("error");
            }
            return;
          }
        } catch {
          /* сеть моргнула — продолжаем poll */
        }
        await sleep(POLL_INTERVAL_MS);
      }
      if (!cancelled) setPhase({ kind: "timeout" });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase.kind === "evaluating") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-8">
        <ProgressRing value={0} size={110} stroke={7} color="#00f0ff">
          <span className="animate-pulse-soft font-display text-xs tracking-widest text-neon">AI</span>
        </ProgressRing>
        <div className="text-center">
          <p className="font-display text-base font-bold text-fog">Оцениваем твой ответ…</p>
          <p className="mt-1 text-[12px] text-dim">строгий, но доброжелательный экзаменатор уже читает</p>
        </div>
        <div className="w-full max-w-sm space-y-2.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  if (phase.kind === "timeout") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-8 text-center">
        <p className="font-display text-lg font-bold text-fog">Оценка задерживается</p>
        <p className="max-w-xs text-[13px] leading-relaxed text-dim">
          Ответ принят и встал в очередь. Результат появится в профиле — проверьте позже.
        </p>
        <Button variant="outline" onClick={onHome}>
          <Home className="h-4 w-4" /> ПРОВЕРИТЬ ПОЗЖЕ
        </Button>
      </div>
    );
  }

  if (phase.kind === "failed") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-magenta/40 bg-magenta/10 text-magenta glow-magenta">
          <RotateCcw className="h-7 w-7" />
        </div>
        <p className="font-display text-lg font-bold text-fog">Не получилось оценить ответ</p>
        <p className="max-w-xs text-[13px] leading-relaxed text-dim">
          ИИ не смог оценить ответ. Ваш текст сохранён — отправьте его повторно.
        </p>
        <div className="flex gap-3">
          <Button onClick={onRetry}>
            <RotateCcw className="h-4 w-4" /> ОТПРАВИТЬ ПОВТОРНО
          </Button>
          <Button variant="ghost" onClick={onHome}>НА ГЛАВНУЮ</Button>
        </div>
      </div>
    );
  }

  const r = phase.result;
  const leveledUp = r.user && payload.prevLevel > 0 ? r.user.level > payload.prevLevel : false;
  const hasMoreAttempts = (r.attemptsLeft ?? 0) > 0;
  const modelAnswer = r.modelAnswer; // скрыт сервером между попытками

  return (
    <div className="animate-rise min-h-dvh space-y-4 p-4 pb-8">
      <div className="flex flex-col items-center pt-4">
        <ProgressRing value={r.percent} size={150} stroke={10} color={percentColor(r.percent)}>
          <span className="font-display text-4xl font-bold text-fog">{r.percent}</span>
          <span className="font-display text-[10px] tracking-[0.25em] text-dim">ПРОЦЕНТОВ</span>
        </ProgressRing>
        <p className="mt-3 text-center font-display text-sm font-semibold text-fog">{r.caseTitle}</p>
        {payload.maxAttempts > 1 && (
          <p className="mt-1 font-display text-[11px] text-dim">
            попытка {r.attemptNo} из {payload.maxAttempts}
            {r.roundBestPercent !== null && ` · лучшая: ${r.roundBestPercent}%`}
          </p>
        )}

        {showXp && (
          <div className="mt-3 flex flex-col items-center gap-1">
            <span
              className={cn(
                "animate-xp font-display text-2xl font-bold",
                r.xpEarned > 0 ? "text-neon text-glow" : "text-dim"
              )}
            >
              {r.xpEarned > 0 ? `+${r.xpEarned} XP` : "+0 XP"}
            </span>
            {leveledUp && (
              <span className="animate-xp font-display text-sm font-bold text-magenta glow-magenta">
                НОВЫЙ УРОВЕНЬ: {r.user?.level}!
              </span>
            )}
            {r.user && (
              <span className="text-[11px] text-dim">
                🔥 серия: {r.user.streakCurrent} дн. · {r.user.xpTotal} XP всего
                {typeof r.user.rating === "number" ? ` · рейтинг ${r.user.rating}` : ""}
              </span>
            )}
          </div>
        )}
        {r.engine === "mock" && (
          <p className="mt-2 rounded border border-line px-2 py-0.5 text-[10px] text-dim">
            демо-оценка: ключ AI не настроен
          </p>
        )}
      </div>

      <Card>
        <CardContent className="space-y-3.5 p-4">
          <p className="font-display text-[11px] tracking-[0.25em] text-dim">ПО КРИТЕРИЯМ</p>
          {r.criteria.map((c) => (
            <div key={c.name}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-fog">{c.name}</span>
                <span className="font-display text-[12px] text-neon">
                  {c.points}/{c.maxPoints}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(c.points / c.maxPoints) * 100}%`,
                    background: percentColor((c.points / c.maxPoints) * 100),
                    boxShadow: `0 0 8px ${percentColor((c.points / c.maxPoints) * 100)}88`,
                  }}
                />
              </div>
              <p className="mt-1 text-[12px] leading-snug text-dim">{c.comment}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {r.missed.length > 0 && (
        <Card className="border-magenta/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-magenta">
              <EyeOff className="h-4 w-4" />
              <span className="font-display text-[11px] tracking-[0.2em]">ЧТО УПУЩЕНО</span>
            </div>
            <ul className="mt-2 space-y-1.5">
              {r.missed.map((m, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-snug text-fog/90">
                  <span className="mt-0.5 text-magenta">•</span>
                  {m}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="border-neon/25">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-neon">
            <ThumbsUp className="h-4 w-4" />
            <span className="font-display text-[11px] tracking-[0.2em]">СИЛЬНЫЕ СТОРОНЫ</span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {r.strengths.map((s, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-snug text-fog/90">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neon/70" />
                {s}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-magenta/25">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-magenta">
            <ThumbsDown className="h-4 w-4" />
            <span className="font-display text-[11px] tracking-[0.2em]">ЧТО УЛУЧШИТЬ</span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {r.improvements.map((s, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-snug text-fog/90">
                <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-magenta/60" />
                {s}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {modelAnswer ? (
        <details className="group rounded-xl border border-line bg-panel/70">
          <summary className="flex cursor-pointer items-center justify-between p-4 font-display text-[11px] tracking-[0.2em] text-dim transition-colors hover:text-fog">
            ЭТАЛОННЫЙ ОТВЕТ
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <p className="whitespace-pre-line border-t border-line p-4 text-[13px] leading-relaxed text-fog/85">
            {modelAnswer}
          </p>
        </details>
      ) : hasMoreAttempts ? (
        <div className="rounded-xl border border-line bg-panel/50 p-4 text-center text-[12px] text-dim">
          Эталонный ответ откроется после финальной попытки раунда
        </div>
      ) : null}

      {hasMoreAttempts && (
        <Button
          variant="secondary"
          className="w-full"
          size="lg"
          onClick={() => onNextAttempt(payload, r.missed)}
        >
          <RotateCcw className="h-4 w-4" /> СЛЕДУЮЩАЯ ПОПЫТКА ({r.attemptsLeft} ост.)
        </Button>
      )}

      <div className="flex gap-3 pt-1">
        <Button className="flex-1" onClick={onHome}>
          <Home className="h-4 w-4" /> ЕЩЁ РАУНД
        </Button>
        <Button variant="outline" className="flex-1" onClick={onProfile}>
          <User className="h-4 w-4" /> В ПРОФИЛЬ
        </Button>
      </div>
    </div>
  );
}
