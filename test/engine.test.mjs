import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BADGES,
  MEAL_TAGS,
  computeStreak,
  consecutiveRuns,
  dayKey,
  daysBetweenKeys,
  deriveStats,
  formatClock,
  formatDuration,
  hasCleanWeek,
  hasComeback,
  hasFullLogDay,
  isFastComplete,
  levelFromXp,
  newlyEarnedBadges,
  scoreMeal,
  shiftDayKey,
  stageForLevel,
  streakHealth,
  streakMultiplier,
  targetHoursFor,
  totalXpForLevel,
  xpForFast,
  xpForMeal,
} from '../fastquest/engine.js';

// --- helpers ---------------------------------------------------------------

/** Local-noon ISO timestamp for a YYYY-MM-DD key, so dayKey() round-trips it. */
function atNoon(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
}

function fast(key, { completed = true, durationMin = 960, targetHours = 16 } = {}) {
  return { id: key, endedAt: atNoon(key), startedAt: atNoon(key), completed, durationMin, targetHours };
}

function meal(key, score = 8) {
  return { id: `${key}-${score}-${Math.random()}`, at: atNoon(key), score, tags: [] };
}

// --- protocols -------------------------------------------------------------

test('targetHoursFor resolves known protocols and clamps custom', () => {
  assert.equal(targetHoursFor('16:8'), 16);
  assert.equal(targetHoursFor('OMAD'), 23);
  assert.equal(targetHoursFor('custom', 18), 18);
  assert.equal(targetHoursFor('custom', 2), 12, 'clamps below minimum');
  assert.equal(targetHoursFor('custom', 40), 24, 'clamps above maximum');
  assert.equal(targetHoursFor('nonsense'), 16, 'falls back to the default protocol');
});

// --- meal scoring ----------------------------------------------------------

test('scoreMeal starts neutral and moves with tags', () => {
  assert.equal(scoreMeal([]), 5);
  assert.equal(scoreMeal(['protein']), 7);
  assert.equal(scoreMeal(['fried']), 3);
  assert.equal(scoreMeal(['protein', 'fried']), 5, 'good and bad cancel');
});

test('scoreMeal clamps at both ends', () => {
  const allGood = MEAL_TAGS.filter((t) => t.group === 'good').map((t) => t.id);
  const allBad = MEAL_TAGS.filter((t) => t.group === 'bad').map((t) => t.id);
  assert.equal(scoreMeal(allGood), 10);
  assert.equal(scoreMeal(allBad), 0);
});

test('scoreMeal ignores unknown tags', () => {
  assert.equal(scoreMeal(['not-a-real-tag', 'protein']), 7);
});

test('xpForMeal is never negative, even for the worst meal', () => {
  const allBad = MEAL_TAGS.filter((t) => t.group === 'bad').map((t) => t.id);
  assert.equal(xpForMeal(scoreMeal(allBad)), 0);
  assert.equal(xpForMeal(10), 30);
  assert.ok(xpForMeal(scoreMeal([])) > 0, 'logging anything earns something');
});

// --- fast scoring ----------------------------------------------------------

test('xpForFast awards the full base for hitting the target exactly', () => {
  assert.equal(xpForFast(16, 16 * 60, 0), 96);
  assert.equal(xpForFast(18, 18 * 60, 0), 108);
});

test('xpForFast gives partial credit for ending early', () => {
  // 900/960 of the way through 16h: 96 * 0.9375 * 0.5 = 45
  assert.equal(xpForFast(16, 900, 0), 45);
  assert.equal(xpForFast(16, 0, 0), 0);
  assert.ok(xpForFast(16, 480, 0) > 0, 'honesty is never worth zero when you did the time');
});

test('xpForFast overtime bonus is capped', () => {
  // 5h over target would be 40 x 2 XP uncapped; the cap holds it at 40.
  assert.equal(xpForFast(16, 21 * 60, 0), 96 + 40);
  assert.equal(xpForFast(16, 17 * 60, 0), 96 + 8, '1h over = 4 blocks of 15m x 2 XP');
});

