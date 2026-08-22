// FastQuest — state, storage, rendering and event wiring.
//
// All scoring lives in engine.js; this file is the impure half: it reads the clock,
// talks to localStorage, and paints the DOM.

import {
  BADGES, MEAL_TAGS, PROTOCOLS, DEFAULT_PROTOCOL, CUSTOM_MIN_HOURS, CUSTOM_MAX_HOURS,
  clamp, dayKey, deriveStats, formatClock, formatDuration, isFastComplete,
  levelFromXp, newlyEarnedBadges, scoreMeal, shiftDayKey, stageForLevel,
  targetHoursFor, xpForFast, xpForMeal,
} from './engine.js';
import { renderCreature } from './creature.js';

const STORAGE_KEY = 'fastquest.v1';
const THEME_KEY = 'fastquest.theme';
const RING_CIRCUMFERENCE = 2 * Math.PI * 88;

const BADGE_ICONS = {
  'first-fast': '🌱', 'fasts-5': '🔥', 'fasts-25': '⚔️', 'fasts-100': '🏆',
  'streak-7': '📅', 'streak-30': '🗓️', 'streak-100': '💎',
  'hours-20': '🌙', 'hours-24': '🌗', 'clean-week': '🥗',
  'full-log-day': '📓', 'comeback': '💪',
};

const $ = (id) => document.getElementById(id);

// --- state ------------------------------------------------------------------

function defaultState() {
  return {
    v: 1,
    profile: { protocol: DEFAULT_PROTOCOL, customHours: 16, createdAt: new Date().toISOString() },
    activeFast: null,
    fasts: [],
    meals: [],
    xp: 0,
    badges: {},
  };
}

/**
 * Read saved state. Private mode, blocked site data and corrupt JSON all have to
 * degrade to a usable app rather than a blank screen, so everything is guarded.
 */
function loadState() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    storageBlocked = true;
    return defaultState();
  }
  if (!raw) return defaultState();

  try {
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    console.warn('FastQuest: saved data was unreadable, starting fresh');
    return defaultState();
  }
}

/** Fill in anything a future/older/hand-edited payload might be missing. */
function normalizeState(parsed) {
  const base = defaultState();
  if (!parsed || typeof parsed !== 'object') return base;
  return {
    ...base,
    ...parsed,
    profile: { ...base.profile, ...(parsed.profile ?? {}) },
    fasts: Array.isArray(parsed.fasts) ? parsed.fasts : [],
    meals: Array.isArray(parsed.meals) ? parsed.meals : [],
    badges: parsed.badges && typeof parsed.badges === 'object' ? parsed.badges : {},
    xp: Number.isFinite(parsed.xp) ? Math.max(0, parsed.xp) : 0,
    activeFast: parsed.activeFast ?? null,
  };
}

let storageBlocked = false;
let saveTimer = null;

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      if (!storageBlocked) {
        storageBlocked = true;
        toast('Could not save', 'This browser is blocking local storage, so progress will not persist.');
      }
    }
  }, 120);
}

let state = loadState();

// Transient UI state, deliberately not persisted.
let selectedTags = new Set();
let editingMealId = null;
let pendingProtocol = state.profile.protocol;
let tickHandle = null;

// --- theme ------------------------------------------------------------------

function currentTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(theme) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch { /* theme preference is a nicety; losing it is fine */ }
  const select = $('theme-select');
  if (select) select.value = theme;
}

function cycleTheme() {
  const order = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(currentTheme()) + 1) % order.length];
  applyTheme(next);
}

// --- fast lifecycle ---------------------------------------------------------

function startFast() {
  if (state.activeFast) return;
  const protocol = pendingProtocol;
  const customHours = readCustomHours();
  const targetHours = targetHoursFor(protocol, customHours);

  state.activeFast = { startedAt: new Date().toISOString(), protocol, targetHours };
  state.profile.protocol = protocol;
  state.profile.customHours = customHours;

  save();
  renderAll();
  startTicking();
  toast('Fast started', `${targetHours}h target. You've got this.`);
}

