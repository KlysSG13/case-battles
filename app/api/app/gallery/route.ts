import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Evaluation } from "@/lib/evaluator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/app/gallery?caseId= | ?userId=me — топ-5 публичных попыток.
 * Приватные профили (profilePublic=false) в галерею не попадают.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const caseIdParam = Number(req.nextUrl.searchParams.get("caseId"));
  const userParam = req.nextUrl.searchParams.get("userId");

  const where = {
    status: "completed" as const,
    ...(Number.isInteger(caseIdParam) && caseIdParam > 0
      ? { caseId: caseIdParam }
      : {}),
  };

  const attempts = await prisma.attempt.findMany({
    where,
    orderBy: [{ percent: "desc" }, { submittedAt: "asc" }],
    take: 60,
    include: {
      case: { select: { title: true } },
      user: { select: { id: true, firstName: true, username: true, profilePublic: true } },
    },
  });

  // свои попытки видны всегда, чужие — только при публичном профиле автора
  const visible = attempts.filter(
    (a) => a.user.id === auth.user.id || a.user.profilePublic
  );

  let rows;
  if (userParam === "me") {
    rows = visible.filter((a) => a.user.id === auth.user.id).slice(0, 20);
  } else {
    rows = visible.slice(0, 5);
  }

  return NextResponse.json({
    items: rows.map((a) => {
      let evaluation: Evaluation | null = null;
      let missed: string[] = [];
      try {
        evaluation = (JSON.parse(a.aiRaw ?? "{}") as { evaluation?: Evaluation }).evaluation ?? null;
      } catch {
        evaluation = null;
      }
      try {
        const parsed = JSON.parse(a.missedJson ?? "[]") as unknown;
        if (Array.isArray(parsed)) missed = parsed.filter((x): x is string => typeof x === "string");
      } catch {
        missed = [];
      }
      return {
        attemptId: a.id,
        caseId: a.caseId,
        caseTitle: a.case?.title,
        author: a.user.id === auth.user.id ? `${a.user.firstName} (вы)` : a.user.firstName,
        isMine: a.user.id === auth.user.id,
        percent: a.percent ?? 0,
        mode: a.mode,
        difficulty: a.difficulty,
        xpEarned: a.xpEarned,
        submittedAt: a.submittedAt?.toISOString() ?? null,
        answer: a.answer,
        criteria: evaluation?.criteria ?? [],
        strengths: evaluation?.strengths ?? [],
        improvements: evaluation?.improvements ?? [],
        missed,
        modelAnswer: evaluation?.model_answer ?? null,
      };
    }),
  });
}
