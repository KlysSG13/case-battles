import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicCatalog } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/app/payments/history — каталог с ценами + последние 5 платежей юзера. */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const payments = await prisma.payment.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      sku: true,
      kind: true,
      stars: true,
      status: true,
      createdAt: true,
      telegramPaymentChargeId: true,
    },
  });
  return NextResponse.json({
    catalog: publicCatalog(),
    payments: payments.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
    })),
  });
}
