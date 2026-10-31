/**
 * Импортёр черновиков кейсов — npm run cases:import
 *   npm run cases:import -- --file=data/case-drafts/<файл>.json [--force]
 * Человек уже отревьюил черновик; импортёр валидирует (zod + бизнес-правила),
 * проверяет уникальность против банков, атомарно аппендит в data/*.json,
 * дополняет реестр тем и запускает selfcheck:content (core) / db:seed (classic).
 * ГЛАВНОЕ: никаких путей в прод — контент доезжает обычным деплоем.
 */
export {}; // файл — модуль, а не глобальный скрипт

try {
  process.loadEnvFile?.();
} catch {
  /* переменные могут быть заданы снаружи */
}

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import {
  CoreDraftSchema,
  ClassicDraftSchema,
  validateCoreDraft,
  validateClassicDraft,
  isDuplicateTitle,
  atomicAppendToArray,
  atomicWriteJson,
  slugify,
} from "./cases-shared";
import { loadCoreBank, loadClassicBank, resetBankCache } from "../lib/case-bank";

async function main(): Promise<void> {
const fileArg = process.argv.find((a) => a.startsWith("--file="))?.slice("--file=".length) ?? process.argv[process.argv.indexOf("--file") + 1];
const force = process.argv.includes("--force");

if (!fileArg || !existsSync(fileArg)) {
  console.log("Использование: npm run cases:import -- --file=data/case-drafts/<файл>.json [--force]");
  process.exit(1);
}

// ---------- 1. zod-валидация ----------

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(fileArg, "utf8"));
} catch {
  console.error(`✗ ${fileArg} не парсится как JSON`);
  process.exit(1);
}

const coreParsed = CoreDraftSchema.safeParse(raw);
const classicParsed = ClassicDraftSchema.safeParse(raw);
if (!coreParsed.success && !classicParsed.success) {
  console.error("✗ Черновик не прошёл zod-схему ни core, ни classic:");
  const issues = (coreParsed.success ? classicParsed : coreParsed).error.issues.slice(0, 5);
  for (const i of issues) console.error(`   ${i.path.join(".")}: ${i.message}`);
  process.exit(1);
}
const isCore = coreParsed.success;
const coreDraft = coreParsed.success ? coreParsed.data : null;
const classicDraft = classicParsed.success ? classicParsed.data : null;

// ---------- 2. Бизнес-правила ----------

const businessErrors = isCore
  ? validateCoreDraft(coreDraft!)
  : validateClassicDraft(classicDraft!);
if (businessErrors.length) {
  console.error("✗ Бизнес-правила:");
  for (const e of businessErrors) console.error(`   — ${e}`);
  process.exit(1);
}

// ---------- 3. Уникальность против банков ----------

const coreBank = loadCoreBank();
const classicBank = loadClassicBank();
const allClassicTitles = classicBank.flatMap((d) => d.cases.map((c) => c.title));
const candidateTitle = isCore ? coreDraft!.title : classicDraft!.title;

const dup = isDuplicateTitle(candidateTitle, isCore ? coreBank.map((c) => c.title) : allClassicTitles);
if (dup && !force) {
  console.error(`✗ Заголовок конфликтует с существующим кейсом «${dup}» (пересечение значимых слов > 60%).`);
  console.error("   Если это осознанно другой кейс — добавьте --force.");
  process.exit(1);
}
if (dup && force) {
  console.log(`⚠️  Совпадение с «${dup}» проигнорировано (--force)`);
}

// slug-уникальность для core
if (isCore && coreBank.some((c) => c.slug === coreDraft!.slug)) {
  const alt = `${coreParsed.data.slug}-${Date.now().toString(36).slice(-4)}`;
  console.log(`⚠️  slug «${coreParsed.data.slug}» занят → «${alt}»`);
  (coreDraft as { slug: string }).slug = alt;
}

// ---------- 4. Атомарный аппенд ----------

if (isCore) {
  const res = atomicAppendToArray("data/core-cases.json", coreDraft!);
  if (!res.ok) {
    console.error(`✗ Аппенд core не удался: ${res.error}`);
    process.exit(1);
  }
  console.log(`✓ Импортирован core-кейс «${candidateTitle}» → data/core-cases.json`);
} else {
  // классика: вложить в домен сферы... домен берём из manifest? Нет: в черновике нет domainSlug.
  // Классический черновик содержит только title/body/criteria; сферу задаём аргументом --sphere.
  const sphereArg = process.argv.find((a) => a.startsWith("--sphere="))?.slice("--sphere=".length) ?? process.argv[process.argv.indexOf("--sphere") + 1];
  if (!["business", "product", "law"].includes(sphereArg ?? "")) {
    console.error("✗ Для классики укажите --sphere=business|product|law");
    process.exit(1);
  }
  const bank = JSON.parse(readFileSync("data/classic-cases.json", "utf8")) as Array<{
    slug: string;
    cases: unknown[];
  }>;
  const domain = bank.find((d) => d.slug === sphereArg);
  if (!domain) {
    console.error(`✗ Домен ${sphereArg} не найден в data/classic-cases.json`);
    process.exit(1);
  }
  domain.cases.push(classicDraft!);
  const tmp = "data/classic-cases.json.tmp";
  writeFileSync(tmp, JSON.stringify(bank, null, 2) + "\n");
  renameSync(tmp, "data/classic-cases.json");
  console.log(`✓ Импортирован классический кейс «${candidateTitle}» → ${sphereArg}`);
}

// ---------- 5. Реестр тем ----------

const topics = JSON.parse(readFileSync("data/case-topics.json", "utf8")) as Array<{
  kind: string;
  sphere: string;
  topic: string;
}>;
const sphere = isCore
  ? coreDraft!.domainSlug
  : (process.argv.find((a) => a.startsWith("--sphere="))?.slice("--sphere=".length) ?? process.argv[process.argv.indexOf("--sphere") + 1]);
topics.push({ kind: isCore ? "core" : "classic", sphere, topic: candidateTitle });
if (!atomicWriteJson("data/case-topics.json", topics)) {
  console.error("✗ Не удалось обновить реестр тем (проверьте data/case-topics.json вручную)");
  process.exit(1);
}
console.log("✓ Реестр тем дополнен");

// ---------- 6. Кеш сбросить и прогнать проверки ----------

resetBankCache();

console.log("\n— selfcheck:content —");
try {
  execSync("npm run selfcheck:content", { stdio: "inherit" });
} catch {
  console.error("✗ selfcheck:content упал — проверьте контент вручную");
  process.exit(1);
}

if (!isCore) {
  console.log("\n— db:seed (аддитивная вставка локально) —");
  try {
    execSync("npm run db:seed", { stdio: "inherit" });
  } catch {
    console.error("✗ db:seed упал");
    process.exit(1);
  }
  console.log("ℹ️  На прод классика доедет с ближайшим pg:prepare (после мержа и деплоя).");
}

// ---------- 7. Счётчики ----------

resetBankCache();
const coreCount = loadCoreBank().length;
const classicCounts = loadClassicBank().map((d) => `${d.slug}:${d.cases.length}`).join(" ");
console.log(`\nСчётчики: core=${coreCount} | classic: ${classicCounts}`);
console.log("Следующий шаг: закоммитьте data/*.json и задеплойте по DEPLOY.md.");
}

main().catch((e) => {
  console.error("Ошибка импорта:", e instanceof Error ? e.message : e);
  process.exit(1);
});
