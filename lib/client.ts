"use client";

import { DEV_MODE } from "./dev-mode";

// ---- Telegram WebApp ----

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  ready: () => void;
  expand: () => void;
  openTelegramLink?: (url: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
}

export function startParam(): string | null {
  return tgWebApp()?.initDataUnsafe?.start_param ?? null;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function tgWebApp(): TelegramWebApp | null {
  return typeof window !== "undefined" ? (window.Telegram?.WebApp ?? null) : null;
}

export function haptic(type: "success" | "error" | "light"): void {
  try {
    const tg = tgWebApp();
    if (type === "light") tg?.HapticFeedback?.impactOccurred("light");
    else tg?.HapticFeedback?.notificationOccurred(type);
  } catch {
    /* хаптика необязательна */
  }
}

// ---- Авторизация: tma <initData> на всех запросах /api/app/* ----

let cachedAuth: string | null = null;

export function authHeaderValue(): string {
  if (cachedAuth) return cachedAuth;
  if (typeof window === "undefined") return "";
  const initData = tgWebApp()?.initData ?? "";
  if (initData) {
    cachedAuth = `tma ${initData}`;
    return cachedAuth;
  }
  if (DEV_MODE) {
    let id = window.localStorage.getItem("cg_dev_id");
    if (!id) {
      id = String(900_000_000 + Math.floor(Math.random() * 99_999_999));
      window.localStorage.setItem("cg_dev_id", id);
    }
    cachedAuth = `tma dev:${id}`;
    return cachedAuth;
  }
  return "";
}

export class UnauthorizedError extends Error {}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, status: number, code = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("authorization", authHeaderValue());
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) throw new UnauthorizedError("Открой приложение через Telegram");
  const data = (await res.json().catch(() => null)) as
    | (T & { error?: string; code?: string })
    | null;
  if (!res.ok) {
    throw new ApiError(
      data?.error ?? "Что-то пошло не так",
      res.status,
      data?.code ?? "error"
    );
  }
  return data as T;
}

// ---- Типы ответов API ----

export interface Progress {
  level: number;
  xpIntoLevel: number;
  xpToNext: number;
  nextLevelXp: number;
  progressPct: number;
}

export interface Profile {
  firstName: string;
  username: string | null;
  level: number;
  xpTotal: number;
  streakCurrent: number;
  streakBest: number;
  isPro: boolean;
  profilePublic: boolean;
  rating: number;
  league: {
    key: string;
    title: string;
    emoji: string;
    color: string;
    next: { title: string; min: number } | null;
    progressPct: number;
  };
  mascot: { charge: number; sleeping: boolean; label: string; xpBonusActive: boolean };
  rewardsUnlocked: boolean;
  progress: Progress;
}

export interface ModeInfo {
  slug: "classic" | "constructor" | "rescue" | "pitch";
  title: string;
  short: string;
  description: string;
  emoji: string;
  baseTimeLimitSec: number;
}

export interface DomainInfo {
  id: number;
  slug: string;
  title: string;
  emoji: string;
}

export interface Quota {
  usedToday: number;
  limit: number | null;
  remaining: number | null;
}

export interface Bootstrap {
  profile: Profile;
  modes: ModeInfo[];
  domains: DomainInfo[];
  dailyCase: {
    id: number;
    title: string;
    difficulty: number;
    domainId: number;
    domainSlug: string;
    domainTitle: string;
    domainEmoji: string;
  } | null;
  quota: Quota;
}

export interface ScenarioPublic {
  title: string;
  role: string;
  situation: string;
  resources: {
    money: string;
    city: string;
    skills: string[];
    connections: string[];
    channels: string[];
  };
  constraints: string[];
  goal: string;
  riskProfile: string;
  rules: string[];
}

