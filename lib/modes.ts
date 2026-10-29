// Единый движок раунда: режим = источник кейса × формат ответа × рубрика × соперник.
// Конфиг режима описывает всё; экраны универсальны.

import { LEAGUE_COLORS } from "./design-tokens";

export type Mode = "classic" | "constructor" | "rescue" | "pitch";
export type Difficulty = "easy" | "normal" | "hard";
export type RivalStyle = "analyst" | "hustler" | "systemizer";

export interface RubricCriterion {
  name: string;
  description: string;
  weight: number; // сумма = 100
  maxPoints: number;
}

export interface ModeConfig {
  slug: Mode;
  title: string;
  short: string;
  description: string;
  emoji: string;
  answerMin: number;
  answerMax: number;
  baseTimeLimitSec: number;
  allowsScenario: boolean; // AI-генерация условий (конструктор)
  needsCase: boolean; // статический кейс обязателен (классика/питч)
  allowsMultiAttempt: boolean; // «Три попытки»
  usesCaseRubric: boolean; // рубрика кейса из БД (только классика)
  rubric: RubricCriterion[]; // шаблон рубрики режима
  promptContext: string; // дополнение к системному промпту оценщика
  tier: "hard" | "core"; // hard: классика/дуэли (банк не меняем); core: лёгкая подача
  hint: string; // подсказка по механике режима на экране раунда
}

const rubric = (
  items: [string, string, number][]
): RubricCriterion[] =>
  items.map(([name, description, weight]) => ({ name, description, weight, maxPoints: 10 }));

export const MODES: Record<Mode, ModeConfig> = {
  classic: {
    slug: "classic",
    title: "Классика",
    short: "Кейс и свободный ответ",
    description: "Классический кейс: читай ситуацию и пиши решение по рубрике.",
    emoji: "📘",
    answerMin: 200,
    answerMax: 1500,
    baseTimeLimitSec: 240,
    allowsScenario: false,
    needsCase: true,
    allowsMultiAttempt: true,
    usesCaseRubric: true,
    rubric: [], // рубрика кейса из БД
    promptContext: "",
    tier: "hard",
    hint: "Разбери кейс по рубрике: структура, цифры, риски, шаги.",
  },
  constructor: {
    slug: "constructor",
    title: "Конструктор бизнеса",
    short: "Бизнес из выданных условий",
    description:
      "AI выдаёт стартовые условия: деньги, навыки, связи, город и правила. Построй реализуемый бизнес из них.",
    emoji: "🏗️",
    answerMin: 300,
    answerMax: 1500,
    baseTimeLimitSec: 480,
    allowsScenario: true,
    needsCase: false,
    allowsMultiAttempt: true,
    usesCaseRubric: false,
    rubric: rubric([
      ["Реализуемость с данными ресурсами", "Бизнес собирается именно из выданных ресурсов и ограничений, без магических допущений.", 30],
      ["Структура решения", "Ответ последователен: от условий к модели и выводу.", 20],
      ["Работа с цифрами", "Юнит-экономика посчитана на числах сценария.", 20],
      ["Учёт рисков", "Риски риск-профиля распознаны и закрыты.", 15],
      ["Конкретика шагов", "Первые шаги конкретны: сроки, каналы, ответственность.", 15],
    ]),
    promptContext:
      "Это режим «Конструктор бизнеса»: игроку выданы стартовые условия и 3 обязательных правила — оценивай, насколько бизнес реально собирается из этих ресурсов.",
    tier: "core",
    hint: "Идея в 1 шаг: что продаёшь, кому и за сколько. Три правила сверху обязательны.",
  },
  rescue: {
    slug: "rescue",
    title: "Спасение",
    short: "План спасения кризиса",
    description: "Сломанный кейс: цифры падают, конфликт, дедлайн горит. Нужен план спасения.",
    emoji: "🚨",
    answerMin: 300,
    answerMax: 1500,
    baseTimeLimitSec: 360,
    allowsScenario: false, // core-подача: лёгкий кейс из core-банка (не генератор)
    needsCase: false,
    allowsMultiAttempt: true,
    usesCaseRubric: false,
    rubric: rubric([
      ["Приоритизация", "Определены главные причины кризиса и порядок действий.", 30],
      ["Быстрые эффекты (quick wins)", "Есть меры, дающие результат за дни, а не месяцы.", 20],
      ["Управление рисками", "Худшие сценарии просчитаны, у них есть заглушки.", 20],
      ["Реализуемость", "План исполним силами и деньгами из сценария.", 30],
    ]),
    promptContext:
      "Это режим «Спасение»: кейс описывает кризис — оценивай ответ как план спасения бизнеса.",
    tier: "core",
    hint: "Один решающий шаг: что сделаешь ПЕРВЫМ, чтобы остановить проблему.",
  },
  pitch: {
    slug: "pitch",
    title: "Питч инвестору",
    short: "Крючок → проблема → решение → рынок → ask",
    description: "Кейс в формате питча: убедите инвестора за 4 минуты.",
    emoji: "🎤",
    answerMin: 200,
    answerMax: 1200,
    baseTimeLimitSec: 240,
    allowsScenario: false,
    needsCase: true,
    allowsMultiAttempt: false,
    usesCaseRubric: false,
    rubric: rubric([
      ["Ясность и структура", "Питч следует структуре: крючок → проблема → решение → рынок/цифры → ask.", 25],
      ["Цифры и рынок", "Рынок и экономика оценены числами, а не словами.", 25],
      ["Ask и обоснование", "Ясно, что просят и почему именно эта сумма/условия.", 25],
      ["Работа с возражениями", "Главные сомнения инвестора предвосхищены и закрыты.", 25],
    ]),
    promptContext:
      "Это режим «Питч инвестору»: ответ должен быть питчем по структуре «крючок → проблема → решение → рынок/цифры → ask (что просишь)».",
    tier: "core",
    hint: "5 строк по порядку: крючок → проблема → решение → цифра → что просишь.",
  },
};

