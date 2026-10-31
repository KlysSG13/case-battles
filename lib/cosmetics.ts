import type { Prisma, User } from "@prisma/client";
import { prisma } from "./prisma";
import { findSku } from "./catalog";
import { isProActive } from "./entitlements";

type Tx = Prisma.TransactionClient | typeof prisma;

export type OwnReason =
  | { owned: true; source: "purchase" | "level" | "pro" }
  | { owned: false; reason: "not_purchased" | "level_too_low" | "pro_expired" | "bad_sku" };

/**
 * Проверка владения косметикой:
 *  - purchase: запись в UserCosmetic (после оплаты Stars);
 *  - level: уровень игрока >= requiredLevel (запись создаётся при первой экипировке);
 *  - pro: доступна, пока активна подписка (запись не требуется).
 */
export function checkCosmeticOwnership(
  user: Pick<User, "id" | "level" | "proUntil">,
  sku: string,
  ownedSkus: Set<string>,
  now: Date = new Date()
): OwnReason {
  const item = findSku(sku);
  if (!item || item.kind !== "cosmetic") return { owned: false, reason: "bad_sku" };
  if (item.source === "pro") {
    return isProActive(user, now)
      ? { owned: true, source: "pro" }
      : { owned: false, reason: "pro_expired" };
  }
  if (item.source === "level") {
    if (user.level >= (item.requiredLevel ?? Infinity)) {
      return { owned: true, source: "level" };
    }
    return { owned: false, reason: "level_too_low" };
  }
  return ownedSkus.has(sku)
    ? { owned: true, source: "purchase" }
    : { owned: false, reason: "not_purchased" };
}

/** PRO-скин при истечении подписки снимается автоматически при чтении профиля. */
export async function sanitizeEquipped(user: User): Promise<User> {
  if (!user.equippedSkin) return user;
  const item = findSku(user.equippedSkin);
  if (item?.source === "pro" && !isProActive(user)) {
    return prisma.user.update({
      where: { id: user.id },
      data: { equippedSkin: null },
    });
  }
  return user;
}

/** Экипировка со серверной проверкой владения. sku=null -> снять слот. */
export type EquipFailReason = "not_purchased" | "level_too_low" | "pro_expired" | "bad_sku";
export async function equipCosmetic(
  user: User,
  slot: "skin" | "aura",
  sku: string | null
): Promise<{ ok: true; equipped: string | null } | { ok: false; reason: EquipFailReason }> {
  if (sku === null) {
    const data = slot === "skin" ? { equippedSkin: null } : { equippedAura: null };
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    return { ok: true, equipped: slot === "skin" ? updated.equippedSkin : updated.equippedAura };
  }
  const item = findSku(sku);
  if (!item || item.kind !== "cosmetic" || item.slot !== slot) {
    return { ok: false, reason: "bad_sku" };
  }
  const owned = await prisma.userCosmetic.findMany({
    where: { userId: user.id },
    select: { sku: true },
  });
  const check = checkCosmeticOwnership(user, sku, new Set(owned.map((o) => o.sku)));
  if (!check.owned) return { ok: false, reason: check.reason };

  // level-скин фиксируем в инвентаре при первой экипировке
  if (check.source === "level") {
    await prisma.userCosmetic.upsert({
      where: { userId_sku: { userId: user.id, sku } },
      create: { userId: user.id, sku, source: "level" },
      update: {},
    });
  }
  const data = slot === "skin" ? { equippedSkin: sku } : { equippedAura: sku };
  await prisma.user.update({ where: { id: user.id }, data });
  return { ok: true, equipped: sku };
}
