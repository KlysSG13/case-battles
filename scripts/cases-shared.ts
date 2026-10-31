import { z } from "zod";

// Общие схемы/утилиты для генератора и импортёра черновиков кейсов.

// ---------- zod-схемы черновиков ----------

const BlockSchema = z.object({
  type: z.enum(["paragraph", "list", "table", "code", "question"]),
  text: z.string().optional(),
  items: z.array(z.string()).optional(),
  ordered: z.boolean().optional(),
  tone: z.enum(["neutral", "danger", "accent"]).optional(),
  caption: z.string().optional(),
  headers: z.array(z.string()).optional(),
  rows: z.array(z.array(z.string())).optional(),
});

export const CoreDraftSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug: kebab-case"),
  domainSlug: z.enum(["business", "product", "law"]),
  title: z.string().min(5).max(60),
  blocks: z.array(BlockSchema).min(2),
  missedFactors: z.array(z.string().min(3)).min(3),
  hint: z.string().min(10),
});

export const ClassicDraftSchema = z.object({
  title: z.string().min(5),
  body: z.string().min(200),
  difficulty: z.number().int().min(2).max(3),
  timeLimitSec: z.number().int().min(60).max(1800).optional(),
  criteria: z
    .array(
      z.object({
        name: z.string().min(3),
        description: z.string().min(10),
        weight: z.number().int().min(1).max(100),
      })
    )
    .min(4)
    .max(5),
  hint: z.string().min(10),
});

export type CoreDraft = z.infer<typeof CoreDraftSchema>;
export type ClassicDraft = z.infer<typeof ClassicDraftSchema>;

/** Бизнес-проверки сверх zod (используются и импортёром, и vitest). */
export function validateCoreDraft(draft: CoreDraft): string[] {
  const errors: string[] = [];
  const questions = draft.blocks.filter((b) => b.type === "question");
  if (questions.length !== 1) errors.push(`question-блоков ${questions.length}, должен быть ровно 1`);
  if (!draft.blocks.some((b) => b.type === "list" || b.type === "table")) {
    errors.push("нет блока данных (list/table)");
  }
  for (const b of draft.blocks) {
    if (b.type === "table") {
      const hasTotal = (b.rows ?? []).some((r) => /итог/i.test(r.join(" ")));
      if (hasTotal) errors.push("таблица содержит вычисляемую итоговую строку (запрещено: арифметику ИИ не доверяем)");
      if (!b.headers?.length) errors.push("таблица без headers");
      if ((b.rows ?? []).length < 1) errors.push("таблица без строк");
    }
  }
  return errors;
}

export function validateClassicDraft(draft: ClassicDraft): string[] {
  const errors: string[] = [];
  const weightSum = draft.criteria.reduce((a, c) => a + c.weight, 0);
  if (weightSum !== 100) errors.push(`сумма весов ${weightSum}, должна быть 100`);
  if (!draft.body.trim().endsWith("Что вы сделаете и почему?")) {
    errors.push("body не заканчивается «Что вы сделаете и почему?»");
  }
  const words = draft.body.split(/\s+/).filter(Boolean).length;
  if (words < 150 || words > 300) errors.push(`объём body ${words} слов (лимит 150–300)`);
  return errors;
}

// ---------- Детектор дублей ----------

const STOP_WORDS = new Set([
  "и", "в", "на", "с", "по", "для", "как", "что", "это", "или", "но", "за", "из", "у", "о",
  "the", "a", "of", "не", "да", "нет", "меня", "мне", "них", "том", "все", "всё",
]);

/** Значимые слова темы (lowercase, без стоп-слов и короче 3 символов). */
export function significantWords(topic: string): string[] {
  return topic
    .toLowerCase()
    .replace(/[«»"()]/g, " ")
    .split(/[^a-zа-яё0-9-]+/i)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/** Доля пересечения значимых слов a∩b / min(|a|,|b|), 0..1. */
export function topicOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / Math.min(sa.size, sb.size);
}

/** Совпадение >0.6 значимых слов заголовков → дубль. */
export function isDuplicateTitle(candidate: string, existing: string[]): string | null {
  const cand = significantWords(candidate);
  for (const ex of existing) {
    if (ex.toLowerCase() === candidate.toLowerCase()) return ex;
    if (topicOverlap(cand, significantWords(ex)) > 0.6) return ex;
  }
  return null;
}

export function slugify(text: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return text
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ---------- Атомарный аппенд в JSON-файл ----------

import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

/** Читает JSON-файл; при бите возвращает null (не бросает). */
export function readJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Атомарный аппенд: читает массив, пушит элемент, пишет во временный файл
 * и переименовывает. Битый вход/файл → null, оригинал не трогается.
 */
export function atomicAppendToArray<T>(path: string, item: T): { ok: boolean; error?: string } {
  const current = readJsonFile<T[]>(path);
  if (!Array.isArray(current)) {
    return { ok: false, error: `${path} не является JSON-массивом (файл не тронут)` };
  }
  const next = [...current, item];
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n");
    renameSync(tmp, path); // rename атомарен в пределах ФС
    return { ok: true };
  } catch (e) {
    try {
      if (existsSync(tmp)) renameSync(tmp, `${path}.tmp-broken`);
    } catch { /* best effort */ }
    return { ok: false, error: e instanceof Error ? e.message : "запись не удалась" };
  }
}

/** Атомарная запись целого JSON (для реестра тем). */
export function atomicWriteJson(path: string, data: unknown): boolean {
  const tmp = `${path}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
    renameSync(tmp, path);
    return true;
  } catch {
    return false;
  }
}
