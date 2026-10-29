"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Flame, Gift, Lock, Trophy, Zap } from "lucide-react";
import { Drone } from "@/components/app/drone";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, type MeData } from "@/lib/client";
import { haptic } from "@/lib/client";
import { cn } from "@/lib/utils";

interface ProfileScreenProps {
  refreshToken: number;
  onOpenRewards: () => void;
  onOpenMyGallery: () => void;
  onOpenDuel: (duelId: number) => void;
  showToast: (text: string) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

const MODE_LABEL: Record<string, string> = {
  classic: "классика",
  constructor: "конструктор",
  rescue: "спасение",
  pitch: "питч",
};

export function ProfileScreen({
  refreshToken,
  onOpenRewards,
  onOpenMyGallery,
  onOpenDuel,
  showToast,
}: ProfileScreenProps) {
  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMe = useCallback(async (): Promise<MeData> => apiFetch<MeData>("/api/app/me"), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (!cancelled) setData(me);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Не удалось загрузить профиль");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchMe, refreshToken]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchMe());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить профиль");
    } finally {
      setLoading(false);
    }
  }, [fetchMe]);

  const togglePrivacy = async () => {
    if (!data) return;
    haptic("light");
    const next = !data.profile.profilePublic;
    try {
      await apiFetch("/api/app/me", {
        method: "POST",
        body: JSON.stringify({ profilePublic: next }),
      });
      setData({ ...data, profile: { ...data.profile, profilePublic: next } });
      showToast(next ? "Профиль публичный" : "Профиль скрыт из рейтингов и галереи");
    } catch {
      showToast("Не удалось изменить приватность");
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-dim">{error}</p>
        <button
          onClick={load}
          className="rounded-lg border border-neon/50 bg-neon/10 px-5 py-2 font-display text-sm text-neon"
        >
          ПОВТОРИТЬ
        </button>
      </div>
    );
  }
  if (!data) return null;

  const { profile, badges, attempts, quota } = data;
  const earned = badges.filter((b) => b.earned);
  const locked = badges.filter((b) => !b.earned);

  return (
    <div className="animate-rise min-h-dvh space-y-4 p-4 pb-6">
      <h1 className="pt-2 font-display text-lg font-bold text-fog">Профиль</h1>

      <Card className="glow-soft">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-base font-bold text-fog">{profile.firstName}</p>
              {profile.username && <p className="text-[11px] text-dim">@{profile.username}</p>}
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-neon/30 bg-neon/10 px-2.5 py-1">
              <Zap className="h-3.5 w-3.5 text-neon" />
              <span className="font-display text-sm font-bold text-neon">УР. {profile.progress.level}</span>
            </div>
          </div>
          <div className="mt-3">
            <Progress value={profile.progress.progressPct} />
            <div className="mt-1 flex justify-between text-[11px] text-dim">
              <span>{profile.xpTotal} XP всего</span>
              <span>до ур. {profile.progress.level + 1}: {profile.progress.xpToNext} XP</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">{profile.league.emoji}</span>
              <div>
                <p className="font-display text-[10px] tracking-widest text-dim">РЕЙТИНГ · ЛИГА</p>
                <p className="font-display text-sm font-bold" style={{ color: profile.league.color }}>
                  {profile.rating} · {profile.league.title}
                </p>
              </div>
            </div>
            <button
              onClick={onOpenRewards}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-display text-[10px] font-bold",
                profile.rewardsUnlocked
                  ? "border-neon/50 bg-neon/10 text-neon"
                  : "border-line text-dim"
              )}
            >
              <Gift className="h-3.5 w-3.5" />
              НАГРАДЫ
            </button>
          </div>
          {profile.league.next && (
            <div className="mt-2.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${profile.league.progressPct}%`, background: profile.league.color }}
                />
              </div>
              <p className="mt-1 text-[10px] text-dim">
                до «{profile.league.next.title}»: {profile.league.next.min - profile.rating} очков
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card className="border-magenta/30">
          <CardContent className="flex items-center gap-2.5 p-3.5">
            <Flame className="h-6 w-6 shrink-0 text-magenta" />
            <div className="min-w-0">
              <p className="font-display text-base font-bold text-fog">{profile.streakCurrent} дн.</p>
              <p className="text-[10px] leading-tight text-dim">серия · рекорд {profile.streakBest}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5">
            <p className="font-display text-base font-bold text-fog">
              {quota.limit === null ? "∞" : `${quota.remaining}/${quota.limit}`}
            </p>
            <p className="text-[10px] leading-tight text-dim">
              {quota.limit === null ? "раундов · PRO" : "раундов осталось"}
            </p>
          </CardContent>
        </Card>
        <Card className={cn("col-span-3 flex items-center gap-4 border-line py-4", profile.mascot.xpBonusActive && "border-neon/40")}>
          <CardContent className="flex w-full items-center gap-4 p-0 pl-4">
            <Drone
              charge={profile.mascot.charge}
              state={profile.mascot.sleeping ? "sleep" : "idle"}
              size={96}
            />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold text-fog">
                Синт-дрон · {profile.mascot.charge}%
              </p>
              <p className="text-[11px] text-dim">{profile.mascot.label}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn(
                    "h-full rounded-full",
                    profile.mascot.charge >= 60 ? "bg-neon" : profile.mascot.charge >= 25 ? "bg-amber-400" : "bg-magenta"
                  )}
                  style={{ width: `${profile.mascot.charge}%` }}
                />
              </div>
              {profile.mascot.xpBonusActive && (
                <p className="mt-1.5 font-display text-[10px] tracking-wider text-neon">БОНУС +10% XP АКТИВЕН</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <button onClick={togglePrivacy} className="w-full text-left active:scale-[0.99]">
        <Card className={cn(profile.profilePublic ? "border-line" : "border-amber-500/40")}>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              {profile.profilePublic ? (
                <Eye className="h-5 w-5 text-neon" />
              ) : (
                <EyeOff className="h-5 w-5 text-amber-400" />
              )}
              <div>
                <p className="font-display text-[12px] font-bold text-fog">
                  {profile.profilePublic ? "Профиль публичный" : "Профиль скрыт"}
                </p>
                <p className="text-[10px] leading-tight text-dim">
                  {profile.profilePublic
                    ? "виден в рейтингах и галерее ответов"
                    : "нет в рейтингах и галерее; статистика только у вас"}
                </p>
              </div>
            </div>
            <div
              className={cn(
                "relative h-6 w-11 rounded-full transition-colors",
                profile.profilePublic ? "bg-neon/40" : "bg-white/10"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-fog transition-all",
                  profile.profilePublic ? "left-[22px]" : "left-0.5"
                )}
              />
            </div>
          </CardContent>
        </Card>
      </button>

      <section>
        <h2 className="mb-2 font-display text-[11px] tracking-[0.25em] text-dim">
          БЕЙДЖИ · {earned.length}/{badges.length}
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {earned.map((b) => (
            <div
              key={b.code}
              className="flex flex-col items-center gap-1 rounded-xl border border-neon/40 bg-neon/8 p-2 text-center glow-neon"
            >
              <span className="text-2xl">{b.emoji}</span>
              <p className="font-display text-[9px] font-semibold leading-tight text-fog">{b.title}</p>
            </div>
          ))}
          {locked.map((b) => (
            <div
              key={b.code}
              className="relative flex flex-col items-center gap-1 rounded-xl border border-line bg-panel/40 p-2 text-center"
              title={b.description}
            >
              <span className="text-2xl opacity-25 grayscale">{b.emoji}</span>
              <p className="font-display text-[9px] leading-tight text-dim/70">{b.title}</p>
              <Lock className="absolute right-1.5 top-1.5 h-3 w-3 text-dim/50" />
              <p className="text-[8px] leading-tight text-dim/60">{b.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-[11px] tracking-[0.25em] text-dim">ИСТОРИЯ · ПОСЛЕДНИЕ 10</h2>
          <button onClick={onOpenMyGallery} className="flex items-center gap-1 text-[11px] text-neon">
            <Trophy className="h-3 w-3" /> публичные ответы
          </button>
        </div>
        {attempts.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-[13px] text-dim">
              Пока нет решённых раундов. Начните с кейса дня на главной!
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {attempts.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-lg border border-line bg-panel/50 px-3 py-2.5"
              >
                <span className="text-lg">{a.domainEmoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-fog">{a.caseTitle}</p>
                  <p className="text-[11px] text-dim">
                    {MODE_LABEL[a.mode] ?? a.mode} · {formatDate(a.submittedAt)}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "font-display text-sm font-bold",
                      a.percent >= 70 ? "text-neon" : a.percent >= 40 ? "text-amber-400" : "text-magenta"
                    )}
                  >
                    {a.percent}%
                  </p>
                  <p className="font-display text-[10px] text-dim">+{a.xpEarned} XP</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {data.duels.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-[11px] tracking-[0.25em] text-dim">МОИ ДУЭЛИ</h2>
          <div className="space-y-2">
            {data.duels.map((d) => (
              <button
                key={d.id}
                onClick={() => onOpenDuel(d.id)}
                className="flex w-full items-center justify-between rounded-lg border border-line bg-panel/50 px-3 py-2.5 text-left"
              >
                <span className="text-[13px] text-fog">
                  ⚔️ Дуэль #{d.id} · {MODE_LABEL[d.mode] ?? d.mode}
                </span>
                <span
                  className={cn(
                    "font-display text-[10px] font-bold",
                    d.isDraw ? "text-dim" : d.iWon ? "text-neon" : "text-magenta"
                  )}
                >
                  {d.status === "finished" ? (d.isDraw ? "НИЧЬЯ" : d.iWon ? "ПОБЕДА" : "ПОРАЖЕНИЕ") : d.status === "expired" ? "ИСТЕКЛА" : "В ИГРЕ"}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
