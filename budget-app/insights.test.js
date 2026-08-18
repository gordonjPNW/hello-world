/*
 * Tests for the engine. Run with: node --test
 *
 * insights.js is a classic script so index.html works off disk, so we
 * evaluate it here rather than importing it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./insights.js', import.meta.url), 'utf8');
const E = new Function(`${src}; return BudgetEngine;`)();

const $ = (dollars) => Math.round(dollars * 100);

let seq = 0;
const tx = (ts, merchant, category, dollars, extra = {}) => ({
  id: `t${seq++}`,
  ts,
  merchant,
  category,
  amount: $(dollars),
  timeKnown: true,
  ...extra,
});

const profile = (over = {}) => ({
  name: 'Test',
  age: 36,
  monthlyTakeHome: $(6300),
  retirementSaved: $(52000),
  fixed: [{ name: 'Rent', amount: $(1875) }],
  goals: [{ name: 'Emergency', target: $(15000), saved: $(4200), monthly: $(300) }],
  envelopes: { dispensary: $(150), bars: $(200) },
  ...over,
});

/* ------------------------------------------------------------- formatting */

test('money formatting round-trips through cents', () => {
  assert.equal(E.toCents('12.34'), 1234);
  assert.equal(E.toCents(0.1 + 0.2), 30); // float noise must not leak
  assert.equal(E.fmt(1234), '$12.34');
  assert.equal(E.fmt(-1234), '-$12.34');
  assert.equal(E.fmt(1234, { sign: true }), '+$12.34');
  assert.equal(E.fmtRound(123456), '$1,235');
  assert.equal(E.fmtRound(-99), '-$1');
});

/* ---------------------------------------------------------- categorizing */

test('categorize matches the merchants this app exists for', () => {
  assert.equal(E.categorize('SUNNYSIDE DISPENSARY #4'), 'dispensary');
  assert.equal(E.categorize('Curaleaf Chicago'), 'dispensary');
  assert.equal(E.categorize('TOTAL WINE & MORE'), 'alcohol');
  assert.equal(E.categorize('The Anchor Tavern'), 'bars');
  assert.equal(E.categorize('LULULEMON 0142'), 'clothes');
  assert.equal(E.categorize('StockX'), 'clothes');
});

test('categorize prefers the more specific rule', () => {
  // "uber eats" must not fall through to the rideshare rule
  assert.equal(E.categorize('UBER EATS'), 'delivery');
  assert.equal(E.categorize('UBER *TRIP'), 'rideshare');
});

test('categorize falls back to misc rather than guessing', () => {
  assert.equal(E.categorize('ZZQ7 UNKNOWN LLC'), 'misc');
  assert.equal(E.categorize(''), 'misc');
  assert.equal(E.categorize(null), 'misc');
});

/* ------------------------------------------------------------ date logic */

test('parseTs reads local time and defaults missing clock to midday', () => {
  const d = E.parseTs('2026-08-18T21:30');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7);
  assert.equal(d.getDate(), 18);
  assert.equal(d.getHours(), 21);
  assert.equal(E.parseTs('2026-08-18').getHours(), 12);
});

test('normalizeDate accepts the formats banks actually export', () => {
  assert.equal(E.normalizeDate('2026-08-18'), '2026-08-18T12:00');
  assert.equal(E.normalizeDate('08/18/2026'), '2026-08-18T12:00');
  assert.equal(E.normalizeDate('8/1/26'), '2026-08-01T12:00');
  assert.equal(E.normalizeDate('2026-08-18 21:05:11'), '2026-08-18T21:05');
  assert.equal(E.normalizeDate('not a date'), null);
  assert.equal(E.normalizeDate('13/45/2026'), null);
});

test('monthBounds counts days left inclusive of today', () => {
  const mo = E.monthBounds('2026-02-10');
  assert.equal(mo.key, '2026-02');
  assert.equal(mo.total, 28);
  assert.equal(mo.daysElapsed, 10);
  assert.equal(mo.daysLeft, 19);
  assert.equal(E.monthBounds('2024-02-01').total, 29); // leap year
});

/* -------------------------------------------------------- budget position */