export interface RoundStart {
  roundId: string;
  attemptId: number;
  mode: ModeInfo["slug"];
  modeTitle: string;
  difficulty: "easy" | "normal" | "hard";
  attempts: number;
  timeLimitSec: number;
  answerMin: number;
  answerMax: number;
  modeHint?: string;
  task: {
    title: string;
    blocks: unknown[];
    domainSlug: string;
    domainTitle: string;
    domainEmoji: string;
  } | null;
  scenario: ScenarioPublic | null;
  scenarioFallback: boolean;
  case: {
    id: number;
    title: string;
    body: string;
    domain: DomainInfo;
  } | null;
}

export interface CaseData {
  id: number;
  title: string;
  body: string;
  timeLimitSec: number;
  difficulty: number;
  domain: DomainInfo;
}

export interface AttemptResult {
  status: "pending" | "completed" | "failed";
  attemptId?: number;
  caseTitle?: string;
  percent?: number;
  xpEarned?: number;
  engine?: "llm" | "mock";
  criteria?: { name: string; points: number; maxPoints: number; comment: string }[];
  strengths?: string[];
  improvements?: string[];
  modelAnswer?: string;
  message?: string;
  user?: AttemptUser;
}

export interface AttemptUser {
  level: number;
  xpTotal: number;
  streakCurrent: number;
  streakBest: number;
  progressPct: number;
  xpToNext: number;
}

export interface CompletedAttempt {
  status: "completed";
  attemptId: number;
  caseTitle: string;
  percent: number;
  xpEarned: number;
  engine: "llm" | "mock";
  mode: string;
  modeTitle: string;
  difficulty: string;
  attemptNo: number;
  isBest: boolean;
  roundId: string | null;
  attemptsLeft: number | null;
  roundBestPercent: number | null;
  missed: string[];
  modelAnswer: string | null;
  criteria: { name: string; points: number; maxPoints: number; comment: string }[];
  strengths: string[];
  improvements: string[];
  user: AttemptUser & { rating?: number };
}

export interface LeaderboardData {
  period: "week" | "all" | "league";
  rows: { place: number; name: string; level: number; xp: number; isMe?: boolean }[];
  me: { place: number; name: string; level: number; xp: number; isMe?: boolean } | null;
}

export interface DuelSide {
  name: string;
  isMe: boolean;
  percent: number;
  answer: string | null;
  xpEarned: number;
  ratingDelta: number;
  engine?: "llm" | "mock";
}

export interface DuelState {
  duelId: number;
  status: "open" | "awaiting" | "finished" | "expired";
  mode: string;
  modeTitle: string;
  difficulty: string;
  style: string | null;
  isParticipant: boolean;
  isAuthor: boolean;
  mySide: "a" | "b" | null;
  iSolved: boolean;
  timeLimitSec: number;
  answerMin: number;
  answerMax: number;
  expiresAt: string;
  case: { id: number; title: string; body: string; domain: DomainInfo } | null;
  verdict?: "me" | "rival" | "draw";
  a?: DuelSide;
  b?: DuelSide | null;
  myRating?: { delta: number; before: number; after: number } | null;
  user?: { level: number; xpTotal: number; rating: number };
}

export interface GalleryItem {
  attemptId: number;
  caseId: number | null;
  caseTitle?: string | null;
  author: string;
  isMine: boolean;
  percent: number;
  mode: string;
  difficulty: string;
  xpEarned: number;
  submittedAt: string | null;
  answer: string;
  criteria: { name: string; points: number; maxPoints: number; comment?: string }[];
  strengths: string[];
  improvements: string[];
  missed: string[];
  modelAnswer: string | null;
}

export interface MeData {
  profile: Profile;
  quota: Quota;
  badges: {
    code: string;
    title: string;
    description: string;
    emoji: string;
    earned: boolean;
    awardedAt: string | null;
  }[];
  attempts: {
    id: number;
    caseTitle: string;
    domainEmoji: string;
    domainTitle: string;
    percent: number;
    xpEarned: number;
    submittedAt: string | null;
    mode: string;
  }[];
  duels: {
    id: number;
    status: string;
    mode: string;
    iWon: boolean;
    isDraw: boolean;
  }[];
}
