import ZAI from "z-ai-web-dev-sdk";
import type { RivalStyle } from "./modes";
import type { RubricCriterion } from "./modes";

// ---- AI-соперник: генерируется ТОЛЬКО после ответа игрока ----

export type RivalOutcome =
  | { ok: true; answer: string; engine: "llm" | "mock" }
  | { ok: false; error: string };

const STYLE_PERSONAS: Record<RivalStyle, { title: string; persona: string }> = {
  analyst: {
    title: "Аналитик",
    persona:
      "Ты — консервативный аналитик: сухие цифры, расчёты, осторожные ставки, минимизация риска. Никаких громких обещаний.",
  },
  hustler: {
    title: "Хастлер",
    persona:
      "Ты — агрессивный хастлер: быстрый рост, смелые продажи, нестандартные ходы, готовность рисковать ради выручки.",
  },
  systemizer: {
    title: "Системщик",
    persona:
      "Ты — системщик: процессы, операционка, регламенты, масштабируемость и повторяемость решений.",
  },
};

function systemPrompt(style: RivalStyle, rubric: RubricCriterion[]): string {
  const criteria = rubric.map((c, i) => `${i + 1}. ${c.name} (вес ${c.weight}): ${c.description}`).join("\n");
  return [
    STYLE_PERSONAS[style].persona,
    "Ты играешь за соперника в образовательной бизнес-игре. Твоя задача — написать сильный конкурентный ответ на кейс в своём стиле мышления.",
    "Ответ на русском, 600–1000 символов, обычный текст без JSON и без markdown-заголовков.",
    "Ответ будет оценён экзаменатором по критериям:",
    criteria,
    "Пиши так, чтобы набрать максимум по этой рубрике, оставаясь в своём стиле.",
  ].join("\n");
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

// ---- Мок-соперник (демо-режим без ключа AI), 600–1000 символов ----
const MOCK_RIVAL_TAILS: Record<RivalStyle, string> = {
  analyst:
    "Точка безубыточности: при марже 30% и фиксированных расходах 120 000 ₽ нужно 400 000 ₽ выручки в месяц — считаю её до любого шага. Запускаю один канал с CAC ≤ 300 ₽ и LTV/CAC ≥ 3, вторым займусь только после окупаемости первого. Просадку спроса закладываю 20%, резерв кассы — неприкосновенные 20%. Решение принимаю по таблице: вариант, маржа, риск, срок окупаемости. Что не бьётся в цифрах — не делаю вообще.",
  hustler:
    "Двигаюсь сегодня: оффер «первые 50 клиентов — цена вдвое ниже», партнёрства с тремя городскими пабликами за бартер, прямые продажи в течение 48 часов. Обзвон 100 контактов руками, скрипт из трёх фраз, закрытие сделки в одном сообщении. Цель — 300 000 ₽ оборота за первые 3 недели, идеальность наведу потом. Если канал не даёт выручку за 5 дней — бросаю и беру следующий, отговорки не считаю аргументом.",
  systemizer:
    "Ставлю процесс: заявка → квалификация → сделка → повторная продажа. У каждого этапа метрика, ответственный и регламент: скрипт продаж, отгрузка за сутки, CRM с воронкой. Нанимаю двух агентов на сделку, чтобы рост не зависел от меня лично. Контрольная точка — конверсия ≥ 5% две недели подряд, тогда масштабирую ставку на трафик. Любой сбой разбираю по чек-листу и вшиваю в регламент, чтобы он не повторялся.",
};

export function buildMockRivalAnswer(style: RivalStyle, caseTitle: string): string {
  const head = `Кейс «${caseTitle}» — мой ход: ${
    style === "analyst"
      ? "сначала цифры, потом решения."
      : style === "hustler"
        ? "скорость важнее идеала."
        : "выстраиваю систему."
  } `;
  const body =
    style === "analyst"
      ? "Вижу три рычага: цена, объём, издержки. Считаю каждый вариант на 90 дней вперёд, сравниваю по марже при консервативном сценарии и выбираю тот, что выживает при падении спроса на пятую часть. Все допущения фиксирую в таблице, чтобы проверять факт против плана еженедельно. "
      : style === "hustler"
        ? "Хватаю самый быстрый канал продаж и выжимаю его до предела: договорённости на этой неделе, тест оффера на ста контактах за два дня, деньги вперёд идеальности. Параллельно готовлю два запасных канала — если основной выдыхается, переключаюсь без паузы. "
        : "Сначала опишу процесс целиком, потом вставлю в него людей. Каждая операция повторяема и измерима: воронка, этапы, метрики конверсии и сроки. Автоматизирую рутину на первой неделе, чтобы команда росла без потери качества. ";
  return head + body + MOCK_RIVAL_TAILS[style];
}

export async function generateRivalAnswer(input: {
  style: RivalStyle;
  caseText: string;
  caseTitle: string;
  rubric: RubricCriterion[];
}): Promise<RivalOutcome> {
  const zai = await getZai();
  if (!zai) {
    return { ok: true, answer: buildMockRivalAnswer(input.style, input.caseTitle), engine: "mock" };
  }
  try {
    const completion = (await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt(input.style, input.rubric) },
          { role: "user", content: `Кейс:\n${input.caseText}\n\nНапиши свой ответ-соперника.` },
        ],
        temperature: 0.8,
        thinking: { type: "disabled" },
      }),
      rejectAfter(60_000, "генерация соперника"),
    ])) as { choices?: { message?: { content?: string } }[] };
    const content = completion?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim().length > 0) {
      const answer = content.trim().slice(0, 1200);
      if (answer.length >= 400) return { ok: true, answer, engine: "llm" };
    }
    // LLM ответил слишком коротко — не ломаем дуэль, честный мок-соперник
    return { ok: true, answer: buildMockRivalAnswer(input.style, input.caseTitle), engine: "mock" };
  } catch {
    // LLM недоступен — не ломаем дуэль, честный мок-соперник
    return { ok: true, answer: buildMockRivalAnswer(input.style, input.caseTitle), engine: "mock" };
  }
}
