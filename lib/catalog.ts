import { z } from "zod";

// ЕДИНСТВЕННОЕ место с ценами (Stars/XTR) на сервере. Клиенту цены отдаёт каталог,
// клиентские суммы нигде не учитываются. Плейсхолдеры — владелец меняет тут же.

export type CatalogKind = "pro30" | "hints" | "cosmetic";

export interface CatalogItem {
  sku: string;
  kind: CatalogKind;
  title: string; // заголовок инвойса
  description: string; // описание инвойса
  stars: number; // цена в Stars
  /** для kind=cosmetic */
  slot?: "skin" | "aura";
  /** источник доступа для косметики */
  source?: "purchase" | "level" | "pro";
  /** уровень для source=level */
  requiredLevel?: number;
}

export const CATALOG: CatalogItem[] = [
  {
    sku: "pro30",
    kind: "pro30",
    title: "PRO на 30 дней",
    description: "Безлимит раундов, 3 подсказки в день, PRO-скин дрона и бейдж",
    stars: 250,
  },
  {
    sku: "hints10",
    kind: "hints",
    title: "10 подсказок",
    description: "Пачка подсказок к кейсам: наводка на линию мышления",
    stars: 50,
  },
  // ---- Косметика дрона: скины (платные) ----
  {
    sku: "skin-neon-magenta",
    kind: "cosmetic",
    slot: "skin",
    source: "purchase",
    title: "Скин «Маджента»",
    description: "Корпус в неон-мадженте",
    stars: 80,
  },
  {
    sku: "skin-emerald",
    kind: "cosmetic",
    slot: "skin",
    source: "purchase",
    title: "Скин «Изумруд»",
    description: "Холодный изумрудный корпус",
    stars: 120,
  },
  {
    sku: "skin-gold",
    kind: "cosmetic",
    slot: "skin",
    source: "purchase",
    title: "Скин «Золото лиги»",
    description: "Позолоченный корпус победителя",
    stars: 150,
  },
  // PRO-эксклюзив: бесплатен при активной PRO
  {
    sku: "skin-pro-quantum",
    kind: "cosmetic",
    slot: "skin",
    source: "pro",
    title: "Скин «Квант» (PRO)",
    description: "Эксклюзив PRO: доступен, пока активна подписка",
    stars: 0,
  },
  // Скины за уровни
  {
    sku: "skin-veteran",
    kind: "cosmetic",
    slot: "skin",
    source: "level",
    requiredLevel: 5,
    title: "Скин «Ветеран»",
    description: "Открывается на 5 уровне",
    stars: 0,
  },
  {
    sku: "skin-legend",
    kind: "cosmetic",
    slot: "skin",
    source: "level",
    requiredLevel: 10,
    title: "Скин «Легенда»",
    description: "Открывается на 10 уровне",
    stars: 0,
  },
  // Аура
  {
    sku: "aura-halo",
    kind: "cosmetic",
    slot: "aura",
    source: "purchase",
    title: "Аура «Гало»",
    description: "Мягкое свечение вокруг дрона",
    stars: 100,
  },
];

export const SkuSchema = z.string().min(1).max(64);

/** payload инвойса: <sku>:<userId> */
export const PayloadSchema = z
  .string()
  .regex(/^[a-z0-9-]+:\d+$/i, "payload должен быть вида <sku>:<userId>");

export function findSku(sku: string): CatalogItem | undefined {
  return CATALOG.find((c) => c.sku === sku);
}

export function buildPayload(sku: string, userId: number): string {
  return `${sku}:${userId}`;
}

export function parsePayload(payload: string): { sku: string; userId: number } | null {
  if (!PayloadSchema.safeParse(payload).success) return null;
  const [sku, id] = payload.split(":");
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  return { sku, userId };
}

/** Публичный каталог для клиента (цены — только отсюда). */
export function publicCatalog() {
  return CATALOG.map((c) => ({
    sku: c.sku,
    kind: c.kind,
    title: c.title,
    description: c.description,
    stars: c.stars,
    slot: c.slot,
    source: c.source,
    requiredLevel: c.requiredLevel,
  }));
}
