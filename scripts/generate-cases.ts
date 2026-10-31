/**
 * Генератор черновиков кейсов (ИИ) — npm run cases:generate
 *   npm run cases:generate -- --kind=core --sphere=business --count=3
 * Два этапа: модель предлагает темы (без пересечений с реестром) → по кейсу на тему
 * (1 вызов + ровно 1 ретрай, всего ≤3 вызовов LLM на кейс). Черновики пишет в
 * data/case-drafts/<slug>.json + manifest.json. ФИНАЛЬНОЕ СЛОВО ВСЕГДА ЗА ЧЕЛОВЕКОМ:
 * отклонённые черновики переносим в data/case-drafts/rejected/.
 */
export {}; // файл — модуль, а не глобальный скрипт

try {
  process.loadEnvFile?.();
} catch {
  /* переменные могут быть заданы снаружи */
}

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import ZAI from "z-ai-web-dev-sdk";
import { z } from "zod";
import { loadCoreBank, loadClassicBank } from "../lib/case-bank";
import { CoreDraftSchema, ClassicDraftSchema, significantWords, topicOverlap, slugify } from "./cases-shared";

// ---------- CLI ----------

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const KIND = opt("kind");
const SPHERE = opt("sphere");
const COUNT = Number(opt("count") ?? 3);

if ((KIND !== "core" && KIND !== "classic") || !["business", "product", "law"].includes(SPHERE ?? "")) {
  console.log("Использование: npm run cases:generate -- --kind=core|classic --sphere=business|product|law --count=N (N ≤ 10)");
  process.exit(1);
}
if (!Number.isInteger(COUNT) || COUNT < 1 || COUNT > 10) {
  console.log("✗ count должен быть целым 1–10 (контроль стоимости)");
  process.exit(1);
}

// ---------- z-ai клиент (как в lib/evaluator) ----------

async function createZai() {
  try {
    return await Promise.race([
      ZAI.create(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10_000)),
    ]);
  } catch {
    return null;
  }
}

const zai = await createZai();
if (!zai) {
  console.error(
    "✗ AI-клиент недоступен (нет .z-ai-config). Генерация запускается локально:\n" +
      "  создайте ~/.z-ai-config {\"baseUrl\":\"https://api.../v1\",\"apiKey\":\"...\"}\n" +
      "  см. README «AI-движок»"
  );
  process.exit(1);
}

// ---------- Реестр тем и занятые ситуации ----------

type Topic = { kind: string; sphere: string; topic: string };
const topics: Topic[] = JSON.parse(readFileSync("data/case-topics.json", "utf8"));
const registrySameKind = topics.filter((t) => t.kind === KIND && t.sphere === SPHERE).map((t) => t.topic);
const allTitles = [
  ...loadCoreBank().map((c) => c.title),
  ...loadClassicBank().flatMap((d) => d.cases.map((c) => c.title)),
];

// ---------- Стандарт качества (дословно из ТЗ v1.2.1, подаётся в промпт) ----------

const QUALITY_CORE = [
  "заголовок ≤ 60 знаков, конкретный («Касса сходится, деньги исчезают»);",
  "контекст в 2–3 предложения с конкретными цифрами;",
  "данные: list или маленькая таблица на 3–5 строк; таблицы — только сырые данные, БЕЗ вычисляемых итоговых строк (арифметику не доверяем);",
  "ровно один чёткий вопрос; у ответа обязана быть очевидная линия рассуждения;",
  "объём 80–150 слов суммарно; решение — один шаг: выбор варианта, одно действие арифметики, поиск ошибки в данных;",
  "ситуация понятна без профильных знаний;",
  "ЗАПРЕЩЕНО: стены текста, многоходовые расчёты, двусмысленные вопросы.",
].join("\n");

const QUALITY_CLASSIC = [
  "150–300 слов; конкретная ситуация с цифрами, ограничениями и конфликтом интересов;",
  "финал — строго «Что вы сделаете и почему?»;",
  "рубрика из 4–5 критериев с весами (сумма строго 100) и содержательными описаниями;",
  "difficulty 2–3;",
  "ЗАПРЕЩЕНО: стены текста, многоходовые расчёты, двусмысленные вопросы.",
].join("\n");