function endFast() {
  const active = state.activeFast;
  if (!active) return;

  const startedAt = new Date(active.startedAt);
  const endedAt = new Date();
  const durationMin = Math.max(0, Math.round((endedAt - startedAt) / 60000));
  const completed = isFastComplete(active.targetHours, durationMin);

  if (!completed) {
    const done = formatDuration(durationMin);
    const ok = confirm(
      `You're ${done} into a ${active.targetHours}h fast.\n\n` +
      `End it now? You'll still earn partial XP for the time you did.`,
    );
    if (!ok) return;
  }

  // The multiplier uses the streak as it stood *before* this fast landed.
  const streakBefore = deriveStats(state).streak.current;
  const xp = xpForFast(active.targetHours, durationMin, streakBefore);

  state.fasts.push({
    id: cryptoId(),
    startedAt: active.startedAt,
    endedAt: endedAt.toISOString(),
    targetHours: active.targetHours,
    protocol: active.protocol,
    durationMin,
    completed,
    xp,
  });
  state.activeFast = null;
  addXp(xp);

  stopTicking();
  save();
  renderAll();

  toast(
    completed ? `Fast complete · +${xp} XP` : `Logged ${formatDuration(durationMin)} · +${xp} XP`,
    completed ? `${formatDuration(durationMin)} on a ${active.targetHours}h target.` : 'Partial credit counts.',
  );
  checkBadges();
}

function discardFast() {
  if (!state.activeFast) return;
  if (!confirm('Discard this fast without recording it? No XP either way.')) return;
  state.activeFast = null;
  stopTicking();
  save();
  renderAll();
}

// --- meals ------------------------------------------------------------------

function saveMeal() {
  const tags = [...selectedTags];
  const score = scoreMeal(tags);
  const xp = xpForMeal(score);
  const at = readMealTime();

  const payload = {
    tags,
    score,
    xp,
    at,
    kcal: readOptionalNumber('meal-kcal', 0, 20000),
    protein: readOptionalNumber('meal-protein', 0, 1000),
    note: $('meal-note').value.trim() || null,
  };

  if (editingMealId) {
    const meal = state.meals.find((m) => m.id === editingMealId);
    if (meal) {
      addXp(xp - (meal.xp ?? 0)); // re-score in place rather than double-counting
      Object.assign(meal, payload);
    }
    editingMealId = null;
    toast('Meal updated', `Score ${score}/10.`);
  } else {
    state.meals.push({ id: cryptoId(), ...payload });
    addXp(xp);
    toast(`Meal logged · +${xp} XP`, `Score ${score}/10.`);
  }

  state.meals.sort((a, b) => new Date(a.at) - new Date(b.at));
  resetMealForm();
  save();
  renderAll();
  checkBadges();
}

