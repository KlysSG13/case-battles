// ЕДИНСТВЕННЫЙ источник акцентных цветов в JS: сферы, лиги, шкала процентов.
// Базовая палитра (фон/панели/неон/маджента) живёт в app/globals.css (@theme).
// Хекс-коды вне этого файла и globals.css запрещены (DoD v1.1.0).

export interface SphereMeta {
  slug: string;
  title: string;
  color: string;
  description: string;
}

export const SPHERES: SphereMeta[] = [
  {
    slug: "business",
    title: "Бизнес",
    color: "#ff2d78",
    description: "деньги, команда, переговоры",
  },
  {
    slug: "product",
    title: "Продукт и IT",
    color: "#00f0ff",
    description: "продукт, метрики, эксперименты",
  },
  {
    slug: "law",
    title: "Право",
    color: "#ffb020",
    description: "договоры, риски, права",
  },
];

export function sphereMeta(slug: string | null | undefined): SphereMeta {
  return SPHERES.find((s) => s.slug === slug) ?? SPHERES[1];
}

// Лиги: единственное место с цветами (импортируется lib/modes.ts)
export const LEAGUE_COLORS: Record<string, string> = {
  bronze: "#cd7f32",
  silver: "#c0c0c0",
  gold: "#ffd700",
  platinum: "#7df9ff",
};

// Шкала процентов: везде одинаковая (результат, профиль, лидерборд, дуэли)
export const INK = "#0a0e17";

export const NEON = {
  primary: "#00f0ff",
  secondary: "#ff2d78",
} as const;

export const PERCENT_COLORS = {
  good: "#00f0ff",
  mid: "#ffb020",
  bad: "#ff2d78",
} as const;

export function percentColor(percent: number): string {
  if (percent >= 70) return PERCENT_COLORS.good;
  if (percent >= 40) return PERCENT_COLORS.mid;
  return PERCENT_COLORS.bad;
}

// ---- Косметика дрона: визуальные конфиги по sku (значения — только здесь) ----

export interface DroneStyle {
  skin: string; // акцент корпуса (обводка, сопла, ядро)
  aura: string; // внешнее свечение (экипированная аура)
}

export const DRONE_STYLES: Record<string, DroneStyle> = {
  default: { skin: NEON.primary, aura: "transparent" },
  "skin-neon-magenta": { skin: NEON.secondary, aura: "transparent" },
  "skin-emerald": { skin: "#20e3a0", aura: "transparent" },
  "skin-gold": { skin: LEAGUE_COLORS.gold, aura: "transparent" },
  "skin-pro-quantum": { skin: "#b26bff", aura: "#b26bff" },
  "skin-veteran": { skin: "#89a7b8", aura: "transparent" },
  "skin-legend": { skin: LEAGUE_COLORS.platinum, aura: LEAGUE_COLORS.platinum },
  "aura-halo": { skin: NEON.primary, aura: NEON.primary },
};

export function droneStyle(skinSku?: string | null, auraSku?: string | null): DroneStyle {
  const skin = DRONE_STYLES[skinSku ?? ""] ?? DRONE_STYLES.default;
  const aura = auraSku ? (DRONE_STYLES[auraSku]?.aura ?? "transparent") : "transparent";
  return { skin: skin.skin, aura };
}
