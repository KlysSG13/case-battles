import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extendProUntil, isProActive, ownsProCosmetic } from "../lib/entitlements";
import { lazyDailyGrant, HINT_FREE_CAP } from "../lib/hints";
import { buildPayload, parsePayload, findSku, CATALOG } from "../lib/catalog";
import { checkCosmeticOwnership } from "../lib/cosmetics";

// чистые функции — без БД и сети

describe("entitlements: proUntil", () => {
  it("активна только когда proUntil в будущем", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    expect(isProActive({ proUntil: new Date("2026-11-30T00:00:00Z") }, now)).toBe(true);
    expect(isProActive({ proUntil: new Date("2026-10-31T11:59:59Z") }, now)).toBe(false);
    expect(isProActive({ proUntil: null }, now)).toBe(false);
  });

  it("продление: от now, если подписки не было", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    const until = extendProUntil(null, 30, now);
    expect(until.toISOString()).toBe("2026-11-30T12:00:00.000Z");
  });

  it("продление: от существующего proUntil при активной подписке (не от now)", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    const current = new Date("2026-11-15T00:00:00Z");
    const until = extendProUntil(current, 30, now);
    expect(until.toISOString()).toBe("2026-12-15T00:00:00.000Z");
  });

  it("продление от now при истёкшей подписке", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    const expired = new Date("2026-10-01T00:00:00Z");
    const until = extendProUntil(expired, 30, now);
    expect(until.toISOString()).toBe("2026-11-30T12:00:00.000Z");
  });

  it("PRO-скин синхронен с подпиской (автоснятие при чтении)", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    expect(ownsProCosmetic({ proUntil: new Date("2026-11-01T00:00:00Z") }, now)).toBe(true);
    expect(ownsProCosmetic({ proUntil: new Date("2026-10-01T00:00:00Z") }, now)).toBe(false);
  });
});

describe("hints: ленивые гранты (Europe/Moscow)", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-10-31T20:00:00Z")); // 23:00 МСК 31.10
  });
  afterEach(() => vi.useRealTimers());

  it("первое чтение за сутки: free +1", () => {
    const g = lazyDailyGrant({ hintsBalance: 0, lastHintGrantDate: null, proUntil: null });
    expect(g.granted).toBe(1);
    expect(g.balance).toBe(1);
  });

  it("PRO получает +3", () => {
    const g = lazyDailyGrant({
      hintsBalance: 0,
      lastHintGrantDate: null,
      proUntil: new Date("2026-11-30T00:00:00Z"),
    });
    expect(g.granted).toBe(3);
  });

  it("повторное чтение в те же сутки не дублирует грант", () => {
    const today = new Date("2026-10-31T10:00:00Z"); // 13:00 МСК тех же суток
    const g = lazyDailyGrant({ hintsBalance: 5, lastHintGrantDate: today, proUntil: null });
    expect(g.granted).toBe(0);
    expect(g.balance).toBe(5);
  });

  it("кап 20 применяется только к бесплатным грантам", () => {
    // баланс 19: free грант добавит только 1 (до капа)
    const g = lazyDailyGrant({ hintsBalance: 19, lastHintGrantDate: null, proUntil: null });
    expect(g.balance).toBe(HINT_FREE_CAP);
    expect(g.granted).toBe(1);
    // баланс 20: грант не добавляется
    const g2 = lazyDailyGrant({ hintsBalance: 20, lastHintGrantDate: null, proUntil: null });
    expect(g2.balance).toBe(20);
    expect(g2.granted).toBe(0);
  });

  it("смена суток по Москве даёт новый грант", () => {
    vi.setSystemTime(new Date("2026-11-01T00:30:00Z")); // 03:30 МСК 01.11
    const yesterday = new Date("2026-10-31T20:00:00Z"); // 23:00 МСК 31.10
    const g = lazyDailyGrant({ hintsBalance: 4, lastHintGrantDate: yesterday, proUntil: null });
    expect(g.granted).toBe(1);
    expect(g.balance).toBe(5);
  });
});

describe("catalog: payload", () => {
  it("build/parse payload круглым циклом", () => {
    expect(parsePayload(buildPayload("pro30", 424242))).toEqual({ sku: "pro30", userId: 424242 });
  });

  it("битый payload отклоняется", () => {
    expect(parsePayload("pro30")).toBeNull();
    expect(parsePayload("pro30:abc")).toBeNull();
    expect(parsePayload(":123")).toBeNull();
    expect(parsePayload("случайный мусор")).toBeNull();
  });

  it("все SKU уникальны, у платных цена > 0, у level/pro — 0", () => {
    const skus = CATALOG.map((c) => c.sku);
    expect(new Set(skus).size).toBe(skus.length);
    for (const c of CATALOG) {
      if (c.source === "purchase" || c.kind !== "cosmetic") expect(c.stars).toBeGreaterThan(0);
      else expect(c.stars).toBe(0);
    }
    expect(findSku("pro30")?.kind).toBe("pro30");
    expect(findSku("nope")).toBeUndefined();
  });
});

describe("cosmetics: владение", () => {
  const now = new Date("2026-10-31T12:00:00Z");
  const user = (over: Partial<{ level: number; proUntil: Date | null }>) => ({
    id: 1,
    level: over.level ?? 1,
    proUntil: over.proUntil ?? null,
  });

  it("purchase: только при записи в инвентаре", () => {
    const owned = new Set(["skin-emerald"]);
    expect(checkCosmeticOwnership(user({}), "skin-emerald", owned, now)).toEqual({
      owned: true,
      source: "purchase",
    });
    expect(checkCosmeticOwnership(user({}), "skin-gold", owned, now)).toEqual({
      owned: false,
      reason: "not_purchased",
    });
  });

  it("level: по уровню игрока", () => {
    expect(checkCosmeticOwnership(user({ level: 5 }), "skin-veteran", new Set(), now)).toEqual({
      owned: true,
      source: "level",
    });
    expect(checkCosmeticOwnership(user({ level: 4 }), "skin-veteran", new Set(), now)).toEqual({
      owned: false,
      reason: "level_too_low",
    });
    expect(checkCosmeticOwnership(user({ level: 10 }), "skin-legend", new Set(), now).owned).toBe(true);
  });

  it("pro: пока подписка активна", () => {
    const pro = user({ proUntil: new Date("2026-11-30T00:00:00Z") });
    const expired = user({ proUntil: new Date("2026-10-01T00:00:00Z") });
    expect(checkCosmeticOwnership(pro, "skin-pro-quantum", new Set(), now)).toEqual({
      owned: true,
      source: "pro",
    });
    expect(checkCosmeticOwnership(expired, "skin-pro-quantum", new Set(), now)).toEqual({
      owned: false,
      reason: "pro_expired",
    });
  });

  it("несуществующий sku", () => {
    expect(checkCosmeticOwnership(user({}), "nope", new Set(), now)).toEqual({
      owned: false,
      reason: "bad_sku",
    });
  });
});
