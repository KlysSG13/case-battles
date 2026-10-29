export const XP_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200];
const STEP_AFTER_LAST = 900;

/** level = индекс порога (1-based); после последнего порога +900 XP за уровень. */
export function levelFromXp(xp: number): number {
  let level = 1;
  for (let i = 0; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) level = i + 1;
    else break;
  }
  const last = XP_THRESHOLDS[XP_THRESHOLDS.length - 1];
  if (xp >= last) {
    level = XP_THRESHOLDS.length + Math.floor((xp - last) / STEP_AFTER_LAST);
  }
  return level;
}

export interface LevelProgress {
  level: number;
  levelStartXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpToNext: number;
  progressPct: number; // 0..100
}

export function levelProgress(xp: number): LevelProgress {
  const n = XP_THRESHOLDS.length;
  const level = levelFromXp(xp);
  let levelStartXp: number;
  let nextLevelXp: number;
  if (level < n) {
    levelStartXp = XP_THRESHOLDS[level - 1];
    nextLevelXp = XP_THRESHOLDS[level];
  } else {
    const last = XP_THRESHOLDS[n - 1];
    const beyond = level - n; // 0, 1, 2...
    levelStartXp = last + beyond * STEP_AFTER_LAST;
    nextLevelXp = levelStartXp + STEP_AFTER_LAST;
  }
  const xpIntoLevel = xp - levelStartXp;
  const xpToNext = nextLevelXp - xp;
  const progressPct = Math.min(
    100,
    Math.round((xpIntoLevel / (nextLevelXp - levelStartXp)) * 100)
  );
  return { level, levelStartXp, nextLevelXp, xpIntoLevel, xpToNext, progressPct };
}
