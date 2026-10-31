import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicCatalog } from "@/lib/catalog";
import { checkCosmeticOwnership, equipCosmetic, sanitizeEquipped } from "@/lib/cosmetics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/app/cosmetics — каталог косметики + инвентарь + экипировка (со статусами).
 * POST /api/app/cosmetics/equip {slot, sku|null} — экипировать/снять с проверкой владения.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const user = await sanitizeEquipped(auth.user);
  const owned = await prisma.userCosmetic.findMany({
    where: { userId: user.id },
    select: { sku: true, source: true, acquiredAt: true },
  });
  const ownedSkus = new Set(owned.map((o) => o.sku));
  const items = publicCatalog()
    .filter((c) => c.kind === "cosmetic")
    .map((c) => {
      const check = checkCosmeticOwnership(user, c.sku, ownedSkus);
      const ownedRecord = owned.find((o) => o.sku === c.sku);
      return {
        sku: c.sku,
        slot: c.slot,
        title: c.title,
        description: c.description,
        stars: c.stars,
        source: c.source,
        requiredLevel: c.requiredLevel,
        owned: check.owned,
        // status: "equipped" | "owned" | "locked" | "buy" | "pro"
        status:
          (c.slot === "skin" && user.equippedSkin === c.sku) ||
          (c.slot === "aura" && user.equippedAura === c.sku)
            ? "equipped"
            : check.owned
              ? "owned"
              : c.source === "purchase"
                ? "buy"
                : c.source === "pro"
                  ? "pro"
                  : "locked",
        lockReason: check.owned ? null : check.reason,
        acquiredAt: ownedRecord?.acquiredAt.toISOString() ?? null,
      };
    });
  return NextResponse.json({
    items,
    equipped: { skin: user.equippedSkin, aura: user.equippedAura },
    level: user.level,
    isPro: user.proUntil ? user.proUntil.getTime() > Date.now() : false,
  });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const body = (await req.json().catch(() => null)) as {
    slot?: string;
    sku?: string | null;
  } | null;
  if (body?.slot !== "skin" && body?.slot !== "aura") {
    return NextResponse.json({ error: "Некорректный слот" }, { status: 400 });
  }
  const result = await equipCosmetic(auth.user, body.slot, body.sku ?? null);
  if (!result.ok) {
    const messages: Record<string, string> = {
      not_purchased: "Этот предмет ещё не куплен",
      level_too_low: "Уровень пока недостаточен для этого скина",
      pro_expired: "PRO-скин доступен только с активной подпиской",
      bad_sku: "Предмет не найден",
    };
    return NextResponse.json(
      { error: messages[result.reason] ?? "Недоступно", code: result.reason },
      { status: 403 }
    );
  }
  return NextResponse.json({ equipped: result.equipped });
}
