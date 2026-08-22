// FastQuest engine — all pure logic lives here.
//
// Nothing in this file touches the DOM, localStorage, or the clock. Every export is a
// pure function of its arguments, which is what makes test/engine.test.mjs possible.
//
// Design constraint worth stating up front: this scoring must never reward eating less.
// Fasting XP is hard-capped at 24h, calories are recorded but never scored, ending a
// fast early still earns partial credit, and no meal can ever cost you XP.

export const DAY_MS = 86400000;
export const XP_FAST_CAP_MINUTES = 24 * 60; // no XP for anything past 24h, ever

// ---------------------------------------------------------------------------
// Protocols
// ---------------------------------------------------------------------------

export const PROTOCOLS = {
  '16:8': { id: '16:8', label: '16:8', hours: 16, blurb: '16h fast, 8h eating window' },
  '18:6': { id: '18:6', label: '18:6', hours: 18, blurb: '18h fast, 6h eating window' },
  '20:4': { id: '20:4', label: '20:4', hours: 20, blurb: '20h fast, 4h eating window' },
  'OMAD': { id: 'OMAD', label: 'OMAD', hours: 23, blurb: 'One meal a day' },
  'custom': { id: 'custom', label: 'Custom', hours: 16, blurb: 'Pick your own length' },
};

export const DEFAULT_PROTOCOL = '16:8';
export const CUSTOM_MIN_HOURS = 12;
export const CUSTOM_MAX_HOURS = 24;

/** Resolve a protocol id (+ optional custom hours) to a target length in hours. */
export function targetHoursFor(protocolId, customHours = 16) {
  if (protocolId === 'custom') {
    return clamp(Math.round(customHours), CUSTOM_MIN_HOURS, CUSTOM_MAX_HOURS);
  }
  const p = PROTOCOLS[protocolId];
  return p ? p.hours : PROTOCOLS[DEFAULT_PROTOCOL].hours;
}

// ---------------------------------------------------------------------------
// Meal scoring
// ---------------------------------------------------------------------------

// Tapped as chips in the UI. `delta` shifts a meal off the neutral base of 5.
// Deltas are deliberately gentle: the worst possible meal scores 0, not negative,
// because logging an honest bad meal has to stay better than logging nothing.
export const MEAL_TAGS = [
  { id: 'protein',     label: 'Protein',        delta: +2, group: 'good' },
  { id: 'vegetables',  label: 'Vegetables',     delta: +2, group: 'good' },
  { id: 'fruit',       label: 'Fruit',          delta: +1, group: 'good' },
  { id: 'wholegrain',  label: 'Whole grain',    delta: +1, group: 'good' },
  { id: 'legumes',     label: 'Legumes / nuts', delta: +1, group: 'good' },
  { id: 'water',       label: 'Water / unsweetened', delta: +1, group: 'good' },
  { id: 'homecooked',  label: 'Home-cooked',    delta: +1, group: 'good' },
  { id: 'fried',       label: 'Fried',          delta: -2, group: 'bad' },
  { id: 'sugarydrink', label: 'Sugary drink',   delta: -2, group: 'bad' },
  { id: 'dessert',     label: 'Dessert / sweets', delta: -2, group: 'bad' },
  { id: 'processed',   label: 'Ultra-processed', delta: -2, group: 'bad' },
  { id: 'oversized',   label: 'Oversized portion', delta: -1, group: 'bad' },
  { id: 'latenight',   label: 'Late night',     delta: -1, group: 'bad' },
];

const TAG_DELTA = new Map(MEAL_TAGS.map((t) => [t.id, t.delta]));

export const MEAL_BASE_SCORE = 5;
export const MEAL_MIN_SCORE = 0;
export const MEAL_MAX_SCORE = 10;

/** Score a meal 0..10 from its tags. Unknown tags are ignored. */
export function scoreMeal(tags = []) {
  let score = MEAL_BASE_SCORE;
  for (const tag of tags) {
    score += TAG_DELTA.get(tag) ?? 0;
  }
  return clamp(score, MEAL_MIN_SCORE, MEAL_MAX_SCORE);
}

