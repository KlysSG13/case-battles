/**
 * Генерирует prisma/schema.postgres.prisma из основной схемы, заменяя
 * provider = "sqlite" на "postgresql". Источник истины — prisma/schema.prisma.
 * Запуск: npm run pg:schema (входит в pg:migrate / pg:prepare).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(root, "prisma", "schema.prisma");
const targetPath = join(root, "prisma", "schema.postgres.prisma");

const source = readFileSync(sourcePath, "utf8");
if (!/provider\s*=\s*"sqlite"/.test(source)) {
  console.error('В prisma/schema.prisma не найден provider = "sqlite" — проверьте схему.');
  process.exit(1);
}

const header = `// АВТОГЕНЕРИРОВАНО из schema.prisma (npm run pg:schema) — не редактировать вручную.
// Провайдер переключён на PostgreSQL; изменения вносите в prisma/schema.prisma.

`;

const generated = header + source.replace(
  /provider\s*=\s*"sqlite"/,
  'provider = "postgresql"'
);

writeFileSync(targetPath, generated, "utf8");
console.log("✓ prisma/schema.postgres.prisma обновлён (provider = postgresql)");
