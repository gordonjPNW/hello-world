# Real Budget — working notes

A local-first budget app with habit pattern detection. Vanilla JS, zero
dependencies, no build step. See `README.md` for what it does and why.

## Commands

```sh
npm test        # node --test  — run before every commit
npm start       # python3 -m http.server 8080, then open localhost:8080
node --check insights.js        # syntax-only check
```

There is no linter, bundler, or transpiler configured, and the project does
not need one. `npm install` does nothing useful — there are no dependencies.

## Layout

| File | Role |
|---|---|
| `insights.js` | The engine: budget math, detectors, CSV. Pure functions. |
| `app.js` | State, `localStorage`, DOM rendering. All side effects live here. |
| `demo-data.js` | Seeded generator for the sample history. |
| `insights.test.js` | Tests for the engine. |
| `index.html` / `styles.css` | Markup and CSS. No framework. |

## Invariants

These are load-bearing. Breaking one silently produces wrong numbers, which
in this app is worse than a crash — it teaches the user a false thing about
their own spending.

**Money is integer cents, everywhere.** `amount`, `monthlyTakeHome`,
envelope budgets, all of it. Dollars exist only at the edges: `toCents()` on
input, `fmt()` on output. Never do arithmetic on a float dollar amount, and
never store one.

**`insights.js` is pure.** No DOM, no `localStorage`, no `new Date()`. "Today"
is always a parameter (`todayISO`). That is the entire reason the detectors
are testable — a detector that reads the clock cannot be tested for the
behavior that matters.

**`insights.js` stays a classic script, not an ES module.** It defines a
global `BudgetEngine`. This is deliberate: `index.html` must work when opened
straight off disk, and browsers block module loading over `file://`. The
tests evaluate the source with `new Function` rather than importing it. Do
not "modernize" this to `export` without also solving the file:// case.

**Expenses are stored positive.** Direction comes from the category's group
(`income` vs everything else), never from the sign of `amount`. CSV import
normalizes both bank conventions (outflow-negative) and card conventions
(charge-positive) into this form.

**`timeKnown: false` means the clock is a guess.** CSV rows without a
timestamp get midday and this flag. Time-sensitive detectors (late-night,
munchies chain, night-out) must filter these out rather than pretend.

## Writing a detector

Each returns one insight object or `null`, and is wired into `detect()`.

```js
{ id, severity: 'flag' | 'info' | 'win', title, stat, statLabel, body, fix? }
```

Three rules, in priority order:

1. **Silence over noise.** Every detector needs a minimum-evidence threshold
   and returns `null` below it. Four transactions is not a pattern. If you
   cannot state the threshold, the detector is not ready.
2. **Describe, don't moralize.** Report what happened and what it costs
   annually. The user's vices are the point of this app, not a problem to be
   corrected. `fix` is an optional practical suggestion, never a scolding.
3. **Test both directions.** A test that it fires on the real pattern, *and*
   a test that it stays quiet on data that merely resembles it. The existing
   pairs are the model: food ordered the day *after* a dispensary run is not
   the munchies; an irregular bar habit is not a subscription; a second bar
   tab is the same night, not a new one.

Chains (`chains()`) are non-overlapping — anything claimed as a follow-on
cannot start its own chain. This is what stops one night out being counted
three times.

## Privacy is a feature, not a gap

No account, no bank sync, no analytics, no network calls of any kind. The
whole dataset is one JSON blob in `localStorage`. A ledger itemizing
dispensary visits should not travel. If a change would add a network
request, that is a product decision to raise with the user, not an
implementation detail.