test('budgetPosition takes bills and goals off the top', () => {
  const txns = [
    tx('2026-08-01T09:00', 'Payroll', 'income', 3150),
    tx('2026-08-02T20:00', 'Sunnyside Dispensary', 'dispensary', 80),
    tx('2026-08-03T21:00', 'The Anchor Tavern', 'bars', 120),
    tx('2026-08-04T18:00', 'Trader Joe\'s', 'groceries', 100),
    tx('2026-08-05T08:00', 'Ridgeline Apartments', 'rent', 1875),
  ];
  const p = E.budgetPosition(txns, profile(), '2026-08-10');

  // 6300 income - 1875 fixed - 300 goals
  assert.equal(p.flexBudget, $(4125));
  // joy 200 + life 100; rent is fixed and income is excluded
  assert.equal(p.flexSpent, $(300));
  assert.equal(p.joySpent, $(200));
  assert.equal(p.lifeSpent, $(100));
  assert.equal(p.flexLeft, $(3825));
  // 22 days left in August from the 10th
  assert.equal(p.month.daysLeft, 22);
  assert.equal(p.safeToday, Math.round($(3825) / 22));
});

test('budgetPosition projects the month from the current burn rate', () => {
  const txns = [];
  for (let d = 1; d <= 10; d++) {
    txns.push(tx(`2026-08-${String(d).padStart(2, '0')}T19:00`, 'Bar', 'bars', 50));
  }
  const p = E.budgetPosition(txns, profile(), '2026-08-10');
  assert.equal(p.dailyRate, $(50));
  assert.equal(p.projected, $(50) * 31);
  assert.equal(p.projectedOver, $(50) * 31 - $(4125));
});

test('budgetPosition ignores other months', () => {
  const txns = [
    tx('2026-07-15T19:00', 'Bar', 'bars', 500),
    tx('2026-08-02T19:00', 'Bar', 'bars', 40),
  ];
  assert.equal(E.budgetPosition(txns, profile(), '2026-08-10').flexSpent, $(40));
});

test('safeToday goes negative once the flexible budget is blown', () => {
  const txns = [tx('2026-08-02T19:00', 'Nordstrom', 'clothes', 5000)];
  const p = E.budgetPosition(txns, profile(), '2026-08-10');
  assert.ok(p.flexLeft < 0);
  assert.ok(p.safeToday < 0);
});

/* -------------------------------------------------------------- envelopes */

test('envelopeStatus flags being ahead of pace', () => {
  // $150 dispensary envelope, $120 gone by the 5th of a 31-day month
  const txns = [tx('2026-08-03T20:00', 'Curaleaf', 'dispensary', 120)];
  const [env] = E.envelopeStatus(txns, profile({ envelopes: { dispensary: $(150) } }), '2026-08-05');
  assert.equal(env.category, 'dispensary');
  assert.equal(env.used, $(120));
  assert.equal(env.left, $(30));
  assert.ok(env.aheadOfPace);
  assert.ok(env.paceOver > 0);
});

test('envelopeStatus reports overspend as negative remaining', () => {
  const txns = [tx('2026-08-03T20:00', 'Curaleaf', 'dispensary', 200)];
  const [env] = E.envelopeStatus(txns, profile({ envelopes: { dispensary: $(150) } }), '2026-08-20');
  assert.equal(env.left, $(-50));
  assert.ok(env.pctUsed > 1);
});

test('suggestEnvelopes uses the median month, rounded to $5', () => {
  const txns = [
    tx('2026-06-05T20:00', 'Curaleaf', 'dispensary', 100),
    tx('2026-07-05T20:00', 'Curaleaf', 'dispensary', 152),
    tx('2026-08-05T20:00', 'Curaleaf', 'dispensary', 300),
  ];
  const s = E.suggestEnvelopes(txns);
  assert.equal(s.dispensary, $(150)); // median 152 -> nearest $5
});

/* ------------------------------------------------------------- detectors */