export const MODE_LIST: ModeConfig[] = [MODES.classic, MODES.constructor, MODES.rescue, MODES.pitch];

export function isMode(value: unknown): value is Mode {
  return typeof value === "string" && value in MODES;
}

export function isDifficulty(value: unknown): value is Difficulty {
  return value === "easy" || value === "normal" || value === "hard";
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "лёгкий",
  normal: "средний",
  hard: "сложный",
};

// таймер ×1.2 / ×1.0 / ×0.8; рейтинг-очки ×0.8 / ×1.0 / ×1.3
export const TIME_MULT: Record<Difficulty, number> = { easy: 1.2, normal: 1.0, hard: 0.8 };
export const RATING_MULT: Record<Difficulty, number> = { easy: 0.8, normal: 1.0, hard: 1.3 };

export function timeLimitFor(mode: Mode, difficulty: Difficulty): number {
  return Math.round(MODES[mode].baseTimeLimitSec * TIME_MULT[difficulty]);
}

// ---- Лиги (Elo-лайт) ----
export interface League {
  key: "bronze" | "silver" | "gold" | "platinum";
  title: string;
  min: number;
  color: string; // из единого модуля токенов (lib/design-tokens.ts)
  emoji: string;
}

export const LEAGUES: League[] = [
  { key: "bronze", title: "Бронза", min: 0, color: LEAGUE_COLORS.bronze, emoji: "🥉" },
  { key: "silver", title: "Серебро", min: 1100, color: LEAGUE_COLORS.silver, emoji: "🥈" },
  { key: "gold", title: "Золото", min: 1300, color: LEAGUE_COLORS.gold, emoji: "🥇" },
  { key: "platinum", title: "Платина", min: 1600, color: LEAGUE_COLORS.platinum, emoji: "💎" },
];

export function leagueFor(rating: number): League {
  let current = LEAGUES[0];
  for (const league of LEAGUES) {
    if (rating >= league.min) current = league;
  }
  return current;
}

export function nextLeagueFor(rating: number): League | null {
  for (const league of LEAGUES) {
    if (league.min > rating) return league;
  }
  return null;
}

// ---- Рейтинг: старт 1000; AI +15/−10; PvP +20/−15; ничья 0; × сложность ----
export const RATING_START = 1000;
export const RATING_AI = { win: 15, loss: -10 };
export const RATING_PVP = { win: 20, loss: -15 };
export const DUEL_WIN_XP_BONUS = 20;
export const DUEL_DRAW_DELTA = 3; // |Δpercent| < 3 п.п. -> ничья
export const DUEL_TTL_HOURS = 48;

export function ratingDelta(
  kind: "ai" | "pvp",
  outcome: "win" | "loss" | "draw",
  difficulty: Difficulty
): number {
  if (outcome === "draw") return 0;
  const base = kind === "ai" ? RATING_AI : RATING_PVP;
  return Math.round(base[outcome] * RATING_MULT[difficulty]);
}

export const RIVAL_STYLES: { key: RivalStyle; title: string; description: string; emoji: string }[] = [
  { key: "analyst", title: "Аналитик", description: "Сухие цифры, консервативные ставки", emoji: "📊" },
  { key: "hustler", title: "Хастлер", description: "Агрессивный рост и продажи", emoji: "⚡" },
  { key: "systemizer", title: "Системщик", description: "Процессы и операционка", emoji: "🛠️" },
];

export function newRoundId(): string {
  return `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
