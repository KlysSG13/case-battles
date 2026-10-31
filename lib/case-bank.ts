import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { TaskBlock } from "./task-blocks";

// ===== Данные банков кейсов живут в data/*.json (v1.2.2) =====
// Импортёр пишет туда; до прода контент доезжает обычным деплоем.
// Загрузка — zod-парсинг при первом обращении (кешируется в модуль-синглтон).

const dataDir = join(process.cwd(), "data");

// ---------- zod-схемы банков ----------

export const CoreCaseSchema = z.object({
  slug: z.string().min(3),
  domainSlug: z.string().min(3),
  title: z.string().min(5),
  blocks: z.array(z.record(z.string(), z.unknown())).min(2),
  missedFactors: z.array(z.string().min(3)),
  hint: z.string().min(10),
});

export const ClassicCriterionSchema = z.object({
  name: z.string().min(3),
  description: z.string().min(10),
  weight: z.number().int().min(1).max(100),
});

export const ClassicCaseSchema = z.object({
  title: z.string().min(5),
  body: z.string().min(200),
  difficulty: z.number().int().min(1).max(3),
  timeLimitSec: z.number().int().min(60).max(1800),
  criteria: z.array(ClassicCriterionSchema).min(4).max(5),
});

const ClassicDomainSchema = z.object({
  slug: z.string(),
  title: z.string(),
  emoji: z.string(),
  sort: z.number(),
  cases: z.array(ClassicCaseSchema),
});

const CoreBankSchema = z.array(CoreCaseSchema);
const ClassicBankSchema = z.array(ClassicDomainSchema);

// ---------- Типы (совместимы с прежними интерфейсами lib/content) ----------

export interface CoreCase {
  slug: string;
  domainSlug: string;
  title: string;
  blocks: TaskBlock[];
  missedFactors: string[];
  hint: string;
}

export interface ClassicCriterion {
  name: string;
  description: string;
  weight: number;
}

export interface ClassicCase {
  title: string;
  body: string;
  difficulty: number;
  timeLimitSec?: number;
  criteria: ClassicCriterion[];
}

export interface ClassicDomain {
  slug: string;
  title: string;
  emoji: string;
  sort: number;
  cases: ClassicCase[];
}

// ---------- Загрузка с ленивым кешем ----------

let coreCache: CoreCase[] | null = null;
let classicCache: ClassicDomain[] | null = null;

function readJson(rel: string): unknown {
  return JSON.parse(readFileSync(join(dataDir, rel), "utf8"));
}

export function loadCoreBank(): CoreCase[] {
  if (!coreCache) {
    const parsed = CoreBankSchema.safeParse(readJson("core-cases.json"));
    if (!parsed.success) {
      throw new Error(`data/core-cases.json не прошёл zod-валидацию: ${parsed.error.issues[0]?.message}`);
    }
    coreCache = parsed.data as CoreCase[];
  }
  return coreCache;
}

export function loadClassicBank(): ClassicDomain[] {
  if (!classicCache) {
    const parsed = ClassicBankSchema.safeParse(readJson("classic-cases.json"));
    if (!parsed.success) {
      throw new Error(`data/classic-cases.json не прошёл zod-валидацию: ${parsed.error.issues[0]?.message}`);
    }
    classicCache = parsed.data as ClassicDomain[];
  }
  return classicCache;
}

/** Сброс кеша (для импортёра после аппенда). */
export function resetBankCache(): void {
  coreCache = null;
  classicCache = null;
}

// ---------- Совместимые экспорты (замена прежних конфигов) ----------
// Снимки на момент обращения к модулю; для свежих данных после импорта — resetBankCache + reload.

export function getCoreCases(): CoreCase[] {
  return [...loadCoreBank()];
}

export const CORE_CASES: CoreCase[] = getCoreCases();

export const businessDomain: ClassicDomain = loadClassicBank().find((d) => d.slug === "business")!;
export const productDomain: ClassicDomain = loadClassicBank().find((d) => d.slug === "product")!;
export const lawDomain: ClassicDomain = loadClassicBank().find((d) => d.slug === "law")!;

export function coreCasesForDomain(domainSlug: string): CoreCase[] {
  return loadCoreBank().filter((c) => c.domainSlug === domainSlug);
}

export function coreCaseBySlug(slug: string): CoreCase | undefined {
  return loadCoreBank().find((c) => c.slug === slug);
}