function editMeal(id) {
  const meal = state.meals.find((m) => m.id === id);
  if (!meal) return;

  editingMealId = id;
  selectedTags = new Set(meal.tags ?? []);
  $('meal-kcal').value = meal.kcal ?? '';
  $('meal-protein').value = meal.protein ?? '';
  $('meal-note').value = meal.note ?? '';
  $('meal-time').value = toLocalInputValue(new Date(meal.at));
  $('meal-form-title').textContent = 'Edit meal';
  $('save-meal').textContent = 'Save changes';
  $('cancel-edit').hidden = false;

  showPanel('log');
  renderTagChips();
  renderScorePreview();
  $('panel-log').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function deleteMeal(id) {
  const index = state.meals.findIndex((m) => m.id === id);
  if (index === -1) return;
  if (!confirm('Delete this meal?')) return;

  addXp(-(state.meals[index].xp ?? 0));
  state.meals.splice(index, 1);
  if (editingMealId === id) resetMealForm();
  save();
  renderAll();
}

function deleteFast(id) {
  const index = state.fasts.findIndex((f) => f.id === id);
  if (index === -1) return;
  if (!confirm('Delete this fast from your history?')) return;

  addXp(-(state.fasts[index].xp ?? 0));
  state.fasts.splice(index, 1);
  save();
  renderAll();
}

function resetMealForm() {
  editingMealId = null;
  selectedTags = new Set();
  $('meal-kcal').value = '';
  $('meal-protein').value = '';
  $('meal-note').value = '';
  $('meal-time').value = '';
  $('meal-form-title').textContent = 'Log a meal';
  $('save-meal').textContent = 'Log meal';
  $('cancel-edit').hidden = true;
  renderTagChips();
  renderScorePreview();
}

// --- xp and badges ----------------------------------------------------------

function addXp(delta) {
  const before = levelFromXp(state.xp).level;
  state.xp = Math.max(0, state.xp + delta);
  const after = levelFromXp(state.xp).level;

  if (after > before) {
    const info = levelFromXp(state.xp);
    const stage = stageForLevel(after);
    const evolved = stage.id !== stageForLevel(before).id;
    toast(
      `Level ${after} · ${info.title}`,
      evolved ? `Your creature evolved into a ${stage.name}.` : 'Keep going.',
    );
  }
}

/**
 * Award any badges the current state qualifies for.
 *
 * Runs on load and after an import as well as after logging, because a restored
 * backup arrives already deserving its badges and would otherwise show none.
 *
 * @param {'each'|'summary'|'none'} announce  how loudly to report what was earned
 */
function checkBadges(announce = 'each') {
  const earned = newlyEarnedBadges(state);
  if (earned.length === 0) return;

  const now = new Date().toISOString();
  for (const id of earned) {
    state.badges[id] = now;
  }

  if (announce === 'each') {
    for (const id of earned) {
      const badge = BADGES.find((b) => b.id === id);
      toast(`Badge · ${badge.name}`, badge.hint);
    }
  } else if (announce === 'summary') {
    // A backfill can unlock a dozen at once; one toast beats a wall of them.
    toast(
      earned.length === 1 ? 'Badge unlocked' : `${earned.length} badges unlocked`,
      earned.map((id) => BADGES.find((b) => b.id === id).name).join(', '),
    );
  }

  save();
  renderProfile();
}

// --- rendering --------------------------------------------------------------

function renderAll() {
  renderHome();
  renderLog();
  renderStats();
  renderProfile();
}

function renderHome() {
  const stats = deriveStats(state);
  const stage = stageForLevel(stats.level);

  renderCreature($('creature'), stats.level, stats.health);
  $('stage-label').textContent = `${stage.name} · Level ${stats.level}`;
  $('topbar-level').textContent = `Level ${stats.level} · ${stats.title}`;

  $('xp-current').textContent = `${stats.totalXp.toLocaleString()} XP`;
  $('xp-next').textContent = `${stats.xpToNextLevel.toLocaleString()} XP to Level ${stats.level + 1}`;
  $('xp-fill').style.width = `${clamp(stats.progress * 100, 0, 100)}%`;

  $('stat-streak').textContent = stats.streak.current;
  $('stat-fasts').textContent = stats.completedFasts;
  $('stat-score').textContent = stats.avgMealScore === null ? '—' : stats.avgMealScore.toFixed(1);

  $('idle-controls').hidden = Boolean(state.activeFast);
  $('active-controls').hidden = !state.activeFast;

  renderProtocolChips();
  renderTimer();
  renderToday();
}

function renderTimer() {
  const active = state.activeFast;
  const fill = $('ring-fill');
  fill.setAttribute('stroke-dasharray', String(RING_CIRCUMFERENCE));

  if (!active) {
    fill.setAttribute('stroke-dashoffset', String(RING_CIRCUMFERENCE));
    fill.classList.remove('ring__fill--over');
    $('ring-time').textContent = '00:00:00';
    $('ring-label').textContent = 'Not fasting';
    return;
  }

  // Derived from timestamps every tick, never accumulated — so closing the app,
  // locking the phone or sleeping the tab can't drift the timer.
  const elapsedMs = Date.now() - new Date(active.startedAt).getTime();
  const targetMs = active.targetHours * 3600000;
  const progress = clamp(elapsedMs / targetMs, 0, 1);

  fill.setAttribute('stroke-dashoffset', String(RING_CIRCUMFERENCE * (1 - progress)));
  fill.classList.toggle('ring__fill--over', elapsedMs >= targetMs);

  $('ring-time').textContent = formatClock(elapsedMs);
  $('ring-label').textContent = elapsedMs >= targetMs
    ? `Target reached · ${active.targetHours}h`
    : `${formatClock(targetMs - elapsedMs)} to ${active.targetHours}h`;
}

function renderProtocolChips() {
  const box = $('protocol-chips');
  box.innerHTML = Object.values(PROTOCOLS).map((p) => `
    <button class="chip" type="button" role="button" data-protocol="${p.id}"
            aria-pressed="${p.id === pendingProtocol}" title="${escapeHtml(p.blurb)}">
      ${escapeHtml(p.label)}
    </button>`).join('');
  $('custom-hours-field').hidden = pendingProtocol !== 'custom';
  $('custom-hours').value = state.profile.customHours;
}

function renderToday() {
  const today = dayKey();
  const items = [];

  for (const fast of state.fasts) {
    if (dayKey(new Date(fast.endedAt)) !== today) continue;
    items.push({
      at: fast.endedAt,
      title: `${fast.completed ? 'Completed' : 'Ended'} a ${fast.targetHours}h fast`,
      sub: `${formatDuration(fast.durationMin)} · ${timeOfDay(fast.endedAt)}`,
      pill: `+${fast.xp} XP`,
      gold: fast.completed,
    });
  }
  for (const meal of state.meals) {
    if (dayKey(new Date(meal.at)) !== today) continue;
    items.push({
      at: meal.at,
      title: meal.note ? escapeHtml(meal.note) : describeTags(meal.tags),
      sub: `Score ${meal.score}/10 · ${timeOfDay(meal.at)}`,
      pill: `+${meal.xp} XP`,
    });
  }

  items.sort((a, b) => new Date(b.at) - new Date(a.at));
  $('today-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  $('today-list').innerHTML = items.length === 0
    ? '<li class="empty">Nothing logged yet today.</li>'
    : items.map((i) => `
      <li>
        <div class="list__main">
          <div class="list__title">${i.title}</div>
          <div class="list__sub">${i.sub}</div>
        </div>
        <span class="pill${i.gold ? ' pill--gold' : ''}">${i.pill}</span>
      </li>`).join('');
}

function renderLog() {
  renderTagChips();
  renderScorePreview();

  const recent = [...state.meals].reverse().slice(0, 25);
  $('meal-list').innerHTML = recent.length === 0
    ? '<li class="empty">No meals logged yet.</li>'
    : recent.map((meal) => `
      <li>
        <div class="list__main">
          <div class="list__title">${meal.note ? escapeHtml(meal.note) : describeTags(meal.tags)}</div>
          <div class="list__sub list__sub--wrap">
            ${shortDate(meal.at)} · ${timeOfDay(meal.at)}${extrasLabel(meal)}
          </div>
        </div>
        <span class="pill${meal.score >= 7 ? '' : meal.score <= 3 ? ' pill--warn' : ''}">${meal.score}/10</span>
        <button class="link-btn" data-edit-meal="${meal.id}" type="button">Edit</button>
        <button class="link-btn" data-delete-meal="${meal.id}" type="button">Delete</button>
      </li>`).join('');
}

function renderTagChips() {
  for (const group of ['good', 'bad']) {
    $(`tags-${group}`).innerHTML = MEAL_TAGS
      .filter((t) => t.group === group)
      .map((t) => `
        <button class="chip${group === 'bad' ? ' chip--bad' : ''}" type="button"
                data-tag="${t.id}" aria-pressed="${selectedTags.has(t.id)}">
          ${escapeHtml(t.label)}
        </button>`).join('');
  }
}

function renderScorePreview() {
  const score = scoreMeal([...selectedTags]);
  const xp = xpForMeal(score);
  $('score-num').textContent = score;
  $('score-xp').textContent = `+${xp} XP`;
  const fill = $('score-fill');
  fill.style.width = `${score * 10}%`;
  fill.style.background = score >= 7 ? 'var(--good)' : score >= 4 ? 'var(--gold)' : 'var(--warn)';
}

function renderStats() {
  const stats = deriveStats(state);

  $('stat-completion').textContent = stats.totalFasts === 0 ? '—' : `${Math.round(stats.completionRate * 100)}%`;
  $('stat-longest').textContent = stats.longestFastMinutes === 0 ? '—' : formatDuration(stats.longestFastMinutes);
  $('stat-best-streak').textContent = stats.streak.best;

  $('fast-chart').innerHTML = fastChartSvg(state.fasts.slice(-30));
  $('meal-chart').innerHTML = mealChartSvg(state.meals, 14);

  const recent = [...state.fasts].reverse().slice(0, 30);
  $('fast-list').innerHTML = recent.length === 0
    ? '<li class="empty">No fasts recorded yet.</li>'
    : recent.map((fast) => `
      <li>
        <div class="list__main">
          <div class="list__title">${formatDuration(fast.durationMin)} · ${fast.targetHours}h target</div>
          <div class="list__sub">${shortDate(fast.endedAt)} · ${fast.completed ? 'Completed' : 'Ended early'}</div>
        </div>
        <span class="pill${fast.completed ? ' pill--gold' : ' pill--warn'}">+${fast.xp} XP</span>
        <button class="link-btn" data-delete-fast="${fast.id}" type="button">Delete</button>
      </li>`).join('');
}

function renderProfile() {
  const earnedCount = BADGES.filter((b) => state.badges[b.id]).length;
  $('badge-count').textContent = `${earnedCount} / ${BADGES.length}`;
  $('badge-grid').innerHTML = BADGES.map((b) => {
    const earned = Boolean(state.badges[b.id]);
    return `
      <div class="badge${earned ? ' badge--earned' : ''}" title="${escapeHtml(b.hint)}">
        <div class="badge__icon" aria-hidden="true">${BADGE_ICONS[b.id] ?? '◆'}</div>
        <div class="badge__name">${escapeHtml(b.name)}</div>
        <div class="badge__hint">${earned ? shortDate(state.badges[b.id]) : escapeHtml(b.hint)}</div>
      </div>`;
  }).join('');

  const select = $('default-protocol');
  if (select.options.length === 0) {
    select.innerHTML = Object.values(PROTOCOLS)
      .map((p) => `<option value="${p.id}">${escapeHtml(p.label)} — ${escapeHtml(p.blurb)}</option>`)
      .join('');
  }
  select.value = state.profile.protocol;
  $('default-custom-hours').value = state.profile.customHours;
}

// --- charts -----------------------------------------------------------------

function fastChartSvg(fasts) {
  if (fasts.length === 0) return '<p class="empty">No fasts yet — your history will chart here.</p>';

  const W = 320, H = 130, PAD_L = 22, PAD_B = 16, PAD_T = 8;
  const plotW = W - PAD_L - 6;
  const plotH = H - PAD_B - PAD_T;

  const topMinutes = Math.max(
    60 * Math.ceil(Math.max(...fasts.map((f) => Math.max(f.durationMin, f.targetHours * 60))) / 60),
    60,
  );
  const y = (minutes) => PAD_T + plotH - (minutes / topMinutes) * plotH;

  const pitch = plotW / fasts.length;
  const barW = Math.max(2, Math.min(pitch * 0.62, 16));

  const bars = fasts.map((f, i) => {
    const cx = PAD_L + pitch * (i + 0.5);
    const top = y(f.durationMin);
    const targetY = y(f.targetHours * 60);
    return `
      <rect class="chart__bar${f.completed ? '' : ' chart__bar--partial'}"
            x="${(cx - barW / 2).toFixed(1)}" y="${top.toFixed(1)}"
            width="${barW.toFixed(1)}" height="${Math.max(1, PAD_T + plotH - top).toFixed(1)}" rx="1.5">
        <title>${shortDate(f.endedAt)} — ${formatDuration(f.durationMin)} of ${f.targetHours}h</title>
      </rect>
      <line class="chart__target" x1="${(cx - barW / 2 - 1.5).toFixed(1)}" x2="${(cx + barW / 2 + 1.5).toFixed(1)}"
            y1="${targetY.toFixed(1)}" y2="${targetY.toFixed(1)}"/>`;
  }).join('');

  const gridHours = [0, topMinutes / 2, topMinutes];
  const grid = gridHours.map((m) => `
    <line class="chart__axis" x1="${PAD_L}" x2="${W - 6}" y1="${y(m).toFixed(1)}" y2="${y(m).toFixed(1)}"/>
    <text class="chart__tick" x="${PAD_L - 4}" y="${(y(m) + 2.5).toFixed(1)}" text-anchor="end">${Math.round(m / 60)}h</text>`).join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
    aria-label="Bar chart of the last ${fasts.length} fasts by length in hours">
    ${grid}${bars}
  </svg>`;
}

function mealChartSvg(meals, days) {
  if (meals.length === 0) return '<p class="empty">No meals yet — your scores will chart here.</p>';

  const W = 320, H = 120, PAD_L = 22, PAD_B = 16, PAD_T = 8;
  const plotW = W - PAD_L - 6;
  const plotH = H - PAD_B - PAD_T;

  const byDay = new Map();
  for (const meal of meals) {
    const key = dayKey(new Date(meal.at));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(meal.score);
  }

  const today = dayKey();
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = shiftDayKey(today, -i);
    const scores = byDay.get(key);
    series.push({ key, value: scores ? scores.reduce((a, b) => a + b, 0) / scores.length : null });
  }

  const pitch = plotW / Math.max(1, series.length - 1);
  const x = (i) => PAD_L + pitch * i;
  const y = (score) => PAD_T + plotH - (score / 10) * plotH;

  // A gap day should break the line rather than interpolate across it.
  const segments = [];
  let current = [];
  series.forEach((point, i) => {
    if (point.value === null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(`${x(i).toFixed(1)},${y(point.value).toFixed(1)}`);
    }
  });
  if (current.length) segments.push(current);

  const lines = segments
    .filter((seg) => seg.length > 1)
    .map((seg) => `<polyline class="chart__line" points="${seg.join(' ')}"/>`)
    .join('');

  const dots = series.map((point, i) => point.value === null ? '' : `
    <circle class="chart__dot" cx="${x(i).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="2.6">
      <title>${point.key} — average ${point.value.toFixed(1)}/10</title>
    </circle>`).join('');

  const grid = [0, 5, 10].map((score) => `
    <line class="chart__axis" x1="${PAD_L}" x2="${W - 6}" y1="${y(score).toFixed(1)}" y2="${y(score).toFixed(1)}"/>
    <text class="chart__tick" x="${PAD_L - 4}" y="${(y(score) + 2.5).toFixed(1)}" text-anchor="end">${score}</text>`).join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"
    aria-label="Line chart of daily average meal score over the last ${days} days">
    ${grid}${lines}${dots}
  </svg>`;
}

// --- data export / import ---------------------------------------------------

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fastquest-backup-${dayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!parsed || !Array.isArray(parsed.fasts) || !Array.isArray(parsed.meals)) {
        throw new Error('not a FastQuest backup');
      }
      if (!confirm('Replace everything currently in this browser with the backup?')) return;
      state = normalizeState(parsed);
      pendingProtocol = state.profile.protocol;
      resetMealForm();
      save();
      renderAll();
      state.activeFast ? startTicking() : stopTicking();
      toast('Backup restored', `${state.fasts.length} fasts, ${state.meals.length} meals.`);
      checkBadges('summary');
    } catch {
      toast('Import failed', "That file doesn't look like a FastQuest backup.");
    }
  };
  reader.onerror = () => toast('Import failed', 'Could not read that file.');
  reader.readAsText(file);
}

