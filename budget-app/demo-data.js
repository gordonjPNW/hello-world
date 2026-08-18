/*
 * demo-data.js — a synthetic but realistic 4-month history.
 *
 * An empty budget app teaches you nothing, so the Setup tab can load a
 * profile that already has the patterns the engine looks for: payday
 * front-loading, weekend clustering, dispensary-then-delivery chains, a
 * bar tab that grows a tail, and a few subscriptions nobody remembers.
 *
 * Seeded PRNG so the same "today" always produces the same history.
 */
const DemoData = (() => {
  'use strict';

  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const between = (r, lo, hi) => Math.round((lo + r() * (hi - lo)) / 25) * 25;

  const DISPENSARIES = ['Sunnyside Dispensary', 'Curaleaf', 'The Green Room Cannabis'];
  const BARS = ['The Anchor Tavern', 'Lost Lake Lounge', 'Half Step Taproom', 'Nowhere Bar'];
  const LIQUOR = ['Total Wine & More', 'Bay Liquor', 'Corner Bottle Shop'];
  const CLOTHES = ['Uniqlo', 'Aritzia', 'Nordstrom', 'StockX', 'Lululemon', 'Grailed'];
  const DELIVERY = ['DoorDash', 'Uber Eats', 'Grubhub'];
  const DINING = ['Tacos El Sol', 'Kaiyo Ramen', 'Milk Bar Diner', 'Sweetgreen'];
  const COFFEE = ['Blue Bottle Coffee', 'Starbucks', 'La Colombe'];
  const GROCERY = ['Trader Joe\'s', 'Safeway', 'Whole Foods'];

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d, h, m) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:${pad(m)}`;

  /**
   * @param {string} todayISO  'YYYY-MM-DD'
   * @param {number} months    how far back to generate
   */
  function generate(todayISO, months = 4) {
    const r = rng(20260818);
    const today = new Date(
      Number(todayISO.slice(0, 4)),
      Number(todayISO.slice(5, 7)) - 1,
      Number(todayISO.slice(8, 10))
    );
    const start = new Date(today);
    start.setMonth(start.getMonth() - months);

    const txns = [];
    let n = 0;
    const add = (d, h, m, merchant, category, dollars) => {
      if (d > today) return;
      txns.push({
        id: `demo-${n++}`,
        ts: iso(d, h, m),
        timeKnown: true,
        merchant,
        amount: Math.round(dollars * 100),
        category,
      });
    };

    const cursor = new Date(start);
    while (cursor <= today) {
      const day = cursor.getDay();
      const dom = cursor.getDate();
      const isFri = day === 5;
      const isSat = day === 6;
      const isWeekend = isFri || isSat || day === 0;

      // --- income: 1st and 15th, take-home ~$3,150 each
      if (dom === 1 || dom === 15) {
        add(cursor, 9, 0, 'Direct Deposit — Payroll', 'income', 3150);
      }

      // --- fixed bills
      if (dom === 1) {
        add(cursor, 8, 0, 'Ridgeline Apartments Rent', 'rent', 1875);
        add(cursor, 8, 5, 'Lemonade Renters Insurance', 'insurance', 18);
      }
      if (dom === 3) add(cursor, 8, 0, 'MOHELA Student Loan', 'debt', 312);
      if (dom === 5) add(cursor, 8, 0, 'PG&E Electric', 'utilities', between(r, 70, 140) / 1);
      if (dom === 7) add(cursor, 8, 0, 'T-Mobile', 'phone', 85);
      if (dom === 8) add(cursor, 8, 0, 'Xfinity Internet', 'phone', 70);
      if (dom === 12) add(cursor, 8, 0, 'Geico Auto Insurance', 'insurance', 142);

      // --- subscriptions nobody audits
      if (dom === 2) add(cursor, 6, 0, 'Spotify', 'subscriptions', 11.99);
      if (dom === 4) add(cursor, 6, 0, 'Netflix', 'subscriptions', 22.99);
      if (dom === 6) add(cursor, 6, 0, 'Equinox Fitness', 'subscriptions', 205);
      if (dom === 9) add(cursor, 6, 0, 'Adobe Creative Cloud', 'subscriptions', 59.99);
      if (dom === 11) add(cursor, 6, 0, 'iCloud+ apple.com/bill', 'subscriptions', 9.99);
      if (dom === 14) add(cursor, 6, 0, 'Peloton', 'subscriptions', 44);
      if (dom === 18) add(cursor, 6, 0, 'Audible', 'subscriptions', 14.95);

      // --- weekday coffee habit
      if (day >= 1 && day <= 5 && r() < 0.72) {
        add(cursor, 8, Math.floor(r() * 50), pick(r, COFFEE), 'coffee', 5.25 + r() * 3);
      }

      // --- groceries
      if ((day === 0 || day === 3) && r() < 0.7) {
        add(cursor, 17, 30, pick(r, GROCERY), 'groceries', 55 + r() * 70);
      }

      // --- payday euphoria window: 72h after the 1st and 15th
      const daysSincePay = dom >= 15 ? dom - 15 : dom - 1;
      const paydayWindow = daysSincePay >= 0 && daysSincePay <= 2;

      // --- dispensary runs, more likely right after payday
      if (r() < (paydayWindow ? 0.42 : 0.13)) {
        const h = 18 + Math.floor(r() * 4);
        add(cursor, h, Math.floor(r() * 59), pick(r, DISPENSARIES), 'dispensary', between(r, 45, 120));
        // ...and the food order that follows about 70% of the time
        if (r() < 0.7) {
          const later = new Date(cursor);
          const fh = h + 1 + Math.floor(r() * 3);
          if (fh < 24) add(later, fh, Math.floor(r() * 59), pick(r, DELIVERY), 'delivery', 24 + r() * 26);
        }
      }

      // --- nights out, weekend-weighted, with a tail
      if (isWeekend && r() < (paydayWindow ? 0.75 : 0.45)) {
        const h = 20 + Math.floor(r() * 2);
        add(cursor, h, Math.floor(r() * 59), pick(r, BARS), 'bars', between(r, 45, 110));
        if (r() < 0.55) add(cursor, 22, Math.floor(r() * 59), pick(r, BARS), 'bars', between(r, 25, 70));
        if (r() < 0.6) add(cursor, 23, 40, 'Uber', 'rideshare', 18 + r() * 22);
        // the 1am clothes order
        if (r() < 0.28) add(cursor, 23, 55, pick(r, CLOTHES), 'clothes', between(r, 60, 240));
        if (r() < 0.35) add(cursor, 23, 20, pick(r, DELIVERY), 'delivery', 22 + r() * 25);
      }

      // --- liquor store runs
      if ((isFri || day === 4) && r() < 0.3) {
        add(cursor, 18, 20, pick(r, LIQUOR), 'alcohol', between(r, 35, 95));
      }

      // --- restaurants
      if (r() < (isWeekend ? 0.4 : 0.18)) {
        add(cursor, 19, 15, pick(r, DINING), 'dining', 22 + r() * 45);
      }

      // --- daytime clothes shopping, payday-weighted
      if (r() < (paydayWindow ? 0.22 : 0.06)) {
        add(cursor, 14, 30, pick(r, CLOTHES), 'clothes', between(r, 70, 320));
      }

      // --- odds and ends
      if (r() < 0.12) add(cursor, 12, 0, 'Amazon', 'home', 15 + r() * 60);
      if (r() < 0.05) add(cursor, 11, 0, 'Walgreens', 'health', 12 + r() * 40);
      if (r() < 0.04) add(cursor, 20, 0, 'Ticketmaster', 'entertainment', between(r, 60, 180));

      cursor.setDate(cursor.getDate() + 1);
    }

    const profile = {
      name: 'You',
      age: 36,
      monthlyTakeHome: 630000,          // $6,300 take-home, two $3,150 checks
      retirementSaved: 5200000,         // $52,000 in a 401k
      payCadence: 'semimonthly',
      fixed: [
        { name: 'Rent', amount: 187500 },
        { name: 'Student loan', amount: 31200 },
        { name: 'Car insurance', amount: 14200 },
        { name: 'Phone + internet', amount: 15500 },
        { name: 'Electric', amount: 10500 },
        { name: 'Renters insurance', amount: 1800 },
        { name: 'Subscriptions', amount: 36890 },
      ],
      goals: [
        { name: 'Emergency fund', target: 1500000, saved: 420000, monthly: 30000 },
        { name: 'Roth IRA', target: 700000, saved: 210000, monthly: 25000 },
      ],
      envelopes: {
        dispensary: 15000,
        bars: 20000,
        alcohol: 8000,
        clothes: 20000,
        dining: 25000,
        delivery: 12000,
        coffee: 9000,
        rideshare: 8000,
        entertainment: 7500,
      },
    };

    return { txns, profile };
  }

  return { generate };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DemoData;
