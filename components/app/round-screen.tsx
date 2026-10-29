"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Flag, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressRing, formatClock } from "@/components/app/rings";
import { Stepper } from "@/components/app/stepper";
import { TaskContent } from "@/components/app/task-content";
import type { RoundStart } from "@/lib/client";
import { haptic } from "@/lib/client";
import { cn } from "@/lib/utils";

const DIFF_LABEL: Record<string, string> = { easy: "лёгкий", normal: "средний", hard: "сложный" };

interface RoundScreenProps {
  round: RoundStart;
  attemptNo: number;
  maxAttempts: number;
  prevMissed?: string[];
  onBack: () => void;
  onSubmit: (payload: { roundId: string; answer: string }) => void;
}

function ScenarioBlock({ round }: { round: RoundStart }) {
  const s = round.scenario!;
  return (
    <Card className="border-magenta/30">
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="font-display text-[10px] tracking-[0.25em] text-magenta">СЦЕНАРИЙ · {s.role}</p>
          <p className="mt-0.5 font-display text-sm font-bold text-fog">{s.title}</p>
        </div>
        <p className="whitespace-pre-line text-[14px] leading-relaxed text-fog/90">{s.situation}</p>
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-lg border border-line bg-panel-2 p-2.5">
            <p className="font-display text-[9px] tracking-widest text-dim">ДЕНЬГИ</p>
            <p className="mt-0.5 text-fog">{s.resources.money}</p>
          </div>
          <div className="rounded-lg border border-line bg-panel-2 p-2.5">
            <p className="font-display text-[9px] tracking-widest text-dim">ГОРОД</p>
            <p className="mt-0.5 text-fog">{s.resources.city}</p>
          </div>
          <div className="rounded-lg border border-line bg-panel-2 p-2.5">
            <p className="font-display text-[9px] tracking-widest text-dim">НАВЫКИ</p>
            <p className="mt-0.5 text-fog">{s.resources.skills.join(", ")}</p>
          </div>
          <div className="rounded-lg border border-line bg-panel-2 p-2.5">
            <p className="font-display text-[9px] tracking-widest text-dim">КАНАЛЫ</p>
            <p className="mt-0.5 text-fog">{s.resources.channels.join(", ")}</p>
          </div>
        </div>
        <div>
          <p className="font-display text-[9px] tracking-widest text-dim">СВЯЗИ</p>
          <p className="text-[12px] text-fog">{s.resources.connections.join(", ")}</p>
        </div>
        <div className="rounded-lg border border-magenta/40 bg-magenta/8 p-3">
          <p className="font-display text-[9px] tracking-widest text-magenta">ЦЕЛЬ</p>
          <p className="mt-0.5 text-[13px] text-fog">{s.goal}</p>
          <p className="mt-1.5 font-display text-[9px] tracking-widest text-magenta">РИСК-ПРОФИЛЬ</p>
          <p className="mt-0.5 text-[13px] text-fog">{s.riskProfile}</p>
        </div>
        <div>
          <p className="font-display text-[9px] tracking-widest text-dim">ОГРАНИЧЕНИЯ</p>
          <ul className="mt-1 space-y-1">
            {s.constraints.map((c, i) => (
              <li key={i} className="flex gap-2 text-[12px] text-fog/90">
                <span className="text-magenta">✕</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-neon/40 bg-neon/8 p-3 glow-neon">
          <p className="font-display text-[9px] tracking-widest text-neon">МОДЕЛЬ ОБЯЗАНА УЧИТЫВАТЬ</p>
          <ul className="mt-1 space-y-1">
            {s.rules.map((r, i) => (
              <li key={i} className="flex gap-2 text-[12px] text-fog">
                <span className="font-display text-neon">{i + 1}.</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export function RoundScreen({
  round,
  attemptNo,
  maxAttempts,
  prevMissed,
  onBack,
  onSubmit,
}: RoundScreenProps) {
  const [answer, setAnswer] = useState("");
  const [remaining, setRemaining] = useState(round.timeLimitSec);

  useEffect(() => {
    const timer = setInterval(() => setRemaining((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeUp = remaining === 0;
  const len = answer.length;
  const canSubmit = len >= round.answerMin;
  const ringValue = (remaining / round.timeLimitSec) * 100;
  const ringColor = timeUp || remaining < 60 ? "#ff2d78" : "#00f0ff";
  const isScenario = !!round.scenario;

  return (
    <div className="animate-rise flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-ink/90 backdrop-blur-md">
        <div className="flex items-center gap-2 px-4 pt-3">
          <Stepper current={3} className="flex-1" />
          <ProgressRing value={ringValue} size={44} stroke={4} color={ringColor}>
            <span
              className={cn(
                "font-display text-[9px] font-bold",
                timeUp ? "text-magenta" : "text-neon"
              )}
            >
              {formatClock(remaining)}
            </span>
          </ProgressRing>
        </div>
        <div className="flex items-center gap-3 px-4 py-2.5">
          <button
            onClick={onBack}
            aria-label="Назад"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-dim transition-colors hover:bg-white/5 hover:text-fog"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[10px] tracking-[0.2em] text-dim">
              {round.modeTitle.toUpperCase()} · {DIFF_LABEL[round.difficulty]?.toUpperCase()}
              {maxAttempts > 1 && ` · ПОПЫТКА ${attemptNo}/${maxAttempts}`}
            </p>
            <h1 className="truncate font-display text-sm font-bold text-fog">
              {isScenario ? round.scenario?.title : round.case?.title}
            </h1>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-4 p-4 pb-40">
        {round.scenarioFallback && (
          <div className="rounded-lg border border-line bg-panel/60 px-4 py-2.5 text-[12px] text-dim">
            Сценарий сгенерировать не удалось — раунд идёт на статическом кейсе домена.
          </div>
        )}
        {isScenario ? (
          <ScenarioBlock round={round} />
        ) : (
          <TaskContent body={round.case?.body ?? ""} title={round.case?.title} />
        )}

        {prevMissed && prevMissed.length > 0 && (
          <div className="rounded-lg border border-magenta/40 bg-magenta/8 p-3.5">
            <p className="font-display text-[10px] tracking-[0.2em] text-magenta">ЧТО УПУЩЕНО В ПРОШЛОЙ ПОПЫТКЕ</p>
            <ul className="mt-1.5 space-y-1">
              {prevMissed.map((m, i) => (
                <li key={i} className="flex gap-2 text-[12px] text-fog/90">
                  <span className="text-magenta">•</span>
                  {m}
                </li>
              ))}
            </ul>
          </div>
        )}

        {timeUp && (
          <div className="rounded-lg border border-magenta/40 bg-magenta/10 px-4 py-3 text-center text-[13px] text-magenta">
            Время вышло, но ответ можно отправить — оценим как есть
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="round-answer" className="font-display text-[11px] tracking-[0.2em] text-dim">
              ВАШЕ РЕШЕНИЕ
            </label>
            <span className={cn("font-display text-[11px]", canSubmit ? "text-neon" : "text-dim")}>
              {len}/{round.answerMax}
            </span>
          </div>
          <textarea
            id="round-answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value.slice(0, round.answerMax))}
            placeholder={
              round.mode === "pitch"
                ? "Крючок → проблема → решение → рынок/цифры → ask…"
                : "Что вы сделаете и почему? Структурируйте ответ, опирайтесь на цифры…"
            }
            rows={9}
            className="w-full resize-none rounded-xl border border-line bg-panel-2 p-3.5 text-[15px] leading-relaxed text-fog placeholder:text-dim/60 focus:border-neon/50 focus:outline-none focus:ring-1 focus:ring-neon/30"
          />
          {!canSubmit && len > 0 && (
            <p className="mt-1.5 text-[11px] text-dim">
              Ещё {round.answerMin - len} символов до минимума
            </p>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/90 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-md">
        <div className="mx-auto max-w-md">
          <Button
            disabled={!canSubmit}
            className="w-full"
            size="lg"
            onClick={() => {
              haptic("light");
              onSubmit({ roundId: round.roundId, answer });
            }}
          >
            {maxAttempts > 1 && attemptNo < maxAttempts ? (
              <Flag className="h-4 w-4" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            ОТПРАВИТЬ РЕШЕНИЕ
          </Button>
        </div>
      </div>
    </div>
  );
}
