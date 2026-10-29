import { z } from "zod";
import ZAI from "z-ai-web-dev-sdk";
import type { Mode } from "./modes";

// ---- Схема сценария (§2) ----
export const ScenarioSchema = z.object({
  title: z.string().min(3),
  role: z.string().min(2),
  situation: z.string().min(200), // 120–200 слов ~ 700+ символов
  resources: z.object({
    money: z.string().min(1),
    city: z.string().min(1),
    skills: z.array(z.string().min(1)).min(1),
    connections: z.array(z.string().min(1)).min(1),
    channels: z.array(z.string().min(1)).min(1),
  }),
  constraints: z.array(z.string().min(1)).min(2),
  goal: z.string().min(3),
  riskProfile: z.string().min(3),
  rules: z.array(z.string().min(3)).length(3),
  missedFactors: z.array(z.string().min(3)).min(5).max(7),
});

export type Scenario = z.infer<typeof ScenarioSchema>;

/** Сценарий, который видит клиент (missedFactors скрыты). */
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

export function toPublicScenario(s: Scenario): ScenarioPublic {
  const { title, role, situation, resources, constraints, goal, riskProfile, rules } = s;
  return { title, role, situation, resources, constraints, goal, riskProfile, rules };
}

export type ScenarioOutcome =
  | { kind: "generated"; scenario: Scenario; engine: "llm" | "mock" }
  | { kind: "fallback"; caseId: number; caseBody: string; caseTitle: string; reason: string };

const CONSTRUCTOR_ROLES = ["студент", "фаундер", "маркетолог", "продуктолог", "локальный предприниматель"];

function systemPrompt(mode: Mode): string {
  const crisis =
    mode === "rescue"
      ? "Сценарий — КРИЗИС: бизнес/проект уже существует, цифры падают, есть конфликт и горящий дедлайн. Цель — спасти."
      : "Сценарий — стартовые условия для постройки нового бизнеса с нуля.";
  return [
    "Ты — генератор игровых бизнес-сценариев для образовательной игры. Верни СТРОГО валидный JSON без markdown-обёртки по схеме:",
    '{"title":"название 2–6 слов","role":"роль протагониста (студент/фаундер/маркетолог/продуктолог/локальный предприниматель)","situation":"ситуация 120–200 слов с конкретикой и цифрами","resources":{"money":"сумма в рублях","city":"город","skills":["навык",...],"connections":["связь",...],"channels":["канал продаж/дистрибуции",...]},"constraints":["ограничение",...],"goal":"измеримая цель","riskProfile":"главный риск","rules":["правило 1","правило 2","правило 3"],"missedFactors":["фактор, который слабый ответ пропустит",... 5–7 штук]}',
    crisis,
    "Требования: всё на русском; ЛЁГКИЙ уровень: situation — короткая простая ситуация 60–100 слов с одним очевидным конфликтом и 2–3 конкретными цифрами, без многоходовых расчётов; rules — ровно 3 простых обязательных требования; missedFactors — 5–7 конкретных факторов, которые типичный слабый ответ проигнорирует (каждый ≤ 12 слов).",
  ].join("\n");
}

function userPrompt(mode: Mode, domainTitle: string, role?: string): string {
  return `Домен: ${domainTitle}. Режим: ${mode === "rescue" ? "спасение (кризис)" : "конструктор бизнеса"}. Роль протагониста: ${role ?? "случайная из списка"}. Сгенерируй один сценарий.`;
}