/** XP for a logged meal. Never negative — logging always beats hiding. */
export function xpForMeal(score) {
  return clamp(Math.round(score), MEAL_MIN_SCORE, MEAL_MAX_SCORE) * 3;
}

// ---------------------------------------------------------------------------
// Fast scoring
// ---------------------------------------------------------------------------

export const STREAK_BONUS_PER_DAY = 0.05;
export const STREAK_MULTIPLIER_MAX = 1.5;
export const OVERTIME_XP_CAP = 40;

/** Streak multiplier, capped so a long streak never dwarfs the base reward. */
export function streakMultiplier(streakDays) {
  const days = Math.max(0, Math.floor(streakDays));
  if (days <= 1) return 1;
  return Math.min(1 + STREAK_BONUS_PER_DAY * (days - 1), STREAK_MULTIPLIER_MAX);
}

/**
 * XP for a finished fast.
 *
 * Completed  -> full base, plus a small capped overtime bonus.
 * Ended early -> half credit, scaled by how far you got. Deliberately non-zero.
 *
 * Elapsed time past 24h earns nothing. This app does not reward extreme fasting.
 */
export function xpForFast(targetHours, elapsedMinutes, streakDays = 0) {
  const target = Math.max(1, Number(targetHours) || 0);
  const targetMinutes = target * 60;
  const base = Math.round(target * 6);
  const capped = clamp(Number(elapsedMinutes) || 0, 0, XP_FAST_CAP_MINUTES);

  let raw;
  if (capped >= targetMinutes) {
    const overtime = Math.min(Math.floor((capped - targetMinutes) / 15) * 2, OVERTIME_XP_CAP);
    raw = base + overtime;
  } else {
    raw = Math.floor(base * (capped / targetMinutes) * 0.5);
  }

  return Math.round(raw * streakMultiplier(streakDays));
}

/** Did this fast reach its target? */
export function isFastComplete(targetHours, elapsedMinutes) {
  return (Number(elapsedMinutes) || 0) >= (Number(targetHours) || 0) * 60;
}

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

export const LEVEL_TITLES = [
  'Sprout', 'Waker', 'Steady', 'Kindled', 'Ranger',
  'Forager', 'Tempered', 'Keeper', 'Strider', 'Warden',
  'Adept', 'Ironclad', 'Vigil', 'Ascetic', 'Sage',
  'Luminary', 'Paragon', 'Eclipse', 'Zenith', 'Ascendant',
];

/** Total XP needed to *be* at level n. Level 1 is 0. */
export function totalXpForLevel(n) {
  const level = Math.max(1, Math.floor(n));
  return Math.round(100 * Math.pow(level - 1, 1.7));
}

export function titleForLevel(level) {
  if (level <= LEVEL_TITLES.length) return LEVEL_TITLES[level - 1];
  return `Ascendant ${romanish(level - LEVEL_TITLES.length + 1)}`;
}

/** Derive level and progress-to-next from a lifetime XP total. */
export function levelFromXp(totalXp) {
  const xp = Math.max(0, Math.floor(Number(totalXp) || 0));
  let level = 1;
  while (totalXpForLevel(level + 1) <= xp) level++;

  const floorXp = totalXpForLevel(level);
  const nextXp = totalXpForLevel(level + 1);
  return {
    level,
    title: titleForLevel(level),
    totalXp: xp,
    xpIntoLevel: xp - floorXp,
    xpForNextLevel: nextXp - floorXp,
    xpToNextLevel: nextXp - xp,
    progress: (xp - floorXp) / (nextXp - floorXp),
  };
}