test('munchies chain prices the food that follows a dispensary run', () => {
  const txns = [];
  for (let i = 0; i < 4; i++) {
    const day = String(3 + i * 5).padStart(2, '0');
    txns.push(tx(`2026-08-${day}T19:00`, 'Curaleaf', 'dispensary', 60));
    if (i < 3) txns.push(tx(`2026-08-${day}T21:30`, 'DoorDash', 'delivery', 30));
  }
  const hit = E.detect(txns, profile(), '2026-08-25').find((i) => i.id === 'munchies');
  assert.ok(hit, 'expected a munchies insight');
  assert.match(hit.body, /3 of 4/);
  assert.match(hit.body, /\$30\.00/);
  assert.equal(hit.severity, 'flag');
});

test('munchies chain ignores food ordered the next day', () => {
  const txns = [];
  for (let i = 0; i < 4; i++) {
    const day = String(3 + i * 5).padStart(2, '0');
    const next = String(4 + i * 5).padStart(2, '0');
    txns.push(tx(`2026-08-${day}T19:00`, 'Curaleaf', 'dispensary', 60));
    txns.push(tx(`2026-08-${next}T13:00`, 'DoorDash', 'delivery', 30));
  }
  assert.equal(E.detect(txns, profile(), '2026-08-25').find((i) => i.id === 'munchies'), undefined);
});

test('night-out multiplier counts the tail, not just the bar tab', () => {
  const txns = [];
  for (const day of ['07', '14', '21']) {
    txns.push(tx(`2026-08-${day}T21:00`, 'Nowhere Bar', 'bars', 60));
    txns.push(tx(`2026-08-${day}T23:30`, 'Uber', 'rideshare', 25));
    txns.push(tx(`2026-08-${day}T23:50`, 'DoorDash', 'delivery', 35));
  }
  const hit = E.detect(txns, profile(), '2026-08-25').find((i) => i.id === 'night-out');
  assert.ok(hit, 'expected a night-out insight');
  assert.match(hit.title, /2\.0×/);       // $120 total vs $60 anchor
  assert.match(hit.stat, /\$120\.00/);
});

test('a second bar tab is the same night, not a new one', () => {
  const txns = [];
  for (const day of ['07', '14', '21']) {
    txns.push(tx(`2026-08-${day}T21:00`, 'Nowhere Bar', 'bars', 60));
    txns.push(tx(`2026-08-${day}T22:30`, 'Lost Lake Lounge', 'bars', 40));
    txns.push(tx(`2026-08-${day}T23:30`, 'Uber', 'rideshare', 20));
  }
  const hit = E.detect(txns, profile(), '2026-08-25').find((i) => i.id === 'night-out');
  assert.ok(hit);
  assert.match(hit.body, /Across 3 nights/);   // not 6
  assert.match(hit.body, /averaged \$120\.00/); // 60 + 40 + 20, counted once
});

test('night-out multiplier stays quiet when the bar tab is the whole night', () => {
  const txns = ['07', '14', '21'].map((d) => tx(`2026-08-${d}T21:00`, 'Nowhere Bar', 'bars', 60));
  assert.equal(E.detect(txns, profile(), '2026-08-25').find((i) => i.id === 'night-out'), undefined);
});

test('late-night detector skips transactions with no known time', () => {
  const txns = [];
  for (let d = 1; d <= 12; d++) {
    const day = String(d).padStart(2, '0');
    txns.push(tx(`2026-08-${day}T23:30`, 'StockX', 'clothes', 200, { timeKnown: false }));
  }
  assert.equal(E.detect(txns, profile(), '2026-08-25').find((i) => i.id === 'late-night'), undefined);
});

test('late-night detector fires on real 10pm-to-4am spending', () => {
  const txns = [];
  for (let d = 1; d <= 12; d++) {
    const day = String(d).padStart(2, '0');
    txns.push(tx(`2026-08-${day}T13:00`, 'Sweetgreen', 'dining', 15));
  }
  for (const day of ['02', '09', '16', '23']) {
    txns.push(tx(`2026-08-${day}T23:40`, 'StockX', 'clothes', 220));
  }
  const hit = E.detect(txns, profile(), '2026-08-25').find((i) => i.id === 'late-night');
  assert.ok(hit, 'expected a late-night insight');
  assert.match(hit.body, /Clothes/);
});

