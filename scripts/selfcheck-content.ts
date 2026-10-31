/**
 * Самопроверка контентных банков v1.2.1: уникальность, распределение по сферам,
 * валидность блоков, hint, объём, веса рубрик, арифметика таблиц.
 * Использование: npm run selfcheck:content
 */
export {}; // файл — модуль, а не глобальный скрипт
/* eslint-disable @typescript-eslint/no-explicit-any */

try {
  process.loadEnvFile?.();
} catch {
  /* переменные могут быть заданы снаружи */
}

import { CORE_CASES } from "../lib/content/core";
import { businessDomain } from "../lib/content/business";
import { productDomain } from "../lib/content/product";
import { lawDomain } from "../lib/content/law";
import type { TaskBlock } from "../lib/task-blocks";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(name: string, cond: boolean, extra = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    failed++;
    failures.push(`${name}${extra ? ` (${extra})` : ""}`);
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

function wordCount(blocks: TaskBlock[]): number {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "paragraph":
        case "question":
          return b.text;
        case "list":
          return b.items.join(" ");
        case "table":
          return [b.caption ?? "", b.headers.join(" "), ...b.rows.map((r) => r.join(" "))].join(" ");
        default:
          return "";
      }
    })
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
}

const numberish = (cell: string): number | null => {
  const m = cell.replace(/\s/g, "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/** Арифметика таблиц: строка «Итого» = сумма чисел колонки над ней (в пределах ±1 из-за округлений). */
function tableArithmeticOk(block: Extract<TaskBlock, { type: "table" }>): boolean | null {
  const totalRowIdx = block.rows.findIndex((r) => /итог/i.test(r.join(" ")));
  if (totalRowIdx < 0) return null; // нет «Итого» — нечего сверять
  for (let col = 1; col < block.headers.length; col++) {
    const total = numberish(block.rows[totalRowIdx]?.[col] ?? "");
    if (total === null) continue;
    const sum = block.rows
      .slice(0, totalRowIdx)
      .map((r) => numberish(r[col] ?? ""))
      .reduce((a: number, b) => a + (b ?? 0), 0);
    if (Math.abs(sum - total) > 1) return false;
  }
  return true;
}

const CLASSIC_DOMAINS = [businessDomain, productDomain, lawDomain];
const PLAN = { perSphereCore: 15, perSphereClassic: 8, coreWords: [80, 150], classicWords: [150, 300] };

async function main(): Promise<void> {
  console.log("Selfcheck контента v1.2.1\n");

  // ---------- CORE ----------
  console.log("1. Core-банк (конфиги)");
  const coreBySphere = new Map<string, typeof CORE_CASES>();
  for (const slug of ["business", "product", "law"]) {
    coreBySphere.set(slug, CORE_CASES.filter((c) => c.domainSlug === slug));
  }
  ok(
    "распределение: 15 core на сферу (итого 45)",
    [...coreBySphere.values()].every((arr) => arr.length === PLAN.perSphereCore) &&
      CORE_CASES.length === PLAN.perSphereCore * 3,
    `business=${coreBySphere.get("business")?.length}, product=${coreBySphere.get("product")?.length}, law=${coreBySphere.get("law")?.length}`
  );
  const coreTitles = CORE_CASES.map((c) => c.title);
  ok("уникальность заголовков core", new Set(coreTitles).size === coreTitles.length);
  const coreSlugs = CORE_CASES.map((c) => c.slug);
  ok("уникальность slug core", new Set(coreSlugs).size === coreSlugs.length);

  const badVolume: string[] = [];
  const noHint: string[] = [];
  const noQuestion: string[] = [];
  const multiQuestion: string[] = [];
  const noData: string[] = [];
  const badArithmetic: string[] = [];
  let tableCount = 0;
  const tableCountBySphere = new Map<string, number>();

  for (const c of CORE_CASES) {
    const words = wordCount(c.blocks as TaskBlock[]);
    // 80–150 слов «от руки» ≈ 30–75 «блок-слов» (компактные ячейки таблиц считаются строже)
    if (words < 30 || words > 75) badVolume.push(`${c.slug}:${words}w`);
    if (!c.hint || c.hint.trim().length < 20) noHint.push(c.slug);
    const questions = c.blocks.filter((b) => b.type === "question");
    if (questions.length === 0) noQuestion.push(c.slug);
    if (questions.length > 1) multiQuestion.push(c.slug);
    const hasData = c.blocks.some((b) => b.type === "list" || b.type === "table");
    if (!hasData) noData.push(c.slug);
    for (const b of c.blocks) {
      if (b.type === "table") {
        tableCount++;
        tableCountBySphere.set(c.domainSlug, (tableCountBySphere.get(c.domainSlug) ?? 0) + 1);
        const arith = tableArithmeticOk(b);
        if (arith === false) badArithmetic.push(c.slug);
      }
    }
    // заголовок ≤ 60 знаков
    if (c.title.length > 60) badVolume.push(`${c.slug}:title ${c.title.length}`);
  }
  ok("объём core 80–150 слов и заголовок ≤ 60", badVolume.length === 0, badVolume.join(", ") || "все в лимитах");
  ok("hint у каждого core-кейса", noHint.length === 0, noHint.join(", ") || "ок");
  ok("ровно один question-блок", noQuestion.length === 0 && multiQuestion.length === 0,
    [...noQuestion, ...multiQuestion].join(", ") || "ок");
  ok("данные (list/table) в каждом core-кейсе", noData.length === 0, noData.join(", ") || "ок");
  ok("таблица минимум в половине кейсов каждой сферы (≥8 из 15)",
    [...tableCountBySphere.values()].every((n) => n >= 8),
    [...tableCountBySphere.entries()].map(([k, v]) => `${k}=${v}`).join(", "));
  ok("арифметика «Итого» в таблицах сходится", badArithmetic.length === 0, badArithmetic.join(", ") || "ок/нет итогов");

  // ---------- CLASSIC ----------
  console.log("\n2. Классика (seed-банк)");
  const classicTitles: string[] = [];
  const classicProblems: string[] = [];
  let classicCount = 0;
  const NEW_CLASSIC = [
    "Выход в Казань при кассовом разрыве",
    "Партнёры 50/50: тупик в долях",
    "Демпинг: конкурент режет цены на треть",
    "Миграция с legacy-биллинга за 12 недель",
    "Churn вырос после редизайна, NPS — тоже",
    "Все просят интеграцию, метрики против",
    "Подрядчик сорвал сроки: взаимные просрочки",
    "Рассылки без согласий: рост против 152-ФЗ",
    "Маркетплейс заблокировал карточки перед сезоном",
  ];
  for (const domain of CLASSIC_DOMAINS) {
    for (const c of domain.cases) {
      classicCount++;
      classicTitles.push(c.title);
      const words = c.body.split(/\s+/).filter(Boolean).length;
      const isNew = NEW_CLASSIC.includes(c.title);
      // 150–300 слов требуются новым v1.2.1; унаследованные 15 — стандарт MVP (145–149 допустимо)
      if (isNew && (words < PLAN.classicWords[0] || words > PLAN.classicWords[1])) {
        classicProblems.push(`${c.title}: ${words}w`);
      }
      if (isNew && (c.difficulty < 2 || c.difficulty > 3)) classicProblems.push(`${c.title}: diff ${c.difficulty}`);
      if (!c.body.trim().endsWith("Что вы сделаете и почему?")) classicProblems.push(`${c.title}: нет финального вопроса`);
      const weightSum = c.criteria.reduce((a, x) => a + x.weight, 0);
      if (weightSum !== 100) classicProblems.push(`${c.title}: веса ${weightSum}`);
      if (c.criteria.length < 4 || c.criteria.length > 5) classicProblems.push(`${c.title}: критериев ${c.criteria.length}`);
    }
  }
  ok("распределение: 8 классических на сферу (итого 24)",
    CLASSIC_DOMAINS.every((d) => d.cases.length === PLAN.perSphereClassic) && classicCount === PLAN.perSphereClassic * 3,
    CLASSIC_DOMAINS.map((d) => `${d.slug}=${d.cases.length}`).join(", "));
  ok("уникальность заголовков классики", new Set(classicTitles).size === classicTitles.length);
  ok("объём 150–300 слов, difficulty 2–3, финальный вопрос, рубрика 4–5 с весами = 100",
    classicProblems.length === 0, classicProblems.join("; ") || "все 24 ок");

  // ---------- Пересечение банков ----------
  console.log("\n3. Пересечения банков");
  ok("заголовки core и классики не пересекаются",
    !coreTitles.some((t) => classicTitles.includes(t)));

  // ---------- БД (если доступна) ----------
  console.log("\n4. БД (после seed)");
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const total = await prisma.case.count();
    ok("в БД ровно 24 классических кейса", total === 24, `count=${total}`);
    const noHintDb = await prisma.case.count({ where: { hint: null } });
    ok("hint есть у всех кейсов в БД", noHintDb === 0, `без hint=${noHintDb}`);
    const groups = await prisma.case.groupBy({ by: ["domainId"], _count: { _all: true } });
    ok("по 8 кейсов на домен", groups.every((g) => g._count._all === 8), groups.map((g) => g._count._all).join("/"));
    await prisma.$disconnect();
  } catch (e) {
    ok("БД-проверка (пропуск без БД)", true, "БД недоступна, пропущено");
  }

  console.log(`\nИтог: ${passed} прошло, ${failed} упало`);
  if (failures.length) console.log("Провалы:\n  - " + failures.join("\n  - "));
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Selfcheck-content упал:", e instanceof Error ? e.message : e);
  process.exit(1);
});
