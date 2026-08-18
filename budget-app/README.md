# Real Budget

A budget app for someone who actually spends money on things budget apps
pretend don't exist.

Most budgeting tools give you `Groceries`, `Utilities`, and a giant
`Miscellaneous` bucket where the dispensary run, the bar tab, and the 1am
online shopping cart all go to die. Then they show you a pie chart where 40%
of your life is labeled "Other" and wonder why you stopped opening the app.

This one has a `🌿 Dispensary` line. And `🍸 Bars / Nightlife`, and
`👕 Clothes`, and `🛵 Delivery`. Not to shame you — to make the number real,
so you can decide what it's worth.

## Running it

```sh
cd budget-app
npm start          # python3 -m http.server 8080
```

Open <http://localhost:8080>. Click **Setup → Load sample history** to see
four months of synthetic-but-realistic spending and what the app makes of it.

There is no build step, no dependencies, and no server-side anything. Opening
`index.html` straight off disk mostly works too, but browsers block
`localStorage` on `file://` in some configurations, so your data won't
persist — the Setup tab will warn you if that happens.

## Everything stays on your device

No account. No bank login. No sync. No analytics. The entire dataset is a
single JSON blob in this browser's `localStorage`, and the only way data
leaves is the Export CSV button you press yourself.

That's a deliberate design constraint rather than an unfinished feature. A
ledger that itemizes dispensary visits is worth keeping off other people's
servers, and dropping the account system means there's nothing to sign up for
and nothing to cancel.

## What it does

### Safe to spend today

The number the app exists to produce. Bills and goal contributions come off
the top *before* anything is called spendable — money that's already spoken
for was never yours to aim.

```
flexible budget = take-home − fixed bills − goal contributions
safe today      = (flexible budget − spent so far) ÷ days left in month
```

It also projects where the month lands at your current burn rate, so you find
out on the 10th instead of the 30th.

### Envelopes for the things you actually buy

Per-category monthly budgets with pace tracking: not just "you've used 60% of
your bar budget" but "at this rate you'll finish the month $125 over." The
app can seed envelope amounts from the median month in your own history
instead of a magazine's 50/30/20 rule.

### Patterns

The part that "knows you." Each detector is arithmetic on your own history,
and each one stays silent until there's enough data to say something true.

| Detector | What it finds |
|---|---|
| **Munchies chain** | Dispensary run → food order within 6 hours. Reports the *true* cost per visit, receipt plus tail. |
| **Night-out multiplier** | Bar tab → the next 8 hours of rideshares, delivery, and 1am shopping. Usually 2–3× the tab itself. |
| **Payday cliff** | Spending rate in the 72 hours after a paycheck vs. every other day. Explains why the last week is tight. |
| **Late night** | Share of fun money spent between 10pm and 4am, and how much bigger those charges run. |
| **Subscription creep** | Merchants charging a steady amount every 25–35 days. Annualized. |
| **Weekend skew** | Share of discretionary spending in the ~2.5 days from Friday night to Sunday. |
| **Small leaks** | Everything under $15, annualized. The charges that are hardest to notice and easiest to cut. |
| **Joy cost** | Total annual spend on fun categories, plus what the same monthly amount compounds to at 7% over 10 years. |
| **Top merchant** | The single place your money concentrates. |
| **Retirement gap** | The age-based rule of thumb, stated as a number and labeled as the rough heuristic it is. |
| **Wins** | No-spend streaks and envelopes you're holding. An app that only ever scolds you gets deleted. |

Two rules the detectors follow:

1. **No moralizing.** They report what happened and what it costs annually.
   "This is your call" appears more than once, because it is.
2. **Silence over noise.** Every detector has a minimum-evidence threshold.
   With two weeks of data the Patterns tab says so rather than inventing a
   trend from four transactions.

### Logging and import

Quick-add guesses the category as you type the merchant — `SUNNYSIDE
DISPENSARY #4` becomes `🌿 Dispensary` before you finish typing. There are
~200 merchant rules covering dispensaries, liquor stores, bars, delivery
apps, clothing retailers, and the usual subscriptions.

CSV import reads normal bank and card exports: any header naming a date, a
description, and an amount. It figures out on its own whether your bank
writes outflows as negative (checking) or positive (credit cards), skips
duplicates on re-import, and reports unreadable rows without dropping the
good ones.

Transactions without a timestamp are marked as such, and the time-sensitive
detectors skip them rather than pretending a CSV row landed at noon.

## Code

| File | |
|---|---|
| `insights.js` | The engine. Pure functions — no DOM, no storage, no clock. Money is integer cents throughout; dollars exist only at the edges. |
| `app.js` | State, `localStorage`, and rendering. |
| `demo-data.js` | Seeded generator for the sample history. |
| `insights.test.js` | 35 tests over the money math, detectors, and CSV round-tripping. |
| `index.html`, `styles.css` | ~600 lines of markup and CSS. No framework. |

`insights.js` is a classic script rather than an ES module so `index.html`
works when opened off disk; the tests evaluate it directly.

```sh
npm test        # node --test
```

The detectors are worth testing carefully because a wrong one is worse than
none — it teaches you a false thing about your own life. The tests cover both
directions: that each detector fires on the pattern it claims to find, and
that it stays quiet on data that merely resembles it (food ordered the day
after a dispensary run isn't the munchies; an irregular bar habit isn't a
subscription; a second bar tab is the same night, not a new one).

## Things it deliberately doesn't do

- **No bank sync.** Plaid means handing your credentials and full transaction
  history to a third party. Export a CSV once a month instead.
- **No streaks, badges, or nagging.** Adherence theater. You know when you
  overspent.
- **No "you could have retired if you skipped the latte."** The joy-cost
  insight shows the compounded number because it's genuinely useful to see,
  then says plainly that it's a price tag, not an argument.
- **Not financial advice.** It's arithmetic on your own history. The
  retirement benchmark in particular is a widely repeated rule of thumb, not
  a law, and it's labeled that way in the app.