test('subscription creep finds steady monthly charges only', () => {
  const txns = [
    tx('2026-06-02T06:00', 'Spotify', 'subscriptions', 11.99),
    tx('2026-07-02T06:00', 'Spotify', 'subscriptions', 11.99),
    tx('2026-08-02T06:00', 'Spotify', 'subscriptions', 11.99),
    tx('2026-06-06T06:00', 'Equinox Fitness', 'subscriptions', 205),
    tx('2026-07-06T06:00', 'Equinox Fitness', 'subscriptions', 205),
    tx('2026-08-06T06:00', 'Equinox Fitness', 'subscriptions', 205),
    // irregular amounts and spacing: a habit, not a subscription
    tx('2026-06-04T20:00', 'Nowhere Bar', 'bars', 40),
    tx('2026-06-19T20:00', 'Nowhere Bar', 'bars', 95),
  ];
  const hit = E.detect(txns, profile(), '2026-08-25').find((i) => i.id === 'subscriptions');
  assert.ok(hit, 'expected a subscriptions insight');
  assert.match(hit.body, /Spotify/);
  assert.match(hit.body, /Equinox Fitness/);
  assert.doesNotMatch(hit.body, /Nowhere Bar/);
  assert.match(hit.title, /^2 charges/);
});

test('retirement gap reports a shortfall as arithmetic, and a surplus as a win', () => {
  const behind = E.detect([], profile({ retirementSaved: $(52000) }), '2026-08-25')
    .find((i) => i.id === 'retirement');
  assert.ok(behind);
  assert.equal(behind.severity, 'info');
  // 2x annual take-home of $75,600 = $151,200 target, $99,200 short
  assert.match(behind.stat, /\$99,200/);

  const ahead = E.detect([], profile({ retirementSaved: $(200000) }), '2026-08-25')
    .find((i) => i.id === 'retirement');
  assert.equal(ahead.severity, 'win');
});