function resetData() {
  if (!confirm('Delete all fasts, meals, XP and badges? This cannot be undone.')) return;
  if (!confirm('Really reset? Export a backup first if you might want this data back.')) return;

  state = defaultState();
  pendingProtocol = state.profile.protocol;
  stopTicking();
  resetMealForm();
  save();
  renderAll();
  toast('Reset', 'Fresh start.');
}

// --- toasts -----------------------------------------------------------------

function toast(title, sub = '') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `
    <div class="toast__body">
      <div class="toast__title">${escapeHtml(title)}</div>
      ${sub ? `<div class="toast__sub">${escapeHtml(sub)}</div>` : ''}
    </div>
    <button class="toast__close" type="button" aria-label="Dismiss">×</button>`;
  el.querySelector('.toast__close').addEventListener('click', () => el.remove());
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

// --- ticking ----------------------------------------------------------------

function startTicking() {
  stopTicking();
  if (!state.activeFast) return;
  tickHandle = setInterval(renderTimer, 1000);
}

function stopTicking() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = null;
}

// --- navigation -------------------------------------------------------------

function showPanel(name) {
  for (const tab of document.querySelectorAll('.tab')) {
    const selected = tab.dataset.panel === name;
    tab.setAttribute('aria-selected', String(selected));
    $(`panel-${tab.dataset.panel}`).hidden = !selected;
  }
}

