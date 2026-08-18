/*
 * insights.js — the brain of the budget app.
 *
 * Pure functions only: no DOM, no storage, no clock. Everything takes the
 * data and "today" as arguments so it can be tested deterministically.
 *
 * Classic script on purpose (not an ES module) so index.html works when
 * opened straight off disk. Node tests load it with `new Function`.
 *
 * Money is handled in integer cents everywhere. Dollars only exist at the
 * edges: parsing input and formatting output.
 */
const BudgetEngine = (() => {
  'use strict';

  /* ---------------------------------------------------------------- money */

  const toCents = (dollars) => Math.round(Number(dollars) * 100);
  const toDollars = (c) => c / 100;

  function fmt(c, { sign = false } = {}) {
    const neg = c < 0;
    const s = (Math.abs(c) / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });
    if (neg) return '-' + s;
    return sign ? '+' + s : s;
  }

  /** Whole dollars, for headline numbers where cents are noise. */
  function fmtRound(c) {
    return (c < 0 ? '-' : '') + '$' + Math.round(Math.abs(c) / 100).toLocaleString('en-US');
  }

  /* ----------------------------------------------------------- categories */

  // group drives every roll-up in the app:
  //   fixed = you already owe it     life = you need it
  //   joy   = you chose it           goal = it's future-you's money
  const CATEGORIES = {
    income:        { label: 'Income',           group: 'income', emoji: '💵' },

    rent:          { label: 'Rent / Mortgage',  group: 'fixed',  emoji: '🏠' },
    utilities:     { label: 'Utilities',        group: 'fixed',  emoji: '💡' },
    phone:         { label: 'Phone / Internet', group: 'fixed',  emoji: '📶' },
    insurance:     { label: 'Insurance',        group: 'fixed',  emoji: '🛟' },
    debt:          { label: 'Loans / Debt',     group: 'fixed',  emoji: '🎓' },
    subscriptions: { label: 'Subscriptions',    group: 'fixed',  emoji: '🔁' },
    car:           { label: 'Car / Transit',    group: 'fixed',  emoji: '🚗' },

    groceries:     { label: 'Groceries',        group: 'life',   emoji: '🛒' },
    health:        { label: 'Health',           group: 'life',   emoji: '🩺' },
    home:          { label: 'Home / Stuff',     group: 'life',   emoji: '🧴' },
    pets:          { label: 'Pets',             group: 'life',   emoji: '🐕' },
    gifts:         { label: 'Gifts',            group: 'life',   emoji: '🎁' },
    misc:          { label: 'Misc',             group: 'life',   emoji: '❓' },

    dispensary:    { label: 'Dispensary',       group: 'joy',    emoji: '🌿' },
    alcohol:       { label: 'Liquor Store',     group: 'joy',    emoji: '🍾' },
    bars:          { label: 'Bars / Nightlife', group: 'joy',    emoji: '🍸' },
    clothes:       { label: 'Clothes',          group: 'joy',    emoji: '👕' },
    dining:        { label: 'Restaurants',      group: 'joy',    emoji: '🍜' },
    delivery:      { label: 'Delivery',         group: 'joy',    emoji: '🛵' },
    coffee:        { label: 'Coffee',           group: 'joy',    emoji: '☕' },
    rideshare:     { label: 'Rideshare',        group: 'joy',    emoji: '🚕' },
    entertainment: { label: 'Fun / Events',     group: 'joy',    emoji: '🎟️' },

    savings:       { label: 'Savings / Invest', group: 'goal',   emoji: '📈' },
  };

  const catsIn = (group) =>
    Object.keys(CATEGORIES).filter((k) => CATEGORIES[k].group === group);

  const JOY = catsIn('joy');
  const FIXED = catsIn('fixed');
  const LIFE = catsIn('life');

  const groupOf = (cat) => (CATEGORIES[cat] || CATEGORIES.misc).group;
  const labelOf = (cat) => (CATEGORIES[cat] || CATEGORIES.misc).label;
  const emojiOf = (cat) => (CATEGORIES[cat] || CATEGORIES.misc).emoji;

  /* ------------------------------------------------------ auto-categorize */

  // Ordered: first match wins, so "uber eats" must sit above "uber".
  const RULES = [
    ['delivery',      ['uber eats', 'ubereats', 'doordash', 'door dash', 'grubhub', 'postmates', 'seamless', 'instacart', 'gopuff', 'caviar']],
    ['dispensary',    ['dispensary', 'cannabis', 'weedmaps', 'leafly', 'curaleaf', 'trulieve', 'medmen', 'cresco', 'rise disp', 'sunnyside', 'green thumb', 'budtender', 'thc', 'cookies sf', 'stiiizy', 'tokyo smoke', 'canna']],
    ['alcohol',       ['liquor', 'total wine', 'bevmo', 'wine shop', 'bottle shop', 'spirits', 'abc store', 'binny', 'drizly', 'winery', 'package store']],
    ['bars',          ['tavern', 'pub ', ' pub', 'cocktail', 'nightclub', 'saloon', 'lounge', 'brewery', 'taproom', 'beer garden', 'speakeasy', 'bar &', ' bar', 'bar ']],
    ['coffee',        ['starbucks', 'dunkin', 'peet', 'blue bottle', 'coffee', 'espresso', 'cafe', 'café', 'la colombe']],
    ['clothes',       ['nordstrom', 'zara', 'h&m', 'uniqlo', 'asos', 'lululemon', 'nike', 'adidas', 'urban outfitters', 'madewell', 'j.crew', 'jcrew', 'stitch fix', 'ssense', 'grailed', 'poshmark', 'aritzia', 'everlane', 'abercrombie', 'gap ', 'old navy', 'levi', 'boutique', 'clothing', 'apparel', 'shoe', 'foot locker', 'stockx', 'goat.com']],
    ['subscriptions', ['netflix', 'spotify', 'hulu', 'disney', 'hbo', 'max.com', 'apple.com/bill', 'itunes', 'amazon prime', 'patreon', 'youtube premium', 'adobe', 'icloud', 'dropbox', 'peloton', 'classpass', 'audible', 'substack', 'chatgpt', 'anthropic', 'gym', 'fitness', 'planet fit', 'equinox']],
    ['groceries',     ['trader joe', 'whole foods', 'safeway', 'kroger', 'aldi', 'publix', 'wegmans', 'costco', 'sprouts', 'ralphs', 'giant', 'heb', 'food lion', 'grocery', 'market basket']],
    ['rideshare',     ['uber', 'lyft', 'curb taxi', 'revel']],
    ['dining',        ['restaurant', 'grill', 'kitchen', 'pizza', 'sushi', 'taco', 'bbq', 'diner', 'bistro', 'ramen', 'noodle', 'burger', 'chipotle', 'sweetgreen', 'panera', 'thai', 'deli', 'steakhouse', 'oyster']],
    ['entertainment', ['ticketmaster', 'stubhub', 'axs.com', 'cinema', 'amc ', 'regal', 'concert', 'steam games', 'playstation', 'xbox', 'nintendo', 'bowling', 'dice.fm', 'eventbrite']],
    ['rent',          ['rent', 'landlord', 'property mgmt', 'apartments', 'mortgage']],
    ['utilities',     ['electric', 'gas co', 'water dept', 'utility', 'con ed', 'pg&e', 'duke energy', 'sewer', 'trash']],
    ['phone',         ['verizon', 't-mobile', 'tmobile', 'at&t', 'comcast', 'xfinity', 'spectrum', 'mint mobile', 'google fi', 'internet']],
    ['insurance',     ['insurance', 'geico', 'progressive', 'state farm', 'allstate', 'lemonade']],
    ['debt',          ['loan', 'nelnet', 'mohela', 'sallie mae', 'navient', 'student', 'card payment', 'affirm', 'klarna', 'afterpay']],
    ['car',           ['shell', 'chevron', 'exxon', 'bp ', 'parking', 'toll', 'metro card', 'mta', 'transit', 'jiffy lube', 'auto repair', 'dmv']],
    ['health',        ['pharmacy', 'cvs', 'walgreens', 'rite aid', 'dental', 'dentist', 'clinic', 'medical', 'doctor', 'therapy', 'therapist', 'optometr']],
    ['pets',          ['petco', 'petsmart', 'chewy', 'vet ', 'veterinar']],
    ['home',          ['ikea', 'home depot', 'lowes', 'wayfair', 'target', 'walmart', 'amazon', 'container store']],
    ['income',        ['payroll', 'direct dep', 'salary', 'paycheck', 'deposit from', 'venmo cashout']],
  ];

  /** Best-guess category for a merchant string. Falls back to 'misc'. */
  function categorize(merchant) {
    const m = String(merchant || '').toLowerCase();
    if (!m.trim()) return 'misc';
    for (const [cat, needles] of RULES) {
      for (const n of needles) {
        if (m.includes(n)) return cat;
      }
    }
    return 'misc';
  }

  /* ------------------------------------------------------------ date bits */

  /** '2026-08-18T21:30' or '2026-08-18' -> Date in local time. */
  function parseTs(s) {
    const str = String(s);
    const [datePart, timePart] = str.split('T');
    const [y, mo, d] = datePart.split('-').map(Number);
    const [h, mi] = (timePart || '12:00').split(':').map(Number);
    return new Date(y, mo - 1, d, h || 0, mi || 0);
  }

  const dayKey = (s) => String(s).slice(0, 10);
  const monthKey = (s) => String(s).slice(0, 7);
  const HOUR = 3600 * 1000;
  const DAY = 24 * HOUR;

  const daysInMonth = (y, m /* 1-12 */) => new Date(y, m, 0).getDate();

  function monthBounds(todayISO) {
    const d = parseTs(todayISO);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const total = daysInMonth(y, m);
    const dayOfMonth = d.getDate();
    return {
      key: `${y}-${String(m).padStart(2, '0')}`,
      total,
      dayOfMonth,
      daysLeft: Math.max(1, total - dayOfMonth + 1),
      daysElapsed: Math.max(1, dayOfMonth),
    };
  }

  /** Calendar days spanned by a transaction list, minimum 1. */
  function spanDays(txns) {
    if (!txns.length) return 1;
    const times = txns.map((t) => parseTs(t.ts).getTime());
    const span = (Math.max(...times) - Math.min(...times)) / DAY;
    return Math.max(1, Math.round(span) + 1);
  }

  /* ------------------------------------------------------------- forecast */

  /** Scale a total observed over `days` up to a full year. */
  const annualize = (cents, days) => Math.round((cents / days) * 365);

  /**
   * Future value of investing `monthly` cents every month for `years`.
   * Ordinary annuity, monthly compounding. Default 7% is the usual
   * inflation-adjusted long-run stock guess — a guess, not a promise.
   */
  function futureValue(monthly, years, annualRate = 0.07) {
    const r = annualRate / 12;
    const n = Math.round(years * 12);
    if (r === 0) return Math.round(monthly * n);
    return Math.round(monthly * ((Math.pow(1 + r, n) - 1) / r));
  }

  /* --------------------------------------------------------- aggregations */

  const isExpense = (t) => groupOf(t.category) !== 'income';
  const inMonth = (t, key) => monthKey(t.ts) === key;

  function sum(txns) {
    return txns.reduce((a, t) => a + t.amount, 0);
  }

  function byCategory(txns) {
    const out = {};
    for (const t of txns) out[t.category] = (out[t.category] || 0) + t.amount;
    return out;
  }

  function byGroup(txns) {
    const out = { fixed: 0, life: 0, joy: 0, goal: 0, income: 0 };
    for (const t of txns) out[groupOf(t.category)] += t.amount;
    return out;
  }

  function byMerchant(txns) {
    const out = {};
    for (const t of txns) {
      const k = (t.merchant || 'Unknown').trim();
      if (!out[k]) out[k] = { merchant: k, total: 0, count: 0, category: t.category };
      out[k].total += t.amount;
      out[k].count += 1;
    }
    return Object.values(out).sort((a, b) => b.total - a.total);
  }

  /* ------------------------------------------------------ the money model */

  /**
   * The core question the app exists to answer: what can I spend today
   * without wrecking the month?
   *
   * Fixed bills and goal contributions come off the top whether or not
   * they've hit the account yet — money that's spoken for isn't spendable.
   */
  function budgetPosition(txns, profile, todayISO) {
    const mo = monthBounds(todayISO);
    const monthTxns = txns.filter((t) => inMonth(t, mo.key));
    const spend = monthTxns.filter(isExpense);

    const fixedPlanned = (profile.fixed || []).reduce((a, f) => a + f.amount, 0);
    const goalPlanned = (profile.goals || []).reduce((a, g) => a + (g.monthly || 0), 0);
    const income = profile.monthlyTakeHome || 0;

    const groups = byGroup(spend);
    const flexSpent = groups.joy + groups.life;
    const flexBudget = income - fixedPlanned - goalPlanned;
    const flexLeft = flexBudget - flexSpent;

    const dailyRate = Math.round(flexSpent / mo.daysElapsed);
    const projected = dailyRate * mo.total;

    return {
      month: mo,
      income,
      fixedPlanned,
      goalPlanned,
      flexBudget,
      flexSpent,
      flexLeft,
      safeToday: Math.round(flexLeft / mo.daysLeft),
      dailyRate,
      projected,
      projectedOver: projected - flexBudget,
      joySpent: groups.joy,
      lifeSpent: groups.life,
      // What actually left the account this month, bills included.
      actualOut: sum(spend),
    };
  }

  /** Per-envelope status, with pace so you learn it on the 10th, not the 30th. */
  function envelopeStatus(txns, profile, todayISO) {
    const mo = monthBounds(todayISO);
    const spent = byCategory(txns.filter((t) => inMonth(t, mo.key) && isExpense(t)));
    const envelopes = profile.envelopes || {};

    return Object.keys(envelopes)
      .filter((cat) => envelopes[cat] > 0)
      .map((cat) => {
        const budget = envelopes[cat];
        const used = spent[cat] || 0;
        const pctUsed = budget ? used / budget : 0;
        const pctMonth = mo.dayOfMonth / mo.total;
        const pace = Math.round((used / mo.daysElapsed) * mo.total);
        return {
          category: cat,
          label: labelOf(cat),
          emoji: emojiOf(cat),
          budget,
          used,
          left: budget - used,
          pctUsed,
          // Ahead of pace means you'll blow it before month end at this rate.
          aheadOfPace: pctUsed > pctMonth + 0.1,
          pace,
          paceOver: pace - budget,
        };
      })
      .sort((a, b) => b.pctUsed - a.pctUsed);
  }

  /**
   * Suggest envelope sizes from what you actually did, not from a
   * magazine's 50/30/20 rule. Median month, rounded to $5.
   */
  function suggestEnvelopes(txns) {
    const spend = txns.filter(isExpense);
    const months = [...new Set(spend.map((t) => monthKey(t.ts)))];
    const out = {};
    for (const cat of JOY) {
      const totals = months.map((m) =>
        sum(spend.filter((t) => t.category === cat && monthKey(t.ts) === m))
      );
      if (!totals.length || totals.every((v) => v === 0)) continue;
      totals.sort((a, b) => a - b);
      const mid = Math.floor(totals.length / 2);
      const median =
        totals.length % 2 ? totals[mid] : Math.round((totals[mid - 1] + totals[mid]) / 2);
      if (median > 0) out[cat] = Math.round(median / 500) * 500;
    }
    return out;
  }

  /* -------------------------------------------------------- the detectors */
  /*
   * Each detector returns an insight object or null. Insights are honest
   * arithmetic about what you did — never advice about what you should be.
   *
   *   severity: 'flag'    something is costing more than it looks
   *             'info'    a pattern worth knowing
   *             'win'     you did something well; say so
   */

  const insight = (o) => ({ severity: 'info', ...o });

  /**
   * Transactions that kick off a chain: anchor -> follow-ons within a window.
   *
   * Chains are non-overlapping. A category can be both an anchor and a
   * follow-on (a second bar tab is part of the same night, not a new one),
   * so anything already claimed as a follow-on cannot start its own chain —
   * otherwise one night out would be counted several times over.
   */
  function chains(txns, anchorCats, followCats, windowHours) {
    const sorted = [...txns].sort((a, b) => parseTs(a.ts) - parseTs(b.ts));
    const claimed = new Set();
    const found = [];
    for (let i = 0; i < sorted.length; i++) {
      if (claimed.has(i)) continue;
      const a = sorted[i];
      if (!anchorCats.includes(a.category)) continue;
      const start = parseTs(a.ts).getTime();
      const follows = [];
      for (let j = i + 1; j < sorted.length; j++) {
        const dt = parseTs(sorted[j].ts).getTime() - start;
        if (dt > windowHours * HOUR) break;
        if (dt <= 0 || claimed.has(j)) continue;
        if (followCats.includes(sorted[j].category)) {
          follows.push(sorted[j]);
          claimed.add(j);
        }
      }
      found.push({ anchor: a, follows, followTotal: sum(follows) });
    }
    return found;
  }

  /** Dispensary run, then food within a few hours. The munchies have a price. */
  function munchiesChain(txns) {
    const timed = txns.filter((t) => t.timeKnown !== false);
    const found = chains(timed, ['dispensary'], ['delivery', 'dining', 'groceries', 'coffee'], 6);
    const withFood = found.filter((c) => c.follows.length > 0);
    if (found.length < 3 || withFood.length < 2) return null;

    const rate = withFood.length / found.length;
    const avgFood = Math.round(sum(withFood.map((c) => ({ amount: c.followTotal }))) / withFood.length);
    const avgVisit = Math.round(sum(found.map((c) => c.anchor)) / found.length);
    const annualFood = Math.round(avgFood * withFood.length * (365 / spanDays(timed)));

    return insight({
      id: 'munchies',
      severity: 'flag',
      title: 'The dispensary trip is not the whole bill',
      stat: fmt(avgVisit + avgFood),
      statLabel: 'true cost per visit',
      body:
        `${Math.round(rate * 100)}% of your dispensary runs (${withFood.length} of ${found.length}) ` +
        `are followed by a food order within 6 hours, averaging ${fmt(avgFood)}. ` +
        `So a ${fmt(avgVisit)} visit really runs ${fmt(avgVisit + avgFood)}. ` +
        `The food half alone is about ${fmtRound(annualFood)} a year.`,
      fix: 'Eat before you go, or budget the visit at its real number instead of the receipt number.',
    });
  }

  /** A bar tab is rarely the last charge of the night. */
  function nightOutMultiplier(txns) {
    const timed = txns.filter((t) => t.timeKnown !== false);
    const found = chains(
      timed,
      ['bars'],
      ['bars', 'rideshare', 'delivery', 'dining', 'clothes', 'entertainment'],
      8
    );
    if (found.length < 3) return null;

    const anchorAvg = Math.round(sum(found.map((c) => c.anchor)) / found.length);
    const totalAvg = Math.round(
      found.reduce((a, c) => a + c.anchor.amount + c.followTotal, 0) / found.length
    );
    if (totalAvg <= anchorAvg * 1.15) return null;

    const mult = (totalAvg / anchorAvg).toFixed(1);
    const tail = {};
    for (const c of found) {
      for (const f of c.follows) tail[f.category] = (tail[f.category] || 0) + f.amount;
    }
    const worst = Object.entries(tail).sort((a, b) => b[1] - a[1])[0];

    return insight({
      id: 'night-out',
      severity: 'flag',
      title: `A night out costs ${mult}× the bar tab`,
      stat: fmt(totalAvg),
      statLabel: 'average night, all in',
      body:
        `Across ${found.length} nights, the bar itself averaged ${fmt(anchorAvg)} but the night ` +
        `averaged ${fmt(totalAvg)} once the next 8 hours are counted. ` +
        (worst ? `Biggest tail category: ${labelOf(worst[0])} at ${fmt(worst[1])} total.` : ''),
      fix: `When you budget a night out, budget ${fmt(totalAvg)}. That's the actual price.`,
    });
  }

  /** Late-night discretionary spending: the 10pm-to-4am problem. */
  function lateNight(txns) {
    const timed = txns.filter((t) => t.timeKnown !== false && groupOf(t.category) === 'joy');
    if (timed.length < 10) return null;
    const late = timed.filter((t) => {
      const h = parseTs(t.ts).getHours();
      return h >= 22 || h < 4;
    });
    const total = sum(timed);
    const lateTotal = sum(late);
    if (!total || lateTotal / total < 0.15 || late.length < 3) return null;

    const cats = byCategory(late);
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];

    return insight({
      id: 'late-night',
      severity: 'flag',
      title: 'After 10pm you spend differently',
      stat: `${Math.round((lateTotal / total) * 100)}%`,
      statLabel: 'of fun money spent after 10pm',
      body:
        `${late.length} transactions worth ${fmt(lateTotal)} landed between 10pm and 4am. ` +
        (top ? `Mostly ${labelOf(top[0])} (${fmt(top[1])}). ` : '') +
        `Average late-night charge: ${fmt(Math.round(lateTotal / late.length))}, ` +
        `versus ${fmt(Math.round((total - lateTotal) / (timed.length - late.length)))} the rest of the day.`,
      fix: 'Not a moral failing — just move the card out of the phone wallet after 10.',
    });
  }

  /** Payday euphoria: the 72 hours after money lands. */
  function paydayCliff(txns, profile) {
    const paydays = txns.filter((t) => groupOf(t.category) === 'income').map((t) => parseTs(t.ts));
    if (paydays.length < 2) return null;
    const flex = txns.filter((t) => isExpense(t) && groupOf(t.category) === 'joy');
    if (flex.length < 10) return null;

    const inWindow = flex.filter((t) => {
      const time = parseTs(t.ts).getTime();
      return paydays.some((p) => {
        const dt = time - p.getTime();
        return dt >= 0 && dt <= 3 * DAY;
      });
    });
    if (inWindow.length < 3) return null;

    const windowDays = paydays.length * 3;
    const totalDays = spanDays(flex);
    const otherDays = Math.max(1, totalDays - windowDays);
    const windowRate = sum(inWindow) / windowDays;
    const otherRate = (sum(flex) - sum(inWindow)) / otherDays;
    if (!otherRate || windowRate < otherRate * 1.6) return null;

    return insight({
      id: 'payday-cliff',
      severity: 'flag',
      title: 'Payday week is a different budget',
      stat: `${(windowRate / otherRate).toFixed(1)}×`,
      statLabel: 'spending rate after payday',
      body:
        `In the 72 hours after each paycheck you spend ${fmt(Math.round(windowRate))}/day on fun, ` +
        `versus ${fmt(Math.round(otherRate))}/day the rest of the time. ` +
        `That front-loading is why the last week of the month feels tight.`,
      fix: 'Move the fun-money transfer to the day after payday, then spend only from that.',
    });
  }

  /** Friday night through Sunday. */
  function weekendSkew(txns) {
    const joy = txns.filter((t) => isExpense(t) && groupOf(t.category) === 'joy');
    if (joy.length < 12) return null;
    const weekend = joy.filter((t) => {
      const d = parseTs(t.ts);
      const day = d.getDay(); // 0 Sun .. 6 Sat
      if (day === 6 || day === 0) return true;
      return day === 5 && d.getHours() >= 17;
    });
    const total = sum(joy);
    const share = total ? sum(weekend) / total : 0;
    if (share < 0.5) return null;

    return insight({
      id: 'weekend',
      severity: 'info',
      title: 'Your money has a weekend',
      stat: `${Math.round(share * 100)}%`,
      statLabel: 'of fun money spent Fri night–Sun',
      body:
        `${fmt(sum(weekend))} of ${fmt(total)} in discretionary spending happens in about 2.5 days ` +
        `out of 7. Weekly average for those days: ${fmt(Math.round(sum(weekend) / Math.max(1, spanDays(joy) / 7)))}.`,
      fix: 'Budget weekly instead of monthly. A weekend number is easier to hold than a 30-day one.',
    });
  }

  /** Recurring charges you forgot about. */
  function subscriptionCreep(txns) {
    const spend = txns.filter(isExpense);
    const groups = {};
    for (const t of spend) {
      const k = (t.merchant || '').trim().toLowerCase();
      if (!k) continue;
      (groups[k] = groups[k] || []).push(t);
    }

    const recurring = [];
    for (const [, list] of Object.entries(groups)) {
      if (list.length < 2) continue;
      const sorted = [...list].sort((a, b) => parseTs(a.ts) - parseTs(b.ts));
      const amounts = sorted.map((t) => t.amount);
      const avg = sum(sorted) / sorted.length;
      const steady = amounts.every((a) => Math.abs(a - avg) <= Math.max(100, avg * 0.12));
      if (!steady) continue;

      let monthly = true;
      for (let i = 1; i < sorted.length; i++) {
        const gap = (parseTs(sorted[i].ts) - parseTs(sorted[i - 1].ts)) / DAY;
        if (gap < 25 || gap > 35) { monthly = false; break; }
      }
      if (!monthly) continue;
      recurring.push({ merchant: sorted[0].merchant, amount: Math.round(avg), count: sorted.length });
    }

    if (recurring.length < 2) return null;
    recurring.sort((a, b) => b.amount - a.amount);
    const monthlyTotal = recurring.reduce((a, r) => a + r.amount, 0);

    return insight({
      id: 'subscriptions',
      severity: 'flag',
      title: `${recurring.length} charges renew whether you use them or not`,
      stat: fmtRound(monthlyTotal * 12),
      statLabel: 'per year, on autopilot',
      body:
        `Detected as monthly and steady: ` +
        recurring.slice(0, 6).map((r) => `${r.merchant} ${fmt(r.amount)}`).join(', ') +
        (recurring.length > 6 ? `, +${recurring.length - 6} more` : '') +
        `. That's ${fmt(monthlyTotal)}/month.`,
      fix: 'Cancel the ones you cannot remember using in the last 30 days. Keep the rest guilt-free.',
    });
  }

  /** Death by a thousand $9 charges. */
  function smallLeaks(txns) {
    const spend = txns.filter((t) => isExpense(t) && groupOf(t.category) !== 'fixed');
    const small = spend.filter((t) => t.amount <= 1500);
    if (small.length < 15) return null;
    const total = sum(small);
    const share = sum(spend) ? total / sum(spend) : 0;
    const days = spanDays(spend);

    return insight({
      id: 'small-leaks',
      severity: 'info',
      title: 'Small charges, big total',
      stat: fmtRound(annualize(total, days)),
      statLabel: 'per year in sub-$15 charges',
      body:
        `${small.length} transactions under $15 add up to ${fmt(total)} — ` +
        `${Math.round(share * 100)}% of your non-bill spending. ` +
        `Average ${fmt(Math.round(total / small.length))}, about ${(small.length / days * 7).toFixed(1)} per week.`,
      fix: 'These are the hardest to notice and the easiest to cut without feeling it.',
    });
  }

  /** The honest annual number on the fun categories, plus what it could be instead. */
  function joyCost(txns) {
    const joy = txns.filter((t) => isExpense(t) && groupOf(t.category) === 'joy');
    if (joy.length < 8) return null;
    const days = spanDays(joy);
    const annual = annualize(sum(joy), days);
    const monthly = Math.round(annual / 12);
    const cats = byCategory(joy);
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const fv = futureValue(monthly, 10);

    return insight({
      id: 'joy-cost',
      severity: 'info',
      title: 'What the fun actually runs',
      stat: fmtRound(annual),
      statLabel: 'per year across joy categories',
      body:
        `Top three: ` +
        top.map(([c, v]) => `${labelOf(c)} ${fmtRound(annualize(v, days))}/yr`).join(', ') +
        `. At ${fmt(monthly)}/month, invested instead at a 7% average return, that's ` +
        `${fmtRound(fv)} in 10 years.`,
      fix:
        'Not an argument to quit. It is the price tag, so you can decide if it is worth it — ' +
        'and it usually partly is.',
    });
  }

  /** Where the money concentrates. */
  function topMerchant(txns) {
    const spend = txns.filter((t) => isExpense(t) && groupOf(t.category) !== 'fixed');
    if (spend.length < 10) return null;
    const merchants = byMerchant(spend);
    const top = merchants[0];
    if (!top || top.count < 3) return null;
    const days = spanDays(spend);

    return insight({
      id: 'top-merchant',
      severity: 'info',
      title: `${top.merchant} is your most expensive habit`,
      stat: fmtRound(annualize(top.total, days)),
      statLabel: 'per year at one place',
      body:
        `${top.count} visits totaling ${fmt(top.total)}, averaging ${fmt(Math.round(top.total / top.count))} each. ` +
        `That is ${Math.round((top.total / sum(spend)) * 100)}% of your non-bill spending at a single merchant.`,
    });
  }

  /** Say something true and good, or the app gets deleted in a week. */
  function wins(txns, profile, todayISO) {
    const out = [];
    const mo = monthBounds(todayISO);
    const monthSpend = txns.filter((t) => inMonth(t, mo.key) && isExpense(t));

    // No-spend streak.
    const days = [...new Set(monthSpend.map((t) => dayKey(t.ts)))];
    let streak = 0;
    let best = 0;
    for (let i = 1; i <= mo.dayOfMonth; i++) {
      const key = `${mo.key}-${String(i).padStart(2, '0')}`;
      if (days.includes(key)) streak = 0;
      else { streak++; best = Math.max(best, streak); }
    }
    if (best >= 3) {
      out.push(insight({
        id: 'streak',
        severity: 'win',
        title: `${best} days in a row with zero spending`,
        stat: `${best}`,
        statLabel: 'no-spend days this month',
        body: 'That is the whole trick, and you already do it. More of those days is the entire plan.',
      }));
    }

    // Envelopes held.
    const env = envelopeStatus(txns, profile, todayISO);
    const held = env.filter((e) => !e.aheadOfPace && e.used > 0);
    if (held.length >= 2) {
      out.push(insight({
        id: 'on-pace',
        severity: 'win',
        title: `${held.length} envelopes are on pace`,
        stat: held.map((e) => e.emoji).join(' '),
        statLabel: held.map((e) => e.label).join(', '),
        body: `You are inside budget on ${held.map((e) => e.label).join(', ')} with ${mo.daysLeft} days left.`,
      }));
    }

    return out;
  }

  /** Retirement reality check, stated as arithmetic rather than a lecture. */
  function retirementGap(profile) {
    const { age, monthlyTakeHome, retirementSaved } = profile;
    if (!age || !monthlyTakeHome || retirementSaved == null) return null;
    const annualIncome = monthlyTakeHome * 12;
    // Common rule of thumb: roughly 2x annual income saved by 35, 3x by 40.
    const target = Math.round(annualIncome * (age >= 40 ? 3 : 2));
    const gap = target - retirementSaved;
    if (gap <= 0) {
      return insight({
        id: 'retirement',
        severity: 'win',
        title: 'You are ahead of the age-36 benchmark',
        stat: fmtRound(retirementSaved),
        statLabel: 'invested',
        body: `The common rule of thumb wants about ${fmtRound(target)} by now. You are past it.`,
      });
    }
    const monthlyToClose = Math.round(gap / (12 * 5));
    return insight({
      id: 'retirement',
      severity: 'info',
      title: 'The age-36 benchmark, without the guilt trip',
      stat: fmtRound(gap),
      statLabel: 'behind the common rule of thumb',
      body:
        `A widely used rule of thumb suggests ~${age >= 40 ? '3' : '2'}× income invested by your age ` +
        `(${fmtRound(target)} for you); you have ${fmtRound(retirementSaved)}. ` +
        `It is a rough heuristic, not a law — plenty of people close it later.`,
      fix: `Closing it over 5 years takes about ${fmt(monthlyToClose)}/month, before any employer match or growth.`,
    });
  }

  /* -------------------------------------------------------------- assemble */

  function detect(txns, profile, todayISO) {
    const list = [
      munchiesChain(txns),
      nightOutMultiplier(txns),
      paydayCliff(txns, profile),
      lateNight(txns),
      subscriptionCreep(txns),
      weekendSkew(txns),
      smallLeaks(txns),
      joyCost(txns),
      topMerchant(txns),
      retirementGap(profile),
      ...wins(txns, profile, todayISO),
    ].filter(Boolean);

    const rank = { flag: 0, info: 1, win: 2 };
    return list.sort((a, b) => rank[a.severity] - rank[b.severity]);
  }

  function analyze(txns, profile, todayISO) {
    const clean = [...txns].sort((a, b) => parseTs(b.ts) - parseTs(a.ts));
    return {
      position: budgetPosition(clean, profile, todayISO),
      envelopes: envelopeStatus(clean, profile, todayISO),
      insights: detect(clean, profile, todayISO),
      merchants: byMerchant(clean.filter(isExpense)).slice(0, 12),
      categories: byCategory(clean.filter((t) => inMonth(t, monthBounds(todayISO).key) && isExpense(t))),
    };
  }

  /* ------------------------------------------------------------------ CSV */

  /** Minimal RFC-4180-ish parser: handles quotes and embedded commas. */
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else quoted = false;
        } else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((f) => f.trim() !== ''));
  }

  const HEADERS = {
    date: ['date', 'transaction date', 'posted date', 'post date', 'time'],
    merchant: ['description', 'merchant', 'name', 'payee', 'details', 'memo'],
    amount: ['amount', 'debit', 'value', 'transaction amount'],
    category: ['category', 'type'],
  };

  function findCol(header, keys) {
    const lower = header.map((h) => h.trim().toLowerCase());
    for (const k of keys) {
      const i = lower.indexOf(k);
      if (i !== -1) return i;
    }
    for (const k of keys) {
      const i = lower.findIndex((h) => h.includes(k));
      if (i !== -1) return i;
    }
    return -1;
  }

  /**
   * Import a bank/card CSV. Expects at minimum a date, a description and an
   * amount column under any of the usual names. Outflows may be negative
   * (most banks) or positive (most card exports); we normalize to positive
   * expenses and treat the minority sign as income.
   */
  function importCSV(text, { idPrefix = 'csv' } = {}) {
    const rows = parseCSV(text);
    if (rows.length < 2) return { txns: [], errors: ['No data rows found.'] };

    const header = rows[0];
    const iDate = findCol(header, HEADERS.date);
    const iMerch = findCol(header, HEADERS.merchant);
    const iAmt = findCol(header, HEADERS.amount);
    const iCat = findCol(header, HEADERS.category);

    const errors = [];
    if (iDate === -1) errors.push('No date column found.');
    if (iAmt === -1) errors.push('No amount column found.');
    if (errors.length) return { txns: [], errors };

    const raw = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const rawAmt = String(row[iAmt] || '').replace(/[$,\s]/g, '').replace(/[()]/g, '');
      const negated = /\(/.test(String(row[iAmt] || ''));
      const value = Number(rawAmt);
      if (!Number.isFinite(value) || value === 0) continue;

      const dateStr = String(row[iDate] || '').trim();
      const ts = normalizeDate(dateStr);
      if (!ts) { errors.push(`Row ${r + 1}: could not read date "${dateStr}".`); continue; }

      const merchant = String(row[iMerch] ?? '').trim() || 'Unknown';
      raw.push({
        ts,
        timeKnown: ts.includes('T') && !ts.endsWith('T12:00'),
        merchant,
        signed: toCents(negated ? -value : value),
        hinted: iCat !== -1 ? String(row[iCat] || '').trim().toLowerCase() : '',
      });
    }

    // Whichever sign is rarer is the income side.
    const negatives = raw.filter((r) => r.signed < 0).length;
    const expensesAreNegative = negatives > raw.length / 2;

    const txns = raw.map((r, i) => {
      const isIncome = expensesAreNegative ? r.signed > 0 : r.signed < 0;
      const category = isIncome
        ? 'income'
        : (CATEGORIES[r.hinted] ? r.hinted : categorize(r.merchant));
      return {
        id: `${idPrefix}-${Date.now().toString(36)}-${i}`,
        ts: r.ts,
        timeKnown: r.timeKnown,
        merchant: r.merchant,
        amount: Math.abs(r.signed),
        category,
      };
    });

    return { txns, errors };
  }

  /** Accepts YYYY-MM-DD, MM/DD/YYYY, M/D/YY, with optional time. */
  function normalizeDate(s) {
    const str = String(s).trim();
    if (!str) return null;
    const [datePart, timePartRaw] = str.split(/[T ]/);
    let time = '12:00';
    if (timePartRaw && /^\d{1,2}:\d{2}/.test(timePartRaw)) {
      const [h, m] = timePartRaw.split(':');
      time = `${String(Number(h)).padStart(2, '0')}:${m.slice(0, 2)}`;
    }

    let y, mo, d;
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(datePart)) {
      [y, mo, d] = datePart.split('-').map(Number);
    } else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(datePart)) {
      const [a, b, c] = datePart.split('/').map(Number);
      mo = a; d = b; y = c < 100 ? 2000 + c : c;
    } else return null;

    if (!y || !mo || !d || mo > 12 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${time}`;
  }

  function exportCSV(txns) {
    const esc = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = ['Date,Description,Amount,Category'];
    for (const t of [...txns].sort((a, b) => parseTs(a.ts) - parseTs(b.ts))) {
      const signed = groupOf(t.category) === 'income' ? t.amount : -t.amount;
      lines.push([esc(t.ts), esc(t.merchant), (signed / 100).toFixed(2), esc(t.category)].join(','));
    }
    return lines.join('\n');
  }

  return {
    CATEGORIES, JOY, FIXED, LIFE,
    groupOf, labelOf, emojiOf, catsIn,
    toCents, toDollars, fmt, fmtRound,
    parseTs, dayKey, monthKey, monthBounds, spanDays, daysInMonth,
    annualize, futureValue,
    categorize, normalizeDate,
    sum, byCategory, byGroup, byMerchant, isExpense,
    budgetPosition, envelopeStatus, suggestEnvelopes,
    detect, analyze,
    parseCSV, importCSV, exportCSV,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = BudgetEngine;