function rejectAfter(ms: number, label: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} (таймаут ${ms / 1000} с)`)), ms)
  );
}

interface ZaiClient {
  chat: { completions: { create: (body: Record<string, unknown>) => Promise<unknown> } };
}

let cachedZai: ZaiClient | null | undefined;
async function getZai(): Promise<ZaiClient | null> {
  if (cachedZai === undefined) {
    try {
      cachedZai = (await Promise.race([
        ZAI.create(),
        rejectAfter(10_000, "инициализация AI-клиента"),
      ])) as unknown as ZaiClient;
    } catch {
      cachedZai = null;
    }
  }
  return cachedZai;
}

function extractJson(content: string): unknown | null {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      try {
        return JSON.parse(fence[1].trim());
      } catch {
        /* дальше */
      }
    }
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ---- Мок-генератор (демо-режим без ключа AI): детерминированно-случайный ----
function pick<T>(arr: T[], seed: number): T {
  // Math.abs против 32-битных битовых сдвигов: Date.now() >> n уходит в минус
  return arr[Math.abs(Math.trunc(seed)) % arr.length];
}

export function buildMockScenario(mode: Mode, domainTitle: string, seed = Date.now()): Scenario {
  const role = pick(CONSTRUCTOR_ROLES, seed);
  const money = pick(["180 000 ₽", "450 000 ₽", "1 200 000 ₽", "90 000 ₽", "2 500 000 ₽"], seed >> 2);
  const city = pick(["Казань", "Нижний Новгород", "Тверь", "Сочи", "Пермь", "Тюмень"], seed >> 3);
  const crisis = mode === "rescue";
  const situation = crisis
    ? `Вы — ${role}, и вы у руля небольшого бизнеса в ${city}. За полгода выручка упала с 1,9 до 1,1 млн ₽ в месяц: ушёл ключевой клиент (28% оборота), двое из шести мастеров ушли к конкуренту, арендодатель поднял ставку на 18%. Кассовый разрыв наступит через 5 недель при запасе ${money}. Партнёр настаивает на закрытии точки и переходе в онлайн, команда — на распродаже склада. Кредит под 26% банк одобрил лишь ${money} с поручительством. Разговор с якорным клиентом о повторном контракте назначен через 10 дней, и к нему нужно прийти с планом. Репутация в локальном сообществе — последний актив: 3 800 подписчиков и рейтинг 4,7.`
    : `Вы — ${role} в ${city}. На руках ${money} подушки, ноутбук и 4–6 рабочих часов в день. Навыки: продажи и работа с цифрами. Связи: знакомый байер региональной сети и админ городской группы (12 000 подписчиков). Каналы: локальный маркетплейс, Telegram-магазин и точка на ярмарке выходного дня. Аренда микро-склада — 25 000 ₽/мес. Конкуренты демпингуют, но их цикл доставки — 4 дня, а район любит забрать «сегодня». Банк готов дать рассрочку на терминал при первом обороте 300 000 ₽. Цель — выйти на стабильную маржинальную выручку за квартал.`;
  return {
    title: crisis ? `Кризис в ${city}: точка невозврата` : `Старт из ${city} без бюджета`,
    role,
    situation,
    resources: {
      money,
      city,
      skills: crisis ? ["управление командой", "переговоры", "работа с цифрами"] : ["продажи", "работа с цифрами", "контент"],
      connections: crisis ? ["бывший якорный клиент", "локальный бизнес-клуб", "арендодатель"] : ["байер сети", "админ городской группы"],
      channels: crisis ? ["локальные чаты", "сарафан", "остатки маркетплейса"] : ["маркетплейс региона", "Telegram-магазин", "ярмарка"],
    },
    constraints: crisis
      ? ["нельзя брать кредит больше 1 млн ₽", "уволить можно максимум одного человека", "скидки глубже 15% запрещены"]
      : ["нельзя нанимать штат до первой выручки", "рекламный бюджет — не более 20% подушки", "работа только в одном городе"],
    goal: crisis
      ? "за 8 недель вернуться к выручке 1,4 млн ₽/мес. без новых долгов"
      : "за 12 недель выйти на 350 000 ₽ выручки в месяц с маржой ≥ 20%",
    riskProfile: crisis ? "кассовый разрыв и потеря команды до стабилизации" : "слив подушки на рекламу без юнит-экономики",
    rules: [
      "модель должна собираться из выданных ресурсов и каналов",
      "в решении должны быть расчёты на числах сценария",
      "первые шаги — конкретные, со сроком до 2 недель",
    ],
    missedFactors: [
      "запас прочности по кассе не посчитан",
      "каналы не сравнены по стоимости привлечения",
      "роль и её ограничения не учтены",
      "риск-профиль не закрыт планом Б",
      "цель не декомпозирована по неделям",
      "юнит-экономика канала не посчитана",
    ].slice(0, 5 + (seed % 3)),
  };
}

// ---- Основной вход: сгенерировать сценарий режима ----
export async function generateScenario(
  mode: "constructor" | "rescue",
  domainTitle: string,
  fallback: () => Promise<{ caseId: number; caseBody: string; caseTitle: string }>
): Promise<ScenarioOutcome> {
  const zai = await getZai();
  if (!zai) {
    return { kind: "generated", scenario: buildMockScenario(mode, domainTitle), engine: "mock" };
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const completion = (await Promise.race([
        zai.chat.completions.create({
          messages: [
            { role: "system", content: systemPrompt(mode) },
            { role: "user", content: userPrompt(mode, domainTitle, pick(CONSTRUCTOR_ROLES, Date.now())) },
          ],
          temperature: 0.9,
          thinking: { type: "disabled" },
        }),
        rejectAfter(60_000, "генерация сценария"),
      ])) as { choices?: { message?: { content?: string } }[] };
      const content = completion?.choices?.[0]?.message?.content;
      if (typeof content === "string") {
        const parsed = ScenarioSchema.safeParse(extractJson(content));
        if (parsed.success) {
          return { kind: "generated", scenario: parsed.data, engine: "llm" };
        }
      }
    } catch {
      /* повтор */
    }
  }
  // Две неудачи -> фолбэк: случайный статический кейс домена, режим не падает
  const fb = await fallback();
  return { kind: "fallback", ...fb, reason: "генерация дважды не удалась" };
}

/** Текст «кейса» для оценщика: сценарий, свёрнутый в кейс. */
export function scenarioToCaseText(scenario: Scenario): string {
  const r = scenario.resources;
  return [
    `Сценарий: ${scenario.title}. Роль: ${scenario.role}.`,
    scenario.situation,
    `Ресурсы: деньги — ${r.money}; город — ${r.city}; навыки — ${r.skills.join(", ")}; связи — ${r.connections.join(", ")}; каналы — ${r.channels.join(", ")}.`,
    `Ограничения: ${scenario.constraints.join("; ")}.`,
    `Цель: ${scenario.goal}. Риск-профиль: ${scenario.riskProfile}.`,
    `Обязательные правила для модели: ${scenario.rules.join("; ")}.`,
    `Опишите бизнес (или план спасения), реализуемый с этими данными. Что вы сделаете и почему?`,
  ].join("\n");
}