// --- helpers ----------------------------------------------------------------

function cryptoId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function describeTags(tags = []) {
  if (tags.length === 0) return 'Meal';
  const labels = tags
    .map((id) => MEAL_TAGS.find((t) => t.id === id)?.label)
    .filter(Boolean);
  return escapeHtml(labels.slice(0, 3).join(', ') + (labels.length > 3 ? `, +${labels.length - 3}` : ''));
}

function extrasLabel(meal) {
  const bits = [];
  if (Number.isFinite(meal.kcal)) bits.push(`${meal.kcal} kcal`);
  if (Number.isFinite(meal.protein)) bits.push(`${meal.protein}g protein`);
  return bits.length ? ` · ${bits.join(' · ')}` : '';
}

function timeOfDay(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function shortDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
         `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function readMealTime() {
  const raw = $('meal-time').value;
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function readOptionalNumber(id, min, max) {
  const raw = $(id).value.trim();
  if (raw === '') return null;
  const num = Number(raw);
  return Number.isFinite(num) ? clamp(Math.round(num), min, max) : null;
}

function readCustomHours() {
  const num = Number($('custom-hours').value);
  return Number.isFinite(num)
    ? clamp(Math.round(num), CUSTOM_MIN_HOURS, CUSTOM_MAX_HOURS)
    : state.profile.customHours;
}

// --- wiring -----------------------------------------------------------------

function wire() {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => showPanel(tab.dataset.panel));
  }

  $('theme-toggle').addEventListener('click', cycleTheme);
  $('theme-select').addEventListener('change', (e) => applyTheme(e.target.value));

  $('protocol-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-protocol]');
    if (!chip) return;
    pendingProtocol = chip.dataset.protocol;
    renderProtocolChips();
  });

  $('custom-hours').addEventListener('change', () => {
    state.profile.customHours = readCustomHours();
    $('custom-hours').value = state.profile.customHours;
    save();
  });

  $('start-fast').addEventListener('click', startFast);
  $('end-fast').addEventListener('click', endFast);
  $('cancel-fast').addEventListener('click', discardFast);

  for (const group of ['tags-good', 'tags-bad']) {
    $(group).addEventListener('click', (e) => {
      const chip = e.target.closest('[data-tag]');
      if (!chip) return;
      const id = chip.dataset.tag;
      selectedTags.has(id) ? selectedTags.delete(id) : selectedTags.add(id);
      chip.setAttribute('aria-pressed', String(selectedTags.has(id)));
      renderScorePreview();
    });
  }

  $('save-meal').addEventListener('click', saveMeal);
  $('cancel-edit').addEventListener('click', resetMealForm);

  $('meal-list').addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit-meal]');
    if (edit) return editMeal(edit.dataset.editMeal);
    const del = e.target.closest('[data-delete-meal]');
    if (del) return deleteMeal(del.dataset.deleteMeal);
  });

  $('fast-list').addEventListener('click', (e) => {
    const del = e.target.closest('[data-delete-fast]');
    if (del) deleteFast(del.dataset.deleteFast);
  });

  $('default-protocol').addEventListener('change', (e) => {
    state.profile.protocol = e.target.value;
    pendingProtocol = e.target.value;
    save();
    renderHome();
  });

  $('default-custom-hours').addEventListener('change', (e) => {
    const num = Number(e.target.value);
    state.profile.customHours = Number.isFinite(num)
      ? clamp(Math.round(num), CUSTOM_MIN_HOURS, CUSTOM_MAX_HOURS)
      : state.profile.customHours;
    e.target.value = state.profile.customHours;
    save();
    renderHome();
  });

  $('export-data').addEventListener('click', exportData);
  $('import-data').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) importData(file);
    e.target.value = '';
  });
  $('reset-data').addEventListener('click', resetData);

  // Coming back from a backgrounded tab: repaint immediately rather than waiting
  // up to a second for the next tick.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    renderTimer();
    renderHome();
  });
}

function init() {
  applyTheme(currentTheme());
  wire();
  renderAll();
  checkBadges('none');
  if (state.activeFast) startTicking();

  if (storageBlocked) {
    toast('Storage unavailable', 'This browser is blocking local storage, so progress will not be saved.');
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        /* offline support is a bonus; the app works fine without it */
      });
    });
  }
}

init();
