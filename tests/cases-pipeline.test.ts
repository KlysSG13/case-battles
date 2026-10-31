import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  CoreDraftSchema,
  ClassicDraftSchema,
  validateCoreDraft,
  validateClassicDraft,
  significantWords,
  topicOverlap,
  isDuplicateTitle,
  atomicAppendToArray,
} from "../scripts/cases-shared";

// Фикстуры коммитятся в tests/fixtures/ — 1 валидный + 2 битых черновика.

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, "fixtures", name), "utf8"));

describe("zod-схемы черновиков", () => {
  it("валидный core-черновик проходит", () => {
    const parsed = CoreDraftSchema.safeParse(fixture("draft-valid-core.json"));
    expect(parsed.success).toBe(true);
  });

  it("битый classic (веса ≠ 100) ловится бизнес-правилом", () => {
    const parsed = ClassicDraftSchema.safeParse(fixture("draft-broken-weights.json"));
    expect(parsed.success).toBe(true); // zod-структура ок
    const errors = validateClassicDraft(parsed.data!);
    expect(errors.some((e) => e.includes("весов"))).toBe(true);
    expect(errors.some((e) => e.includes("слов"))).toBe(true); // и объём вне лимита
  });

  it("core с итоговой строкой таблицы отклоняется", () => {
    const parsed = CoreDraftSchema.safeParse(fixture("draft-broken-total-row.json"));
    expect(parsed.success).toBe(true);
    const errors = validateCoreDraft(parsed.data!);
    expect(errors.some((e) => e.includes("итоговую строку"))).toBe(true);
  });

  it("core без hint не проходит zod", () => {
    const noHint = fixture("draft-valid-core.json") as Record<string, unknown>;
    delete noHint.hint;
    expect(CoreDraftSchema.safeParse(noHint).success).toBe(false);
  });

  it("classic без 4-го критерия отклоняется", () => {
    const draft = fixture("draft-broken-weights.json") as { criteria: unknown[] };
    const three = { ...draft, criteria: draft.criteria.slice(0, 3) };
    expect(ClassicDraftSchema.safeParse(three).success).toBe(false);
  });
});

describe("детектор дублей и пересечений тем", () => {
  it("значимые слова: стоп-слова и мусор отфильтрованы", () => {
    const words = significantWords("Касса и в на счета: что делать с разрывом?");
    expect(words).toContain("касса");
    expect(words).toContain("разрывом");
    expect(words).not.toContain("и");
    expect(words).not.toContain("что");
  });

  it("пересечение близких тем > 0.6", () => {
    const a = significantWords("Кассовый разрыв перед зарплатой");
    const b = significantWords("Кассовый разрыв в пятницу");
    expect(topicOverlap(a, b)).toBeGreaterThan(0.6);
  });

  it("разные темы дают низкое пересечение", () => {
    const a = significantWords("Кассовый разрыв перед зарплатой");
    const b = significantWords("Приоритизация фич в спринте");
    expect(topicOverlap(a, b)).toBeLessThan(0.2);
  });

  it("isDuplicateTitle находит конфликт по значимым словам", () => {
    const existing = ["Кофейня у метро: расти или закрепиться", "Демпинг: конкурент режет цены"];
    expect(isDuplicateTitle("Кофейня у метро — расти или остаться", existing)).toBeTruthy();
    expect(isDuplicateTitle("Увольнение за прогул в отпуске", existing)).toBeNull();
  });

  it("точное совпадение заголовка без учёта регистра — дубль", () => {
    expect(isDuplicateTitle("ДЕМПИНГ: конкурент режет цены", ["Демпинг: конкурент режет цены"])).toBeTruthy();
  });
});

describe("атомарный аппенд", () => {
  it("мусор на входе не ломает файл", () => {
    const dir = mkdtempSync(join(tmpdir(), "cases-test-"));
    const file = join(dir, "bank.json");
    writeFileSync(file, JSON.stringify([{ id: 1 }]));
    // «битый вход»: файл подменяем на мусор и пробуем аппендить
    writeFileSync(file, "{ не json !!!");
    const res = atomicAppendToArray(file, { id: 2 });
    expect(res.ok).toBe(false);
    // оригинал не тронут и .tmp не остался
    expect(readFileSync(file, "utf8")).toBe("{ не json !!!");
    rmSync(dir, { recursive: true, force: true });
  });

  it("валидный аппенд записывает и сохраняет массив", () => {
    const dir = mkdtempSync(join(tmpdir(), "cases-test-"));
    const file = join(dir, "bank.json");
    writeFileSync(file, JSON.stringify([{ id: 1 }]));
    expect(atomicAppendToArray(file, { id: 2 }).ok).toBe(true);
    const after = JSON.parse(readFileSync(file, "utf8")) as Array<{ id: number }>;
    expect(after).toHaveLength(2);
    expect(after[1].id).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });
});