function romanish(n) {
  const numerals = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  let left = Math.max(1, Math.floor(n));
  for (const [value, symbol] of numerals) {
    while (left >= value) { out += symbol; left -= value; }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Creature stages
// ---------------------------------------------------------------------------

export const CREATURE_STAGES = [
  { id: 'blob',      name: 'Blob',      minLevel: 1 },
  { id: 'sprout',    name: 'Sprout',    minLevel: 5 },
  { id: 'runner',    name: 'Runner',    minLevel: 10 },
  { id: 'winged',    name: 'Winged',    minLevel: 15 },
  { id: 'ascended',  name: 'Ascended',  minLevel: 20 },
];

export function stageForLevel(level) {
  let stage = CREATURE_STAGES[0];
  for (const s of CREATURE_STAGES) {
    if (level >= s.minLevel) stage = s;
  }
  return stage;
}

// ---------------------------------------------------------------------------
// Dates and streaks
// ---------------------------------------------------------------------------

/** Local calendar day as YYYY-MM-DD. Local, not UTC — a fast at 11pm belongs to today. */
export function dayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Shift a YYYY-MM-DD key by whole days. Anchored at noon so DST can't slip a day. */
export function shiftDayKey(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  const anchor = new Date(y, m - 1, d, 12, 0, 0, 0);
  anchor.setDate(anchor.getDate() + days);
  return dayKey(anchor);
}

export function daysBetweenKeys(a, b) {
  const parse = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  };
  return Math.round((parse(b) - parse(a)) / DAY_MS);
}

/**
 * Split sorted unique day keys into runs of consecutive days.
 * Exported because both the streak and the Comeback badge need it.
 */
export function consecutiveRuns(dayKeys) {
  const sorted = [...new Set(dayKeys)].sort();
  const runs = [];
  let run = [];
  for (const key of sorted) {
    if (run.length === 0 || daysBetweenKeys(run[run.length - 1], key) === 1) {
      run.push(key);
    } else {
      runs.push(run);
      run = [key];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

/**
 * Current and best streak from the set of days that had activity.
 *
 * Yesterday still counts as "current" — you haven't lost a streak just because you
 * haven't logged yet today.
 */
export function computeStreak(dayKeys, todayKey = dayKey()) {
  const runs = consecutiveRuns(dayKeys);
  const best = runs.reduce((max, r) => Math.max(max, r.length), 0);
  if (runs.length === 0) return { current: 0, best: 0 };

  const lastRun = runs[runs.length - 1];
  const lastDay = lastRun[lastRun.length - 1];
  const gap = daysBetweenKeys(lastDay, todayKey);
  const current = gap === 0 || gap === 1 ? lastRun.length : 0;
  return { current, best };
}

/** How the creature should look, given the streak and whether today is logged. */
export function streakHealth(current, loggedToday) {
  if (current === 0) return 'broken';
  if (!loggedToday) return 'wobbly';
  return 'healthy';
}

// ---------------------------------------------------------------------------
// Derived stats
// ---------------------------------------------------------------------------

/** A day counts toward a streak if you finished a fast OR logged a meal that day. */
export function activeDayKeys(state) {
  const keys = [];
  for (const fast of state.fasts ?? []) {
    if (fast.completed) keys.push(dayKey(new Date(fast.endedAt)));
  }
  for (const meal of state.meals ?? []) {
    keys.push(dayKey(new Date(meal.at)));
  }
  return [...new Set(keys)].sort();
}

export function deriveStats(state, todayKey = dayKey()) {
  const fasts = state.fasts ?? [];
  const meals = state.meals ?? [];
  const completed = fasts.filter((f) => f.completed);
  const days = activeDayKeys(state);
  const streak = computeStreak(days, todayKey);
  const loggedToday = days.includes(todayKey);

  const mealScores = meals.map((m) => m.score);
  const longestMinutes = fasts.reduce((max, f) => Math.max(max, f.durationMin ?? 0), 0);

  return {
    totalFasts: fasts.length,
    completedFasts: completed.length,
    completionRate: fasts.length ? completed.length / fasts.length : 0,
    longestFastMinutes: longestMinutes,
    totalMeals: meals.length,
    avgMealScore: mealScores.length ? mean(mealScores) : null,
    streak,
    loggedToday,
    health: streakHealth(streak.current, loggedToday),
    ...levelFromXp(state.xp ?? 0),
  };
}

function mean(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

// Each badge is a pure predicate over state, so every one of them is directly testable.
export const BADGES = [
  {
    id: 'first-fast', name: 'First Fast', hint: 'Complete your first fast.',
    earned: (s) => countCompleted(s) >= 1,
  },
  {
    id: 'fasts-5', name: 'Five Down', hint: 'Complete 5 fasts.',
    earned: (s) => countCompleted(s) >= 5,
  },
  {
    id: 'fasts-25', name: 'Quarter Century', hint: 'Complete 25 fasts.',
    earned: (s) => countCompleted(s) >= 25,
  },
  {
    id: 'fasts-100', name: 'Centurion', hint: 'Complete 100 fasts.',
    earned: (s) => countCompleted(s) >= 100,
  },
  {
    id: 'streak-7', name: 'Week Strong', hint: 'Reach a 7-day streak.',
    earned: (s, today) => bestStreak(s, today) >= 7,
  },
  {
    id: 'streak-30', name: 'Month Strong', hint: 'Reach a 30-day streak.',
    earned: (s, today) => bestStreak(s, today) >= 30,
  },
  {
    id: 'streak-100', name: 'Unbroken', hint: 'Reach a 100-day streak.',
    earned: (s, today) => bestStreak(s, today) >= 100,
  },
  {
    id: 'hours-20', name: 'Twenty', hint: 'Finish a fast of 20 hours.',
    earned: (s) => longestFast(s) >= 20 * 60,
  },
  {
    id: 'hours-24', name: 'Full Circle', hint: 'Finish a fast of 24 hours.',
    earned: (s) => longestFast(s) >= 24 * 60,
  },
  {
    id: 'clean-week', name: 'Clean Week', hint: 'Average a meal score of 7+ across a full week.',
    earned: (s) => hasCleanWeek(s),
  },
  {
    id: 'full-log-day', name: 'Full Log', hint: 'Log a completed fast and 2+ meals in one day.',
    earned: (s) => hasFullLogDay(s),
  },
  {
    id: 'comeback', name: 'Comeback', hint: 'Rebuild a 3-day streak after breaking one.',
    earned: (s) => hasComeback(s),
  },
];

function countCompleted(state) {
  return (state.fasts ?? []).filter((f) => f.completed).length;
}

function bestStreak(state, today = dayKey()) {
  return computeStreak(activeDayKeys(state), today).best;
}

function longestFast(state) {
  return (state.fasts ?? []).reduce((max, f) => Math.max(max, f.durationMin ?? 0), 0);
}

/** Seven consecutive days, every one of them with a meal, mean score >= 7. */
export function hasCleanWeek(state) {
  const meals = state.meals ?? [];
  if (meals.length === 0) return false;

  const byDay = new Map();
  for (const meal of meals) {
    const key = dayKey(new Date(meal.at));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(meal.score);
  }

  for (const startKey of byDay.keys()) {
    const window = [];
    let complete = true;
    for (let i = 0; i < 7; i++) {
      const scores = byDay.get(shiftDayKey(startKey, i));
      if (!scores) { complete = false; break; }
      window.push(...scores);
    }
    if (complete && mean(window) >= 7) return true;
  }
  return false;
}

export function hasFullLogDay(state) {
  const mealsPerDay = new Map();
  for (const meal of state.meals ?? []) {
    const key = dayKey(new Date(meal.at));
    mealsPerDay.set(key, (mealsPerDay.get(key) ?? 0) + 1);
  }
  for (const fast of state.fasts ?? []) {
    if (!fast.completed) continue;
    if ((mealsPerDay.get(dayKey(new Date(fast.endedAt))) ?? 0) >= 2) return true;
  }
  return false;
}

/** A break in the log, followed by rebuilding at least 3 consecutive days. */
export function hasComeback(state) {
  const runs = consecutiveRuns(activeDayKeys(state));
  if (runs.length < 2) return false;
  return runs.slice(1).some((run) => run.length >= 3);
}

/** Badge ids newly earned that aren't already recorded in state.badges. */
export function newlyEarnedBadges(state, today = dayKey()) {
  const already = state.badges ?? {};
  return BADGES.filter((b) => !already[b.id] && b.earned(state, today)).map((b) => b.id);
}

// ---------------------------------------------------------------------------

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Minutes -> "16h 04m", for the timer and history rows. */
export function formatDuration(minutes) {
  const total = Math.max(0, Math.floor(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Milliseconds -> "16:04:33", for the live ticking timer. */
export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