test('detect sorts flags before info before wins', () => {
  const txns = [];
  for (const day of ['07', '14', '21']) {
    txns.push(tx(`2026-08-${day}T21:00`, 'Nowhere Bar', 'bars', 60));
    txns.push(tx(`2026-08-${day}T23:30`, 'Uber', 'rideshare', 25));
  }
  const severities = E.detect(txns, profile(), '2026-08-25').map((i) => i.severity);
  const rank = { flag: 0, info: 1, win: 2 };
  const ranks = severities.map((s) => rank[s]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test('detectors stay silent on thin data instead of inventing patterns', () => {
  const txns = [
    tx('2026-08-01T09:00', 'Payroll', 'income', 3150),
    tx('2026-08-02T20:00', 'Curaleaf', 'dispensary', 60),
  ];
  const ids = E.detect(txns, profile({ retirementSaved: null }), '2026-08-03').map((i) => i.id);
  assert.deepEqual(ids.filter((id) => ['munchies', 'night-out', 'late-night', 'small-leaks'].includes(id)), []);
});

/* -------------------------------------------------------------- forecast */

test('annualize scales an observed window to a year', () => {
  assert.equal(E.annualize($(100), 30), $(1216.67));
  assert.equal(E.annualize($(365), 365), $(365));
});

test('futureValue compounds a monthly contribution', () => {
  // $500/mo for 10y at 7% is the familiar ~$86.5k
  const fv = E.futureValue($(500), 10, 0.07);
  assert.ok(fv > $(85000) && fv < $(88000), `got ${E.fmt(fv)}`);
  assert.equal(E.futureValue($(100), 1, 0), $(1200));
});

/* ------------------------------------------------------------------- CSV */

test('parseCSV handles quoted fields with commas', () => {
  const rows = E.parseCSV('Date,Description,Amount\n2026-08-01,"BAR, THE ANCHOR",-42.10\n');
  assert.deepEqual(rows[1], ['2026-08-01', 'BAR, THE ANCHOR', '-42.10']);
});

test('importCSV normalizes bank exports where outflows are negative', () => {
  const csv = [
    'Date,Description,Amount',
    '08/01/2026,DIRECT DEP PAYROLL,3150.00',
    '08/02/2026,SUNNYSIDE DISPENSARY,-64.25',
    '08/02/2026,DOORDASH,-31.80',
    '08/03/2026,LULULEMON 0142,-188.00',
  ].join('\n');
  const { txns, errors } = E.importCSV(csv);
  assert.deepEqual(errors, []);
  assert.equal(txns.length, 4);
  assert.equal(txns[0].category, 'income');
  assert.equal(txns[0].amount, $(3150));
  assert.equal(txns[1].category, 'dispensary');
  assert.equal(txns[1].amount, $(64.25));   // stored positive
  assert.equal(txns[2].category, 'delivery');
  assert.equal(txns[3].category, 'clothes');
  assert.equal(txns[1].timeKnown, false);   // no clock in the export
});

test('importCSV handles card exports where charges are positive', () => {
  const csv = [
    'Transaction Date,Description,Amount',
    '08/02/2026,CURALEAF,64.25',
    '08/03/2026,TOTAL WINE,52.00',
    '08/04/2026,STOCKX,188.00',
    '08/05/2026,PAYMENT THANK YOU,-300.00',
  ].join('\n');
  const { txns } = E.importCSV(csv);
  assert.equal(txns.filter((t) => t.category === 'income').length, 1);
  assert.equal(txns[0].category, 'dispensary');
  assert.equal(txns[0].amount, $(64.25));
});

test('importCSV reports unreadable rows without dropping the good ones', () => {
  const csv = 'Date,Description,Amount\nnope,BAD ROW,-10.00\n08/02/2026,CURALEAF,-64.25\n';
  const { txns, errors } = E.importCSV(csv);
  assert.equal(txns.length, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /could not read date/);
});

test('importCSV errors clearly when required columns are missing', () => {
  const { txns, errors } = E.importCSV('Foo,Bar\n1,2\n');
  assert.equal(txns.length, 0);
  assert.ok(errors.length >= 1);
});

test('exportCSV round-trips back through importCSV', () => {
  const original = [
    tx('2026-08-01T09:00', 'Payroll', 'income', 3150),
    tx('2026-08-02T20:15', 'Curaleaf', 'dispensary', 64.25),
    tx('2026-08-02T22:40', 'DoorDash', 'delivery', 31.8),
  ];
  const { txns, errors } = E.importCSV(E.exportCSV(original));
  assert.deepEqual(errors, []);
  assert.equal(txns.length, 3);
  for (const t of original) {
    const match = txns.find((x) => x.merchant === t.merchant);
    assert.ok(match, `missing ${t.merchant}`);
    assert.equal(match.amount, t.amount);
    assert.equal(match.category, t.category);
    assert.equal(match.ts, t.ts);
  }
});

/* ------------------------------------------------------------- demo data */

test('the sample history produces the patterns it advertises', () => {
  const demoSrc = readFileSync(new URL('./demo-data.js', import.meta.url), 'utf8');
  const D = new Function(`${demoSrc}; return DemoData;`)();
  const { txns, profile: pro } = D.generate('2026-08-18', 4);

  assert.ok(txns.length > 300, `only ${txns.length} transactions`);
  assert.ok(txns.every((t) => t.amount > 0), 'amounts must be stored positive');
  assert.ok(txns.every((t) => E.CATEGORIES[t.category]), 'every category must be known');
  assert.ok(txns.every((t) => t.ts <= '2026-08-18T23:59'), 'must not generate the future');

  const ids = E.detect(txns, pro, '2026-08-18').map((i) => i.id);
  for (const expected of ['munchies', 'night-out', 'subscriptions', 'weekend', 'joy-cost']) {
    assert.ok(ids.includes(expected), `sample data should surface "${expected}", got ${ids.join(', ')}`);
  }
});

test('analyze returns a complete dashboard payload', () => {
  const txns = [
    tx('2026-08-01T09:00', 'Payroll', 'income', 3150),
    tx('2026-08-02T20:00', 'Curaleaf', 'dispensary', 80),
  ];
  const a = E.analyze(txns, profile(), '2026-08-10');
  assert.ok(a.position && a.envelopes && a.insights && a.merchants && a.categories);
  assert.equal(a.categories.dispensary, $(80));
  assert.equal(a.merchants[0].merchant, 'Curaleaf');
});