const SPHERE_TITLE: Record<string, string> = { business: "Бизнес", product: "Продукт и IT", law: "Право" };

// ---------- Этап 1: темы ----------

console.log(`Генерация: kind=${KIND}, sphere=${SPHERE} (${SPHERE_TITLE[SPHERE!]}), count=${COUNT}\n`);

const topicsPrompt = [
  `Сфера: ${SPHERE_TITLE[SPHERE!]}. Тип кейса: ${KIND === "core" ? "лёгкий одношаговый (educational mini-case)" : "сложный анализ ситуации (150-300 слов)"}.`,
  `Предложи ${COUNT * 2} РАЗЛИЧНЫХ тем для бизнес-кейсов на русском. Одна тема — одна конкретная ситуация (не абстрактная область).`,
  "Верни СТРОГО валидный JSON без markdown: {\"topics\":[\"тема 1\",\"тема 2\",...]}",
  "Уже занятые ситуации (НЕ повторяй их и близкие):",
  ...registrySameKind.map((t) => `- ${t}`),
].join("\n");

const TopicsSchema = z.object({ topics: z.array(z.string().min(5)).min(1) });

function extractJson(content: string): unknown | null {
  const t = content.trim();
  try {
    return JSON.parse(t);
  } catch {
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      try {
        return JSON.parse(fence[1].trim());
      } catch { /* дальше */ }
    }
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

let candidateTopics: string[] = [];
for (let attempt = 1; attempt <= 2 && candidateTopics.length < COUNT; attempt++) {
  const res = await zai.chat.completions.create({
    messages: [
      { role: "system", content: "Ты — генератор тем обучающих бизнес-кейсов. Только JSON." },
      { role: "user", content: topicsPrompt },
    ],
    temperature: 0.8,
    thinking: { type: "disabled" },
  });
  const parsed = TopicsSchema.safeParse(extractJson(String(res?.choices?.[0]?.message?.content ?? "")));
  if (parsed.success) candidateTopics = parsed.data.topics;
}

// фильтр: пересечения с реестром (kind+sphere) и близкие темы
const fresh: string[] = [];
for (const t of candidateTopics) {
  if (fresh.length >= COUNT) break;
  const words = significantWords(t);
  const dupWithRegistry = registrySameKind.some((r) => topicOverlap(words, significantWords(r)) > 0.6);
  const dupWithFresh = fresh.some((f) => topicOverlap(words, significantWords(f)) > 0.6);
  const dupWithTitle = allTitles.some((r) => topicOverlap(words, significantWords(r)) > 0.6);
  if (!dupWithRegistry && !dupWithFresh && !dupWithTitle) fresh.push(t);
}
if (fresh.length === 0) {
  console.error("✗ Все предложенные темы пересекаются с реестром. Попробуйте другую сферу или позже.");
  process.exit(1);
}
console.log(`Этап 1: ${fresh.length} свежих тем (из ${candidateTopics.length} предложенных):`);
fresh.forEach((t) => console.log(`  • ${t}`));

// ---------- Этап 2: кейс на тему ----------

const CORE_JSON = `{"slug":"kebab-case-slug","domainSlug":"${SPHERE}","title":"заголовок ≤ 60 знаков","blocks":[{"type":"paragraph","text":"контекст 2-3 предложения с цифрами"},{"type":"list","items":["факт 1","факт 2","факт 3"],"tone":"neutral"} или {"type":"table","caption":"данные","headers":["A","B"],"rows":[["1","2"],["3","4"]]} — ровно один блок данных,{"type":"question","text":"ровно один вопрос"}],"missedFactors":["что слабый ответ упустит 1","...","минимум 3"],"hint":"наводка на линию мышления в 1-2 предложениях, НИКОГДА не готовый ответ"}`;

const CLASSIC_JSON = `{"title":"заголовок","body":"150-300 слов обычным текстом, финал строго «Что вы сделаете и почему?»","difficulty":2,"timeLimitSec":240,"criteria":[{"name":"критерий","description":"содержательное описание 1 предложение","weight":25},... 4-5 критериев, сумма весов строго 100],"hint":"наводка в 1-2 предложениях, не готовый ответ"}`;

function casePrompt(topic: string): string {
  return [
    `Тема кейса: «${topic}». Сфера: ${SPHERE_TITLE[SPHERE!]}.`,
    KIND === "core"
      ? `Тип: лёгкий одношаговый кейс. Стандарт качества:\n${QUALITY_CORE}\n\nВерни СТРОГО валидный JSON без markdown по схеме:\n${CORE_JSON}`
      : `Тип: сложный кейс с конфликтом интересов. Стандарт качества:\n${QUALITY_CLASSIC}\n\nВерни СТРОГО валидный JSON без markdown по схеме:\n${CLASSIC_JSON}`,
    "Всё на русском языке.",
  ].join("\n\n");
}

mkdirSync("data/case-drafts", { recursive: true });
mkdirSync("data/case-drafts/rejected", { recursive: true });

const manifest: { generatedAt: string; kind: string; sphere: string; drafts: Array<{ topic: string; file: string; status: string; reason?: string }> } = {
  generatedAt: new Date().toISOString(),
  kind: KIND!,
  sphere: SPHERE!,
  drafts: [],
};

let llmCalls = 1; // этап тем
for (const topic of fresh) {
  const schema = KIND === "core" ? CoreDraftSchema : ClassicDraftSchema;
  let draft: unknown | null = null;
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    llmCalls++;
    const res = await zai.chat.completions.create({
      messages: [
        { role: "system", content: "Ты — автор обучающих бизнес-кейсов. Верни СТРОГО валидный JSON без markdown-обёртки." },
        { role: "user", content: casePrompt(topic) },
      ],
      temperature: 0.7,
      thinking: { type: "disabled" },
    });
    const parsed = schema.safeParse(extractJson(String(res?.choices?.[0]?.message?.content ?? "")));
    if (parsed.success) {
      draft = parsed.data;
      break;
    }
    lastError = parsed.error.issues[0]?.message ?? "schema";
  }
  if (!draft) {
    manifest.drafts.push({ topic, file: "-", status: "failed", reason: `zod: ${lastError}` });
    console.log(`  ✗ «${topic}» — не прошёл схему (${lastError})`);
    continue;
  }
  const d = draft as { title?: string; slug?: string };
  const slug = (d.slug ?? slugify(d.title ?? topic)).replace(/[^a-z0-9-]/g, "");
  const file = `${KIND}-${SPHERE}-${slug || Date.now().toString(36)}.json`;
  writeFileSync(join("data/case-drafts", file), JSON.stringify(draft, null, 2) + "\n");
  manifest.drafts.push({ topic, file, status: "draft" });
  console.log(`  ✓ «${(d.title ?? topic).slice(0, 50)}» → data/case-drafts/${file}`);
}

// per-case budget check: 2 вызова на кейс максимум + 1-2 на темы => ≤3 на кейс гарантировано
writeFileSync(
  join("data/case-drafts", "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n"
);
console.log(`\nИтого: ${manifest.drafts.filter((d) => d.status === "draft").length} черновиков, LLM-вызовов: ${llmCalls} (лимит ≤3×N=${3 * COUNT}).`);
console.log("ГЛАВНОЕ ПРАВИЛО: это ЧЕРНОВИКИ — отревьюте каждый (точность цифр, арифметика таблиц, один вопрос) перед импортом.");
console.log("Хорошие: npm run cases:import -- --file=data/case-drafts/<файл>.json");
console.log("Плохие:   mv data/case-drafts/<файл>.json data/case-drafts/rejected/");

if (existsSync("data/case-drafts/manifest.json") && manifest.drafts.length === 0) process.exit(1);
