// Europe/Moscow = UTC+3 круглый год (без перехода на летнее время).
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Строка вида YYYY-MM-DD — календарный день в Europe/Moscow. */
export function mskDayString(date: Date = new Date()): string {
  return new Date(date.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC-момент полуночи текущего дня по Москве. */
export function mskDayStartUtc(date: Date = new Date()): Date {
  const day = mskDayString(date);
  return new Date(Date.parse(`${day}T00:00:00Z`) - MSK_OFFSET_MS);
}

/** UTC-момент 00:00 понедельника текущей недели по Москве. */
export function mskWeekStartUtc(date: Date = new Date()): Date {
  const day = mskDayString(date);
  // будний день считаем по календарной дате Москвы, а не по UTC-моменту
  const calendarDay = new Date(`${day}T00:00:00Z`);
  const daysFromMonday = (calendarDay.getUTCDay() + 6) % 7;
  return new Date(calendarDay.getTime() - MSK_OFFSET_MS - daysFromMonday * DAY_MS);
}

/** Разница a - b в сутках для строк YYYY-MM-DD. */
export function dayDiff(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS
  );
}

/** Дата по Москве из UTC-момента в виде YYYY-MM-DD. */
export function mskDayOfString(date: Date): string {
  return mskDayString(date);
}