test('xpForFast is hard-capped at 24 hours — extreme fasting earns nothing extra', () => {
  const atCap = xpForFast(16, 24 * 60, 0);
  assert.equal(xpForFast(16, 30 * 60, 0), atCap);
  assert.equal(xpForFast(16, 100 * 60, 0), atCap);
  assert.equal(xpForFast(16, 60 * 24 * 7, 0), atCap, 'a week logged as one fast earns 24h of XP');
});

test('streakMultiplier ramps then plateaus', () => {
  assert.equal(streakMultiplier(0), 1);
  assert.equal(streakMultiplier(1), 1);
  assert.ok(Math.abs(streakMultiplier(2) - 1.05) < 1e-9);
  assert.equal(streakMultiplier(11), 1.5);
  assert.equal(streakMultiplier(500), 1.5, 'never exceeds the ceiling');
});

test('xpForFast applies the streak multiplier', () => {
  assert.equal(xpForFast(16, 16 * 60, 11), Math.round(96 * 1.5));
  assert.ok(xpForFast(16, 16 * 60, 5) > xpForFast(16, 16 * 60, 1));
});

test('isFastComplete compares against the target', () => {
  assert.equal(isFastComplete(16, 960), true);
  assert.equal(isFastComplete(16, 959), false);
});

// --- levels ----------------------------------------------------------------

test('levelFromXp starts at level 1 with zero XP', () => {
  const l = levelFromXp(0);
  assert.equal(l.level, 1);
  assert.equal(l.title, 'Sprout');
  assert.equal(l.xpIntoLevel, 0);
});

test('levelFromXp respects exact thresholds', () => {
  for (const n of [2, 3, 5, 10, 20]) {
    const threshold = totalXpForLevel(n);
    assert.equal(levelFromXp(threshold).level, n, `exactly ${threshold} XP is level ${n}`);
    assert.equal(levelFromXp(threshold - 1).level, n - 1, `one XP short stays at ${n - 1}`);
  }
});

test('levelFromXp thresholds increase monotonically', () => {
  for (let n = 1; n < 40; n++) {
    assert.ok(totalXpForLevel(n + 1) > totalXpForLevel(n), `level ${n + 1} costs more than ${n}`);
  }
});

test('levelFromXp reports coherent progress', () => {
  const l = levelFromXp(200);
  assert.equal(l.level, 2);
  assert.equal(l.xpIntoLevel + l.xpToNextLevel, l.xpForNextLevel);
  assert.ok(l.progress > 0 && l.progress < 1);
});

test('levelFromXp handles junk input', () => {
  assert.equal(levelFromXp(undefined).level, 1);
  assert.equal(levelFromXp(-500).level, 1);
});

test('titles keep going past the named list', () => {
  assert.match(levelFromXp(totalXpForLevel(25)).title, /Ascendant/);
});

// --- creature stages -------------------------------------------------------

test('stageForLevel advances at the documented thresholds', () => {
  assert.equal(stageForLevel(1).id, 'blob');
  assert.equal(stageForLevel(4).id, 'blob');
  assert.equal(stageForLevel(5).id, 'sprout');
  assert.equal(stageForLevel(10).id, 'runner');
  assert.equal(stageForLevel(15).id, 'winged');
  assert.equal(stageForLevel(20).id, 'ascended');
  assert.equal(stageForLevel(999).id, 'ascended');
});

// --- dates -----------------------------------------------------------------

