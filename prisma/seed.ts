import { PrismaClient } from "@prisma/client";
import { businessDomain } from "../lib/content/business";
import { productDomain } from "../lib/content/product";
import { lawDomain } from "../lib/content/law";
import type { DomainSeed } from "../lib/content/types";

// tsx не подхватывает .env автоматически — грузим вручную (Node >= 20.12)
try {
  process.loadEnvFile?.();
} catch {
  /* .env может отсутствовать — переменные уже заданы снаружи */
}

const prisma = new PrismaClient();

const BADGES = [
  { code: "first_case", title: "Первое дело", description: "Решите ваш первый кейс", emoji: "🎯" },
  { code: "streak_7", title: "Неделя в огне", description: "Поддерживайте серию 7 дней подряд", emoji: "🔥" },
  { code: "ten_cases", title: "Десятка", description: "Решите 10 кейсов", emoji: "🏅" },
  { code: "master_business", title: "Мастер домена: Бизнес", description: "5 решений в домене «Бизнес» с результатом 70%+", emoji: "💼" },
  { code: "master_product", title: "Мастер домена: Продукт и IT", description: "5 решений в домене «Продукт и IT» с результатом 70%+", emoji: "🚀" },
  { code: "master_law", title: "Мастер домена: Право", description: "5 решений в домене «Право» с результатом 70%+", emoji: "⚖️" },
  { code: "top3_week", title: "Топ-3 недели", description: "Попадите в топ-3 недельного лидерборда", emoji: "🏆" },
  { code: "first_duel", title: "Первая дуэль", description: "Примите участие в любой дуэли", emoji: "🤝" },
  { code: "duel_win_5", title: "Пять побед", description: "Побеждайте в 5 дуэлях", emoji: "⚔️" },
  { code: "constructor_master", title: "Мастер-конструктор", description: "5 конструкторов с результатом 70%+", emoji: "🏗️" },
  { code: "phoenix", title: "Феникс", description: "Победа в «Спасении» с результатом 75%+", emoji: "🌅" },
  { code: "pitch_perfect", title: "Идеальный питч", description: "Питч с результатом 85%+", emoji: "🎤" },
];

const DOMAINS: DomainSeed[] = [businessDomain, productDomain, lawDomain];

async function seedDomain(domain: DomainSeed): Promise<void> {
  const record = await prisma.domain.upsert({
    where: { slug: domain.slug },
    create: { slug: domain.slug, title: domain.title, emoji: domain.emoji, sort: domain.sort },
    update: { title: domain.title, emoji: domain.emoji, sort: domain.sort },
  });

  for (const seedCase of domain.cases) {
    const weightSum = seedCase.criteria.reduce((acc, c) => acc + c.weight, 0);
    if (weightSum !== 100) {
      throw new Error(`Кейс «${seedCase.title}»: сумма весов ${weightSum} != 100`);
    }

    const existing = await prisma.case.findFirst({
      where: { domainId: record.id, title: seedCase.title },
      select: { id: true },
    });
    const caseRecord = existing
      ? await prisma.case.update({
          where: { id: existing.id },
          data: {
            body: seedCase.body,
            difficulty: seedCase.difficulty,
            timeLimitSec: seedCase.timeLimitSec ?? 240,
            isActive: true,
          },
        })
      : await prisma.case.create({
          data: {
            domainId: record.id,
            title: seedCase.title,
            body: seedCase.body,
            difficulty: seedCase.difficulty,
            timeLimitSec: seedCase.timeLimitSec ?? 240,
            isActive: true,
          },
        });

    // рубрика пересоздаётся целиком — сид идемпотентен по заголовку кейса
    await prisma.criterion.deleteMany({ where: { caseId: caseRecord.id } });
    await prisma.criterion.createMany({
      data: seedCase.criteria.map((c) => ({
        caseId: caseRecord.id,
        name: c.name,
        description: c.description,
        weight: c.weight,
        maxPoints: 10,
      })),
    });
  }
}

async function main(): Promise<void> {
  for (const domain of DOMAINS) {
    await seedDomain(domain);
    console.log(`✓ Домен «${domain.title}»: ${domain.cases.length} кейсов`);
  }
  for (const badge of BADGES) {
    await prisma.badge.upsert({
      where: { code: badge.code },
      create: badge,
      update: { title: badge.title, description: badge.description, emoji: badge.emoji },
    });
  }
  console.log(`✓ Бейджи: ${BADGES.length}`);
  const [domains, cases, criteria, badges] = await Promise.all([
    prisma.domain.count(),
    prisma.case.count(),
    prisma.criterion.count(),
    prisma.badge.count(),
  ]);
  console.log(`Итог: доменов ${domains}, кейсов ${cases}, критериев ${criteria}, бейджей ${badges}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
