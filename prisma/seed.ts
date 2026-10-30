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

// Наводки для подсказок классических кейсов: линия мышления, НЕ готовый ответ
const CASE_HINTS: Record<string, string> = {
  "Кофейня у метро: расти или закрепиться":
    "Начни с юнит-экономики точки: маржа на чашку × трафик — выдержит ли демпинг сети, и что дешевле: вторая точка или лояльность текущих клиентов.",
  "Пекарня и крупная сеть: заказ, который съест половину печей":
    "Посчитай смешанную маржу при загрузке печей на контракт и сравни с потерей ассортиментной матрицы для розницы.",
  "Дебиторка 2,4 млн: крупнейший клиент не платит, но заказывает снова":
    "Развязка — не «поставить/не поставить», а связка: частичная отгрузка под график оплат + претензионная работа.",
  "Два объекта, одна бригада: срыв сроков и штрафы":
    "Сравни стоимость просрочки (штрафы) со стоимостью ускорения (доподряд) и разрули коммуникацию с обоими заказчиками честно.",
  "Онлайн-школа: повторные покупки падают, маркетинг просит бюджет":
    "Разведи симптом (CAC) и причину (retention): что дешевле — новый ученик или удержание выпускника базового курса.",
  "Мобильный банк: конверсия регистрации упала после редизайна":
    "Разложи воронку по шагам и вспомни, что именно добавили во флоу — видео и опрос стоят до пика падения.",
  "Доставка в трёх городах: SLA падает, а центр сортировки винит курьеров":
    "Ищи корреляцию времени сортировки и вечернего пика — найм курьеров лечит симптом, а не причину.",
  "SaaS для логистики: клиент с 18% выручки требует кастомную фичу":
    "Развяжи конфликт «концентрация клиента vs легаси-долг»: платная интеграция с этапами снижает риск и для бизнеса, и для роадмапа.",
  "Игра: после обновления экономики D7 упал, а выручка выросла":
    "Раздели сегменты игроков: что изменилось для середины, которая уходит, и почему топы довольны.",
  "Поиск в каталоге: клики упали, две гипотезы, три недели до релиза":
    "Используй данные по сегментам (цена, отзывы) — они указывают на одну из двух гипотез ещё до эксперимента.",
  "Увольнение за прогул: больничный пришёл после приказа":
    "Ключ не в факте прогула, а в процедуре: было ли затребовано письменное объяснение до приказа.",
  "Поставка сорвана: наводнение, неустойка и предоплата 50%":
    "Разведи форс-мажор (сертификат ТПП) и коммерческое урегулирование: что дешевле — закупка у конкурента или выплата неустойки.",
  "Утечка базы клиентов через подрядчика рассылок":
    "Первые 24 часа решают: уведомления РКН и субъектам — обязанность по срокам, а не выбор.",
  "Претензия правообладателя: название кафе и чужой товарный знак":
    "Посчитай три сценария в деньгах: ребрендинг, торг за компенсацию, суд — и проверь реальное использование знака истцом.",
  "Аренда +40%: пункт об индексации и рынок вырос на 15%":
    "Проверь пределы одностороннего пересмотра ставки и сравни доплату 40% с рыночными 15% — переговорная позиция строится на этом зазоре.",
};

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
            hint: CASE_HINTS[seedCase.title] ?? null,
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
            hint: CASE_HINTS[seedCase.title] ?? null,
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