test('shiftDayKey crosses month and year boundaries', () => {
  assert.equal(shiftDayKey('2026-01-31', 1), '2026-02-01');
  assert.equal(shiftDayKey('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDayKey('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDayKey('2024-03-01', -1), '2024-02-29', 'leap year');
});

test('daysBetweenKeys survives a DST transition', () => {
  // US DST forward: 2026-03-08. Anchoring at noon keeps this exactly 1 day.
  assert.equal(daysBetweenKeys('2026-03-07', '2026-03-08'), 1);
  assert.equal(daysBetweenKeys('2026-11-01', '2026-11-02'), 1);
  assert.equal(daysBetweenKeys('2026-01-01', '2026-01-08'), 7);
});

test('dayKey uses local calendar days', () => {
  assert.equal(dayKey(new Date(2026, 7, 22, 23, 30)), '2026-08-22', 'late night is still today');
  assert.equal(dayKey(new Date(2026, 7, 22, 0, 5)), '2026-08-22');
});

// --- streaks ---------------------------------------------------------------

test('consecutiveRuns splits on gaps', () => {
  const runs = consecutiveRuns(['2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07']);
  assert.deepEqual(runs.map((r) => r.length), [2, 3]);
});

test('computeStreak counts an unbroken run ending today', () => {
  const days = ['2026-01-01', '2026-01-02', '2026-01-03'];
  assert.deepEqual(computeStreak(days, '2026-01-03'), { current: 3, best: 3 });
});

test('computeStreak keeps the streak alive if today is not logged yet', () => {
  const days = ['2026-01-01', '2026-01-02', '2026-01-03'];
  assert.equal(computeStreak(days, '2026-01-04').current, 3, 'yesterday still counts');
  assert.equal(computeStreak(days, '2026-01-05').current, 0, 'a full missed day breaks it');
});

test('computeStreak resets current but preserves best', () => {
  const days = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-10'];
  const streak = computeStreak(days, '2026-01-10');
  assert.equal(streak.current, 1);
  assert.equal(streak.best, 3);
});

test('computeStreak handles an empty log', () => {
  assert.deepEqual(computeStreak([], '2026-01-01'), { current: 0, best: 0 });
});

test('computeStreak deduplicates repeated days', () => {
  const days = ['2026-01-01', '2026-01-01', '2026-01-02'];
  assert.equal(computeStreak(days, '2026-01-02').current, 2);
});

test('streakHealth maps to creature moods', () => {
  assert.equal(streakHealth(0, false), 'broken');
  assert.equal(streakHealth(5, false), 'wobbly');
  assert.equal(streakHealth(5, true), 'healthy');
});

// --- derived stats ---------------------------------------------------------

test('deriveStats summarises an empty state without throwing', () => {
  const stats = deriveStats({ fasts: [], meals: [], xp: 0 }, '2026-01-01');
  assert.equal(stats.totalFasts, 0);
  assert.equal(stats.completionRate, 0);
  assert.equal(stats.avgMealScore, null);
  assert.equal(stats.level, 1);
});

test('deriveStats counts fasts, meals and completion rate', () => {
  const state = {
    xp: 300,
    fasts: [fast('2026-01-01'), fast('2026-01-02', { completed: false, durationMin: 400 })],
    meals: [meal('2026-01-01', 8), meal('2026-01-02', 6)],
  };
  const stats = deriveStats(state, '2026-01-02');
  assert.equal(stats.totalFasts, 2);
  assert.equal(stats.completedFasts, 1);
  assert.equal(stats.completionRate, 0.5);
  assert.equal(stats.avgMealScore, 7);
  assert.equal(stats.streak.current, 2, 'an incomplete fast day still counts via its meal');
  assert.equal(stats.level, levelFromXp(300).level);
});

// --- badges ----------------------------------------------------------------

test('every badge is locked for a brand new player', () => {
  const empty = { fasts: [], meals: [], xp: 0, badges: {} };
  for (const badge of BADGES) {
    assert.equal(badge.earned(empty, '2026-01-01'), false, `${badge.id} should start locked`);
  }
});

test('fast-count badges unlock at their thresholds', () => {
  const make = (n) => ({ fasts: Array.from({ length: n }, (_, i) => fast(shiftDayKey('2026-01-01', i))), meals: [] });
  const earnedIn = (state) => BADGES.filter((b) => b.earned(state, '2026-06-01')).map((b) => b.id);
  assert.ok(earnedIn(make(1)).includes('first-fast'));
  assert.ok(!earnedIn(make(4)).includes('fasts-5'));
  assert.ok(earnedIn(make(5)).includes('fasts-5'));
  assert.ok(earnedIn(make(25)).includes('fasts-25'));
});

test('duration badges use the longest fast', () => {
  const state = { fasts: [fast('2026-01-01', { durationMin: 20 * 60 })], meals: [] };
  const ids = BADGES.filter((b) => b.earned(state, '2026-01-01')).map((b) => b.id);
  assert.ok(ids.includes('hours-20'));
  assert.ok(!ids.includes('hours-24'));

  const longer = { fasts: [fast('2026-01-01', { durationMin: 24 * 60 })], meals: [] };
  assert.ok(BADGES.find((b) => b.id === 'hours-24').earned(longer, '2026-01-01'));
});

test('streak badges use the best streak, not the current one', () => {
  const days = Array.from({ length: 7 }, (_, i) => shiftDayKey('2026-01-01', i));
  const state = { fasts: days.map((d) => fast(d)), meals: [] };
  // Checked from far in the future: the current streak is 0 but best is still 7.
  assert.ok(BADGES.find((b) => b.id === 'streak-7').earned(state, '2026-09-01'));
});

test('hasCleanWeek needs seven straight logged days averaging 7+', () => {
  const week = (scores) => ({
    meals: scores.map((s, i) => meal(shiftDayKey('2026-01-01', i), s)),
    fasts: [],
  });
  assert.equal(hasCleanWeek(week([8, 8, 8, 8, 8, 8, 8])), true);
  assert.equal(hasCleanWeek(week([8, 8, 8, 8, 8, 8])), false, 'six days is not a week');
  assert.equal(hasCleanWeek(week([5, 5, 5, 5, 5, 5, 5])), false, 'average too low');

  const gapped = { fasts: [], meals: [0, 1, 2, 4, 5, 6, 7].map((i) => meal(shiftDayKey('2026-01-01', i), 9)) };
  assert.equal(hasCleanWeek(gapped), false, 'a missed day breaks the window');
});

test('hasFullLogDay wants a completed fast plus two meals on the same day', () => {
  assert.equal(hasFullLogDay({
    fasts: [fast('2026-01-01')],
    meals: [meal('2026-01-01'), meal('2026-01-01')],
  }), true);

  assert.equal(hasFullLogDay({
    fasts: [fast('2026-01-01')],
    meals: [meal('2026-01-01')],
  }), false, 'one meal is not enough');

  assert.equal(hasFullLogDay({
    fasts: [fast('2026-01-01', { completed: false })],
    meals: [meal('2026-01-01'), meal('2026-01-01')],
  }), false, 'the fast has to be completed');

  assert.equal(hasFullLogDay({
    fasts: [fast('2026-01-01')],
    meals: [meal('2026-01-02'), meal('2026-01-02')],
  }), false, 'different days do not combine');
});

test('hasComeback needs a break followed by a rebuilt 3-day run', () => {
  const rebuilt = {
    fasts: ['2026-01-01', '2026-01-02', '2026-01-10', '2026-01-11', '2026-01-12'].map((d) => fast(d)),
    meals: [],
  };
  assert.equal(hasComeback(rebuilt), true);

  const unbroken = {
    fasts: ['2026-01-01', '2026-01-02', '2026-01-03'].map((d) => fast(d)),
    meals: [],
  };
  assert.equal(hasComeback(unbroken), false, 'never broke a streak');

  const weakRebuild = {
    fasts: ['2026-01-01', '2026-01-02', '2026-01-10'].map((d) => fast(d)),
    meals: [],
  };
  assert.equal(hasComeback(weakRebuild), false, 'one day back is not a comeback');
});

test('newlyEarnedBadges only reports badges not already recorded', () => {
  const state = { fasts: [fast('2026-01-01')], meals: [], badges: {} };
  const first = newlyEarnedBadges(state, '2026-01-01');
  assert.ok(first.includes('first-fast'));

  const recorded = { ...state, badges: { 'first-fast': '2026-01-01T12:00:00.000Z' } };
  assert.ok(!newlyEarnedBadges(recorded, '2026-01-01').includes('first-fast'));
});

test('badge ids are unique', () => {
  const ids = BADGES.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
});

// --- formatting ------------------------------------------------------------

test('formatDuration pads minutes', () => {
  assert.equal(formatDuration(964), '16h 04m');
  assert.equal(formatDuration(0), '0h 00m');
  assert.equal(formatDuration(-5), '0h 00m');
});

test('formatClock pads every field', () => {
  assert.equal(formatClock(0), '00:00:00');
  assert.equal(formatClock((16 * 3600 + 4 * 60 + 33) * 1000), '16:04:33');
  assert.equal(formatClock(-1000), '00:00:00', 'never renders negative time');
});
