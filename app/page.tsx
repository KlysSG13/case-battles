"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BottomNav, type Screen } from "@/components/app/bottom-nav";
import { HomeScreen } from "@/components/app/home-screen";
import { SphereScreen } from "@/components/app/sphere-screen";
import { ModeScreen } from "@/components/app/mode-screen";
import { RoundScreen } from "@/components/app/round-screen";
import { ResultScreen, type ResultPayload } from "@/components/app/result-screen";
import { DuelLobbyScreen, AiDuelSetupScreen, DuelScreen } from "@/components/app/duel-screens";
import { LeaderboardScreen } from "@/components/app/leaderboard-screen";
import { ProfileScreen } from "@/components/app/profile-screen";
import { GalleryScreen } from "@/components/app/gallery-screen";
import { RewardsScreen } from "@/components/app/rewards-screen";
import { LimitScreen } from "@/components/app/limit-screen";
import { NoAuthScreen } from "@/components/app/noauth-screen";
import {
  apiFetch,
  startParam,
  tgWebApp,
  UnauthorizedError,
  type Bootstrap,
  type CaseData,
  type RoundStart,
} from "@/lib/client";

type Phase = "boot" | "noauth" | "ready";

export default function Page() {
  const [phase, setPhase] = useState<Phase>("boot");
  const [screen, setScreen] = useState<Screen>("home");
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  // визард: Сфера (шаг 1) -> Режим (шаг 2) -> Игра (шаг 3)
  const [wizardDomainId, setWizardDomainId] = useState<number | null>(null);
  const [startingMode, setStartingMode] = useState<string | null>(null);
  const [round, setRound] = useState<RoundStart | null>(null);
  const [roundAttemptNo, setRoundAttemptNo] = useState(1);
  const [roundPrevMissed, setRoundPrevMissed] = useState<string[] | undefined>(undefined);
  const [resultPayload, setResultPayload] = useState<ResultPayload | null>(null);
  const [duelId, setDuelId] = useState<number | null>(null);
  const [aiSetupLoading, setAiSetupLoading] = useState(false);
  const [gallery, setGallery] = useState<{ caseId: number | null; caseTitle?: string }>({ caseId: null });

  const [toast, setToast] = useState<string | null>(null);
  const [lbRefresh, setLbRefresh] = useState(0);
  const [profileRefresh, setProfileRefresh] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const loadBootstrap = useCallback(async () => {
    try {
      const data = await apiFetch<Bootstrap>("/api/app/bootstrap");
      setBoot(data);
      setBootError(null);
      setPhase("ready");
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setPhase("noauth");
      } else {
        setBootError(e instanceof Error ? e.message : "Не удалось загрузить данные");
      }
    } finally {
      setBootLoading(false);
    }
  }, []);

  useEffect(() => {
    const tg = tgWebApp();
    try {
      tg?.ready();
      tg?.expand();
    } catch {
      /* вне Telegram — не критично */
    }
    // загрузка после монтирования, не в sync-потоке эффекта
    const timer = setTimeout(loadBootstrap, 0);

    // вход по deep link: startapp=duel_<id> / duel_<s> (тоже вне sync-потока)
    const param = startParam();
    if (param) {
      const nav = setTimeout(() => {
        if (/^duel_\d+$/.test(param)) {
          setDuelId(Number(param.slice("duel_".length)));
          setScreen("duel");
        } else if (param === "duels") {
          setScreen("lobby");
        }
      }, 0);
      return () => {
        clearTimeout(timer);
        clearTimeout(nav);
      };
    }

    return () => clearTimeout(timer);
  }, [loadBootstrap]);

  const openHome = useCallback(() => {
    setScreen("home");
    setWizardDomainId(null);
    loadBootstrap();
  }, [loadBootstrap]);

  // ---- Раунды ----
  const startRound = useCallback(
    async (opts: { mode: string; domainId: number; difficulty: string; attempts: number; caseId?: number }) => {
      setStartingMode(opts.mode);
      try {
        const res = await apiFetch<RoundStart>("/api/app/round/start", {
          method: "POST",
          body: JSON.stringify({
            mode: opts.mode,
            domainId: opts.domainId,
            difficulty: opts.difficulty,
            attempts: opts.attempts,
            caseId: opts.caseId,
          }),
        });
        setRound(res);
        setRoundAttemptNo(1);
        setRoundPrevMissed(undefined);
        setScreen("round");
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "quota") setScreen("limit");
        showToast(e instanceof Error ? e.message : "Не удалось начать раунд");
      } finally {
        setStartingMode(null);
      }
    },
    [showToast]
  );

  const onContinue = useCallback(() => {
    // «Продолжить»: кейс дня (классика) на кейсе выбранной сферы
    const dc = boot?.dailyCase;
    startRound({
      mode: "classic",
      domainId: dc?.domainId ?? boot?.domains[0]?.id ?? 1,
      difficulty: "normal",
      attempts: 1,
      caseId: dc?.id,
    });
  }, [boot, startRound]);

  const onRoundSubmit = useCallback(
    (submit: { roundId: string; answer: string }) => {
      if (!round) return;
      setResultPayload({
        roundId: submit.roundId,
        answer: submit.answer,
        attemptNo: roundAttemptNo,
        maxAttempts: round.attempts,
        prevLevel: boot?.profile.level ?? 0,
      });
      setScreen("result");
    },
    [round, roundAttemptNo, boot]
  );

  const onNextAttempt = useCallback(
    (_payload: ResultPayload, missed: string[]) => {
      if (!round) return;
      setRoundAttemptNo((n) => n + 1);
      setRoundPrevMissed(missed);
      setScreen("round");
    },
    [round]
  );

  // ---- Дуэли ----
  const openDuel = useCallback((id: number) => {
    setDuelId(id);
    setScreen("duel");
  }, []);

  const startAiDuel = useCallback(
    async (opts: { style: string; mode: string; domainId: number; difficulty: "easy" | "normal" | "hard" }) => {
      setAiSetupLoading(true);
      try {
        const c = await apiFetch<CaseData>(`/api/app/case/next?domainId=${opts.domainId}`);
        const res = await apiFetch<{ duelId: number }>("/api/app/duel/ai", {
          method: "POST",
          body: JSON.stringify({
            caseId: c.id,
            mode: opts.mode,
            style: opts.style,
            difficulty: opts.difficulty,
          }),
        });
        openDuel(res.duelId);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Не удалось создать дуэль");
      } finally {
        setAiSetupLoading(false);
      }
    },
    [openDuel, showToast]
  );

  const rematch = useCallback(
    async (duelCaseId: number, mode: string, style: string, difficulty: string) => {
      try {
        const res = await apiFetch<{ duelId: number }>("/api/app/duel/ai", {
          method: "POST",
          body: JSON.stringify({ caseId: duelCaseId, mode, style, difficulty }),
        });
        openDuel(res.duelId);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Не удалось создать реванш");
      }
    },
    [openDuel, showToast]
  );

  if (phase === "noauth") return <NoAuthScreen />;

  if (phase === "boot") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="animate-pulse-soft font-display text-sm tracking-[0.35em] text-neon text-glow">
          КЕЙС-БАТТЛЫ
        </p>
      </div>
    );
  }

  const showNav = screen === "home" || screen === "top" || screen === "profile";

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col">
      {screen === "home" && (
        <HomeScreen
          data={boot}
          loading={bootLoading}
          error={bootError}
          onRetry={loadBootstrap}
          onContinue={onContinue}
          onNewRun={() => setScreen("sphere")}
          onDuels={() => setScreen("lobby")}
          startingMode={startingMode}
        />
      )}

      {screen === "sphere" && boot && (
        <SphereScreen
          domains={boot.domains}
          onBack={openHome}
          onPick={(domainId) => {
            setWizardDomainId(domainId);
            setScreen("mode");
          }}
        />
      )}

      {screen === "mode" && boot && wizardDomainId !== null && (
        <ModeScreen
          bootstrap={boot}
          domainId={wizardDomainId}
          onBack={() => setScreen("sphere")}
          onStart={(opts) =>
            startRound({ ...opts, domainId: wizardDomainId })
          }
          loadingMode={startingMode}
        />
      )}

      {screen === "round" && round && (
        <RoundScreen
          round={round}
          attemptNo={roundAttemptNo}
          maxAttempts={round.attempts}
          prevMissed={roundPrevMissed}
          onBack={openHome}
          onSubmit={onRoundSubmit}
        />
      )}

      {screen === "result" && resultPayload && (
        <ResultScreen
          payload={resultPayload}
          onHome={openHome}
          onProfile={() => {
            setProfileRefresh((n) => n + 1);
            setLbRefresh((n) => n + 1);
            setScreen("profile");
          }}
          onRetry={() => setScreen("round")}
          onNextAttempt={onNextAttempt}
          onQuota={() => {
            setScreen("limit");
            loadBootstrap();
          }}
          onCompleted={() => {
            loadBootstrap();
          }}
        />
      )}

      {screen === "lobby" && (
        <DuelLobbyScreen
          bootstrap={boot}
          refreshToken={lbRefresh}
          onBack={() => setScreen("home")}
          onOpenDuel={openDuel}
          onAiDuelSetup={() => setScreen("ai-setup")}
          showToast={showToast}
        />
      )}

      {screen === "ai-setup" && (
        <AiDuelSetupScreen
          bootstrap={boot}
          onBack={() => setScreen("lobby")}
          onStart={startAiDuel}
          loading={aiSetupLoading}
        />
      )}

      {screen === "duel" && duelId !== null && (
        <DuelScreen
          duelId={duelId}
          onBack={() => setScreen("lobby")}
          onRematch={(duel) => {
            if (duel.case && duel.style) {
              rematch(duel.case.id, duel.mode, duel.style, duel.difficulty);
            }
          }}
          showToast={showToast}
        />
      )}

      {screen === "top" && <LeaderboardScreen refreshToken={lbRefresh} />}

      {screen === "profile" && (
        <ProfileScreen
          refreshToken={profileRefresh}
          showToast={showToast}
          onOpenRewards={() => setScreen("rewards")}
          onOpenMyGallery={() => {
            setGallery({ caseId: null });
            setScreen("gallery");
          }}
          onOpenDuel={openDuel}
        />
      )}

      {screen === "gallery" && (
        <GalleryScreen
          caseId={gallery.caseId}
          caseTitle={gallery.caseTitle}
          onBack={() => setScreen("profile")}
        />
      )}

      {screen === "rewards" && (
        <RewardsScreen profile={boot?.profile ?? null} onBack={() => setScreen("home")} />
      )}

      {screen === "limit" && (
        <LimitScreen onHome={openHome} onPro={() => showToast("Скоро ✨")} />
      )}

      {showNav && <BottomNav active={screen} onNavigate={(s) => setScreen(s)} />}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4">
          <div className="animate-rise rounded-xl border border-neon/40 bg-panel px-4 py-2.5 font-display text-[13px] text-fog glow-neon">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
