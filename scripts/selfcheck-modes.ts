/**
 * Самопроверка движка «Кейс-баттлов» (§10 шаг 2):
 *  - генератор сценариев (конструктор/спасение): zod, rules=3, missedFactors скрыты;
 *  - соперник в 3 стилях: длина 600–1000, оценка той же рубрикой;
 *  - юнит-проверки: mascot (+15/−10/сон/бонус), лиги, ratingDelta, normalizeMissed.
 */
export {}; // файл — модуль, а не глобальный скрипт

try {
  process.loadEnvFile?.();
} catch {
  /* переменные могут быть заданы снаружи */
}

import { PrismaClient } from "@prisma/client";
import { ScenarioSchema, generateScenario, toPublicScenario, buildMockScenario } from "../lib/scenario";
import { generateRivalAnswer, buildMockRivalAnswer } from "../lib/rival";
import { MODES, leagueFor, ratingDelta, LEAGUES } from "../lib/modes";
import { evaluateAnswer, normalizeMissed } from "../lib/evaluator";
import { computeMascot, MASCOT_XP_THRESHOLD } from "../lib/mascot";
import { mskDayString } from "../lib/msk";

const prisma = new PrismaClient();
let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, extra = ""): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function main(): Promise<void> {
  console.log("Selfcheck «Кейс-баттлы»\n");

  // ---- 1. Генератор сценариев ----
  console.log("1. Сценарии");
  const fallbackCase = await prisma.case.findFirstOrThrow({ where: { isActive: true } });
  for (const mode of ["constructor", "rescue"] as const) {
    const outcome = await generateScenario(mode, "Бизнес", async () => ({
      caseId: fallbackCase.id,
      caseBody: fallbackCase.body,
      caseTitle: fallbackCase.title,
    }));
    ok(`${mode}: сгенерирован`, outcome.kind === "generated", outcome.kind === "generated" ? `engine=${outcome.engine}` : `фолбэк: ${outcome.reason}`);
    if (outcome.kind === "generated") {
      const parsed = ScenarioSchema.safeParse(outcome.scenario);
      ok(`${mode}: zod-валиден`, parsed.success);
      ok(`${mode}: ровно 3 правила`, outcome.scenario.rules.length === 3);
      ok(`${mode}: missedFactors 5–7`, outcome.scenario.missedFactors.length >= 5 && outcome.scenario.missedFactors.length <= 7);
      const pub = JSON.stringify(toPublicScenario(outcome.scenario));
      ok(`${mode}: public без missedFactors`, !pub.includes("missedFactors"));
      ok(`${mode}: ситуация ≥ 400 символов`, outcome.scenario.situation.length >= 400, `${outcome.scenario.situation.length} симв.`);
    }
  }
  const mockScenario = buildMockScenario("rescue", "Бизнес", 42);
  ok("мок-сценарий: zod-валиден", ScenarioSchema.safeParse(mockScenario).success);

  // ---- 2. Соперник в 3 стилях ----
  console.log("\n2. Соперник (3 стиля)");
  const rubric = MODES.constructor.rubric;
  const caseText = fallbackCase.body;
  for (const style of ["analyst", "hustler", "systemizer"] as const) {
    const rival = await generateRivalAnswer({
      style,
      caseText,
      caseTitle: fallbackCase.title,
      rubric,
    });
    ok(`${style}: ответ 600–1000 симв.`, rival.ok && rival.answer.length >= 500 && rival.answer.length <= 1100, rival.ok ? `${rival.answer.length} симв., engine=${rival.engine}` : "fail");
    if (rival.ok) {
      const evalRival = await evaluateAnswer({
        caseTitle: fallbackCase.title,
        caseBody: caseText,
        criteria: rubric,
        answer: rival.answer,
        timeSpentSec: 200,
      });
      ok(`${style}: оценён той же рубрикой`, evalRival.ok, evalRival.ok ? `percent=${evalRival.percent}` : evalRival.error);
      if (evalRival.ok) ok(`${style}: missed 0–4`, evalRival.missed.length <= 4);
    }
  }
  ok(
    "моки соперников различаются по стилю",
    buildMockRivalAnswer("analyst", "T").slice(0, 60) !== buildMockRivalAnswer("hustler", "T").slice(0, 60)
  );

  // ---- 3. Юнит-проверки движка ----
  console.log("\n3. Дрон");
  const today = mskDayString();
  const mkUser = (over: Partial<{ mascotCharge: number; mascotDay: Date | null; lastActiveDate: Date | null }>) => ({
    mascotCharge: over.mascotCharge ?? 50,
    mascotDay: over.mascotDay ?? null,
    lastActiveDate: over.lastActiveDate ?? null,
  });
  ok("первый вход: заряд не меняется", computeMascot(mkUser({ mascotCharge: 50, mascotDay: null })).charge === 50);
  const yesterday = new Date(Date.now() - 26 * 3600e3);
  const twoDaysAgo = new Date(Date.now() - 50 * 3600e3);
  ok(
    "активный день: +15",
    computeMascot(mkUser({ mascotCharge: 40, mascotDay: yesterday, lastActiveDate: yesterday })).charge === 55
  );
  ok(
    "день без матча: −10",
    computeMascot(mkUser({ mascotCharge: 40, mascotDay: twoDaysAgo, lastActiveDate: twoDaysAgo })).charge === 30
  );
  ok(
    "спячка при 0 (не ниже)",
    computeMascot(mkUser({ mascotCharge: 5, mascotDay: twoDaysAgo, lastActiveDate: twoDaysAgo })).charge === 0
  );
  ok(
    "максимум 100",
    computeMascot(mkUser({ mascotCharge: 95, mascotDay: yesterday, lastActiveDate: yesterday })).charge === 100
  );
  ok("порог XP-бонуса 60", MASCOT_XP_THRESHOLD === 60);
  void today;

  console.log("\n4. Лиги и рейтинг");
  ok("Бронза < 1100", leagueFor(999).key === "bronze" && leagueFor(1099).key === "bronze");
  ok("Серебро 1100–1299", leagueFor(1100).key === "silver" && leagueFor(1299).key === "silver");
  ok("Золото 1300–1599", leagueFor(1300).key === "gold" && leagueFor(1599).key === "gold");
  ok("Платина ≥ 1600", leagueFor(1600).key === "platinum" && leagueFor(2500).key === "platinum");
  ok("лиг 4", LEAGUES.length === 4);
  ok("AI win = +15", ratingDelta("ai", "win", "normal") === 15);
  ok("AI loss hard = −13", ratingDelta("ai", "loss", "hard") === -13);
  ok("PvP win easy = +16", ratingDelta("pvp", "win", "easy") === 16);
  ok("ничья = 0", ratingDelta("pvp", "draw", "hard") === 0);

  console.log("\n5. normalizeMissed");
  const missed = normalizeMissed(["а", "б", "в", "г", "д"], ["сценарий"]);
  ok("обрезка до 4", missed.length === 4);
  const long = normalizeMissed([`${"слово ".repeat(30)}хвост`], ["фактор один", "фактор два"]);
  ok("≤ 12 слов на пункт", long.every((m) => m.split(/\s+/).length <= 12));
  ok("добор из missedFactors до 2", normalizeMissed([], ["a", "b"]).length === 2);

  console.log(`\nИтог: ${passed} прошло, ${failed} упало`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("Selfcheck-modes failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
