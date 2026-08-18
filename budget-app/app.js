/*
 * app.js — state, storage and rendering.
 *
 * Everything lives in the browser. No accounts, no bank linking, no server.
 * That is a deliberate choice: a ledger that lists dispensary visits and bar
 * tabs is nobody else's business, and the app is more useful if you never
 * have to think about who else can read it.
 */
(() => {
  'use strict';

  const E = BudgetEngine;
  const { fmt, fmtRound, labelOf, emojiOf, groupOf } = E;

  /* ---------------------------------------------------------------- store */

  const KEY = 'realbudget.v1';

  // localStorage throws in some file:// contexts and in private mode. Fall
  // back to memory so the app still runs; the Setup tab warns about it.
  const storage = (() => {
    try {
      const probe = '__rb__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return { ok: true, get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v), del: (k) => localStorage.removeItem(k) };
    } catch {
      const mem = new Map();
      return { ok: false, get: (k) => mem.get(k) ?? null, set: (k, v) => mem.set(k, v), del: (k) => mem.delete(k) };
    }
  })();

  const blankProfile = () => ({
    name: 'You',
    age: 36,
    monthlyTakeHome: 0,
    retirementSaved: 0,
    fixed: [],
    goals: [],
    envelopes: {},
  });

  let state = { txns: [], profile: blankProfile(), view: 'today' };

  function load() {
    try {
      const raw = storage.get(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      state.txns = Array.isArray(parsed.txns) ? parsed.txns : [];
      state.profile = { ...blankProfile(), ...(parsed.profile || {}) };
    } catch {
      /* corrupt payload: start clean rather than trap the user on a blank screen */
    }
  }

  function save() {
    try {
      storage.set(KEY, JSON.stringify({ txns: state.txns, profile: state.profile }));
    } catch {
      toast('Could not save — storage is full or blocked.');
    }
  }

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const nowTs = () => {
    const d = new Date();
    return `${today()}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  /* ------------------------------------------------------------- dom help */

  function el(tag, attrs = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  const $ = (sel) => document.querySelector(sel);

  let toastTimer;
  function toast(msg) {
    const box = $('#toast');
    box.textContent = msg;
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), 3200);
  }

  /* ----------------------------------------------------------- components */

  function meter(pct, tone) {
    const clamped = Math.max(0, Math.min(1, pct));
    return el('div', { class: 'meter', role: 'presentation' },
      el('span', { class: `meter-fill tone-${tone}`, style: `width:${(clamped * 100).toFixed(1)}%` })
    );
  }

  function statCard(label, value, note, tone = 'neutral') {
    return el('div', { class: `stat tone-${tone}` },
      el('div', { class: 'stat-label' }, label),
      el('div', { class: 'stat-value' }, value),
      note ? el('div', { class: 'stat-note' }, note) : null
    );
  }

  function emptyState(title, body, actionLabel, action) {
    return el('div', { class: 'empty' },
      el('h3', {}, title),
      el('p', {}, body),
      actionLabel ? el('button', { class: 'btn primary', onclick: action }, actionLabel) : null
    );
  }

  /* ------------------------------------------------------------ view: today */

  function viewToday() {
    if (!state.txns.length) {
      return emptyState(
        'Nothing to work with yet',
        'Add a few transactions, import a CSV from your bank, or load the sample history to see how the pattern detection works.',
        'Go to Setup',
        () => go('setup')
      );
    }

    const { position: p, insights } = E.analyze(state.txns, state.profile, today());
    const wrap = el('div', { class: 'stack' });

    if (!state.profile.monthlyTakeHome) {
      wrap.append(el('div', { class: 'callout' },
        el('strong', {}, 'Add your monthly take-home in Setup. '),
        'Without it the app can total your spending but cannot tell you what is actually safe to spend.'
      ));
    }

    const overspending = p.projectedOver > 0;

    wrap.append(
      el('section', { class: 'hero' },
        el('div', { class: 'hero-label' }, 'Safe to spend today'),
        el('div', { class: `hero-value ${p.safeToday < 0 ? 'bad' : ''}` }, fmt(Math.max(0, p.safeToday))),
        el('div', { class: 'hero-note' },
          p.safeToday < 0
            ? `You are ${fmt(-p.flexLeft)} past the flexible budget with ${p.month.daysLeft} days left. Not a catastrophe — just spend near zero or move money from a goal on purpose.`
            : `${fmt(p.flexLeft)} of flexible money left, ${p.month.daysLeft} days to go.`
        )
      )
    );

    wrap.append(
      el('div', { class: 'stat-grid' },
        statCard('Take-home this month', fmt(p.income), 'after tax'),
        statCard('Bills + goals', fmt(p.fixedPlanned + p.goalPlanned), 'off the top, already spoken for'),
        statCard('Flexible budget', fmt(p.flexBudget), 'what is genuinely yours to aim'),
        statCard('Spent so far', fmt(p.flexSpent), `${fmt(p.dailyRate)}/day average`, overspending ? 'bad' : 'good')
      )
    );

    wrap.append(
      el('section', { class: 'card' },
        el('h2', {}, 'Where this month lands'),
        meter(p.flexBudget ? p.flexSpent / p.flexBudget : 0, overspending ? 'bad' : 'good'),
        el('p', { class: 'muted' },
          `At ${fmt(p.dailyRate)}/day you finish the month at ${fmt(p.projected)} against a ${fmt(p.flexBudget)} flexible budget — `,
          el('strong', { class: overspending ? 'bad' : 'good' },
            overspending ? `${fmt(p.projectedOver)} over.` : `${fmt(-p.projectedOver)} under.`
          )
        ),
        el('p', { class: 'muted small' },
          `Joy categories: ${fmt(p.joySpent)} · Everyday life: ${fmt(p.lifeSpent)} · Total out the door including bills: ${fmt(p.actualOut)}`
        )
      )
    );

    const flags = insights.filter((i) => i.severity === 'flag').slice(0, 2);
    if (flags.length) {
      wrap.append(el('h2', { class: 'section-head' }, 'Worth knowing'));
      wrap.append(el('div', { class: 'stack' }, flags.map(insightCard)));
      wrap.append(el('button', { class: 'btn ghost wide', onclick: () => go('patterns') }, 'See all patterns →'));
    }

    return wrap;
  }

  /* -------------------------------------------------------- view: envelopes */

  function viewEnvelopes() {
    const envelopes = E.envelopeStatus(state.txns, state.profile, today());
    const wrap = el('div', { class: 'stack' });

    wrap.append(el('div', { class: 'callout' },
      el('strong', {}, 'Your vices get a line item here, not a hiding place. '),
      'Categories you actually spend on beat a "Miscellaneous" bucket you stop opening.'
    ));

    if (!envelopes.length) {
      wrap.append(emptyState(
        'No envelopes set',
        'Set a monthly number for the things you actually buy. The app can suggest starting numbers from your own history.',
        'Suggest from my history',
        () => {
          const suggested = E.suggestEnvelopes(state.txns);
          if (!Object.keys(suggested).length) return toast('Not enough history yet — add transactions first.');
          state.profile.envelopes = { ...state.profile.envelopes, ...suggested };
          save(); render();
          toast('Envelopes set from your median month.');
        }
      ));
      return wrap;
    }

    for (const e of envelopes) {
      const over = e.left < 0;
      wrap.append(
        el('section', { class: 'card envelope' },
          el('div', { class: 'env-head' },
            el('div', { class: 'env-name' }, `${e.emoji} ${e.label}`),
            el('div', { class: `env-amt ${over ? 'bad' : ''}` },
              over ? `${fmt(-e.left)} over` : `${fmt(e.left)} left`)
          ),
          meter(e.pctUsed, over ? 'bad' : e.aheadOfPace ? 'warn' : 'good'),
          el('div', { class: 'env-foot muted small' },
            `${fmt(e.used)} of ${fmt(e.budget)}`,
            e.aheadOfPace && !over
              ? ` · on pace for ${fmt(e.pace)} — ${fmt(e.paceOver)} over`
              : over ? ' · already past it' : ' · on pace'
          ),
          el('div', { class: 'env-edit' },
            el('label', {}, 'Monthly budget ',
              el('input', {
                type: 'number', min: '0', step: '5', value: (e.budget / 100).toFixed(0),
                onchange: (ev) => {
                  state.profile.envelopes[e.category] = E.toCents(ev.target.value || 0);
                  save(); render();
                },
              })
            )
          )
        )
      );
    }

    // Adding a category that isn't budgeted yet.
    const unbudgeted = Object.keys(E.CATEGORIES).filter(
      (c) => ['joy', 'life'].includes(groupOf(c)) && !(state.profile.envelopes[c] > 0)
    );
    if (unbudgeted.length) {
      const sel = el('select', {}, unbudgeted.map((c) => el('option', { value: c }, `${emojiOf(c)} ${labelOf(c)}`)));
      const amt = el('input', { type: 'number', min: '0', step: '5', placeholder: 'Monthly $' });
      wrap.append(
        el('section', { class: 'card' },
          el('h2', {}, 'Add an envelope'),
          el('div', { class: 'row' }, sel, amt,
            el('button', {
              class: 'btn primary',
              onclick: () => {
                const v = E.toCents(amt.value || 0);
                if (v <= 0) return toast('Enter an amount above zero.');
                state.profile.envelopes[sel.value] = v;
                save(); render();
              },
            }, 'Add')
          )
        )
      );
    }

    return wrap;
  }

  /* --------------------------------------------------------- view: patterns */

  function insightCard(i) {
    const badge = { flag: 'Costs more than it looks', info: 'Pattern', win: 'Working' }[i.severity];
    return el('article', { class: `card insight sev-${i.severity}` },
      el('div', { class: 'insight-badge' }, badge),
      el('h3', {}, i.title),
      i.stat ? el('div', { class: 'insight-stat' },
        el('span', { class: 'insight-stat-value' }, i.stat),
        el('span', { class: 'insight-stat-label' }, i.statLabel || '')
      ) : null,
      el('p', {}, i.body),
      i.fix ? el('p', { class: 'insight-fix' }, i.fix) : null
    );
  }

  function viewPatterns() {
    const insights = E.detect(state.txns, state.profile, today());
    const wrap = el('div', { class: 'stack' });

    if (!insights.length) {
      wrap.append(emptyState(
        'Not enough history to see patterns',
        'The detectors need roughly a month of transactions with times attached before they will say anything. Guessing early would just be noise.',
        'Load sample history',
        () => { seedDemo(); }
      ));
      return wrap;
    }

    wrap.append(el('div', { class: 'callout' },
      el('strong', {}, 'These are descriptions, not judgments. '),
      'Every number here is arithmetic on what you already did. What it is worth to you is your call.'
    ));
    wrap.append(...insights.map(insightCard));
    return wrap;
  }

  /* ----------------------------------------------------------- view: ledger */

  let ledgerFilter = 'all';

  function viewLedger() {
    const wrap = el('div', { class: 'stack' });
    wrap.append(quickAdd());

    if (!state.txns.length) return wrap;

    const cats = [...new Set(state.txns.map((t) => t.category))].sort();
    const filterBar = el('div', { class: 'filters' },
      el('button', {
        class: `chip ${ledgerFilter === 'all' ? 'on' : ''}`,
        onclick: () => { ledgerFilter = 'all'; render(); },
      }, 'All'),
      cats.map((c) => el('button', {
        class: `chip ${ledgerFilter === c ? 'on' : ''}`,
        onclick: () => { ledgerFilter = c; render(); },
      }, `${emojiOf(c)} ${labelOf(c)}`))
    );
    wrap.append(filterBar);

    const shown = state.txns
      .filter((t) => ledgerFilter === 'all' || t.category === ledgerFilter)
      .sort((a, b) => E.parseTs(b.ts) - E.parseTs(a.ts))
      .slice(0, 200);

    const list = el('section', { class: 'card ledger' });
    let lastDay = '';
    for (const t of shown) {
      const day = E.dayKey(t.ts);
      if (day !== lastDay) {
        lastDay = day;
        const d = E.parseTs(day);
        list.append(el('div', { class: 'ledger-day' },
          d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        ));
      }
      const income = groupOf(t.category) === 'income';
      list.append(
        el('div', { class: 'ledger-row' },
          el('span', { class: 'lr-emoji' }, emojiOf(t.category)),
          el('span', { class: 'lr-main' },
            el('span', { class: 'lr-merchant' }, t.merchant),
            el('span', { class: 'lr-meta muted small' },
              labelOf(t.category),
              t.timeKnown !== false ? ` · ${E.parseTs(t.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''
            )
          ),
          el('span', { class: `lr-amt ${income ? 'good' : ''}` }, income ? fmt(t.amount, { sign: true }) : fmt(t.amount)),
          el('button', {
            class: 'lr-del', title: 'Delete', 'aria-label': `Delete ${t.merchant}`,
            onclick: () => {
              state.txns = state.txns.filter((x) => x.id !== t.id);
              save(); render();
            },
          }, '×')
        )
      );
    }
    if (!shown.length) list.append(el('p', { class: 'muted' }, 'Nothing in this category yet.'));
    wrap.append(list);

    if (state.txns.length > shown.length) {
      wrap.append(el('p', { class: 'muted small center' },
        `Showing the ${shown.length} most recent of ${state.txns.length}.`));
    }
    return wrap;
  }

  function quickAdd() {
    const merchant = el('input', { type: 'text', placeholder: 'Where?', autocomplete: 'off' });
    const amount = el('input', { type: 'number', step: '0.01', min: '0', placeholder: 'How much?' });
    const cat = el('select', {},
      Object.keys(E.CATEGORIES).map((c) => el('option', { value: c }, `${emojiOf(c)} ${labelOf(c)}`))
    );
    const when = el('input', { type: 'datetime-local', value: nowTs() });

    // Guessing the category from the merchant is what makes logging fast
    // enough to actually do at the register.
    merchant.addEventListener('input', () => {
      if (merchant.dataset.touched) return;
      const guess = E.categorize(merchant.value);
      if (guess !== 'misc') cat.value = guess;
    });
    cat.addEventListener('change', () => { merchant.dataset.touched = '1'; });

    const submit = () => {
      const cents = E.toCents(amount.value);
      if (!Number.isFinite(cents) || cents <= 0) return toast('Enter an amount above zero.');
      state.txns.push({
        id: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        ts: when.value || nowTs(),
        timeKnown: true,
        merchant: merchant.value.trim() || labelOf(cat.value),
        amount: cents,
        category: cat.value,
      });
      save();
      merchant.value = ''; amount.value = ''; delete merchant.dataset.touched;
      render();
      toast('Logged.');
    };

    for (const input of [merchant, amount]) {
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    }

    return el('section', { class: 'card' },
      el('h2', {}, 'Log a purchase'),
      el('div', { class: 'quick-add' }, merchant, amount, cat, when,
        el('button', { class: 'btn primary', onclick: submit }, 'Add')
      ),
      el('p', { class: 'muted small' }, 'Type the merchant and the category guesses itself. Times matter — the late-night and chain detectors need them.')
    );
  }

  /* ------------------------------------------------------------ view: setup */

  function moneyRow(label, valueCents, onChange, hint) {
    return el('label', { class: 'field' },
      el('span', {}, label),
      el('input', {
        type: 'number', min: '0', step: '1', value: valueCents ? (valueCents / 100).toFixed(0) : '',
        onchange: (e) => { onChange(E.toCents(e.target.value || 0)); save(); render(); },
      }),
      hint ? el('small', { class: 'muted' }, hint) : null
    );
  }

  function viewSetup() {
    const p = state.profile;
    const wrap = el('div', { class: 'stack' });

    if (!storage.ok) {
      wrap.append(el('div', { class: 'callout warn' },
        el('strong', {}, 'Storage is blocked in this context. '),
        'Your data will vanish when you close the tab. Serve the folder over http (',
        el('code', {}, 'python3 -m http.server'),
        ') and it will persist.'
      ));
    }

    wrap.append(
      el('section', { class: 'card' },
        el('h2', {}, 'The basics'),
        el('div', { class: 'field-grid' },
          moneyRow('Monthly take-home', p.monthlyTakeHome, (v) => { p.monthlyTakeHome = v; }, 'After tax, what actually lands'),
          moneyRow('Retirement invested', p.retirementSaved, (v) => { p.retirementSaved = v; }, '401k + IRA, roughly'),
          el('label', { class: 'field' },
            el('span', {}, 'Age'),
            el('input', {
              type: 'number', min: '18', max: '100', value: p.age || '',
              onchange: (e) => { p.age = Number(e.target.value) || null; save(); render(); },
            })
          )
        )
      )
    );

    // Fixed bills
    const fixedList = el('div', { class: 'stack tight' },
      p.fixed.map((f, i) =>
        el('div', { class: 'row' },
          el('input', {
            type: 'text', value: f.name,
            onchange: (e) => { p.fixed[i].name = e.target.value; save(); },
          }),
          el('input', {
            type: 'number', min: '0', step: '1', value: (f.amount / 100).toFixed(0),
            onchange: (e) => { p.fixed[i].amount = E.toCents(e.target.value || 0); save(); render(); },
          }),
          el('button', {
            class: 'btn ghost small',
            onclick: () => { p.fixed.splice(i, 1); save(); render(); },
          }, 'Remove')
        )
      )
    );
    wrap.append(
      el('section', { class: 'card' },
        el('h2', {}, 'Bills that hit no matter what'),
        el('p', { class: 'muted small' }, 'These come off the top before anything is called "spendable". Total: ' +
          fmt(p.fixed.reduce((a, f) => a + f.amount, 0)) + '/month.'),
        fixedList,
        el('button', {
          class: 'btn ghost',
          onclick: () => { p.fixed.push({ name: 'New bill', amount: 0 }); save(); render(); },
        }, '+ Add bill')
      )
    );

    // Goals
    wrap.append(
      el('section', { class: 'card' },
        el('h2', {}, 'Goals (paid before fun money)'),
        el('div', { class: 'stack tight' },
          p.goals.map((g, i) =>
            el('div', { class: 'goal' },
              el('div', { class: 'row' },
                el('input', {
                  type: 'text', value: g.name,
                  onchange: (e) => { p.goals[i].name = e.target.value; save(); },
                }),
                el('input', {
                  type: 'number', min: '0', step: '5', value: (g.monthly / 100).toFixed(0), title: 'Monthly contribution',
                  onchange: (e) => { p.goals[i].monthly = E.toCents(e.target.value || 0); save(); render(); },
                }),
                el('button', {
                  class: 'btn ghost small',
                  onclick: () => { p.goals.splice(i, 1); save(); render(); },
                }, 'Remove')
              ),
              g.target ? meter(g.saved / g.target, 'good') : null,
              g.target ? el('div', { class: 'muted small' },
                `${fmt(g.saved)} of ${fmt(g.target)} · ${fmt(g.monthly)}/month`) : null
            )
          )
        ),
        el('button', {
          class: 'btn ghost',
          onclick: () => { p.goals.push({ name: 'New goal', target: 0, saved: 0, monthly: 0 }); save(); render(); },
        }, '+ Add goal')
      )
    );

    // Data in and out
    const fileInput = el('input', {
      type: 'file', accept: '.csv,text/csv', class: 'hidden',
      onchange: (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const { txns, errors } = E.importCSV(String(reader.result));
          if (!txns.length) return toast(errors[0] || 'Nothing imported.');
          const seen = new Set(state.txns.map((t) => `${t.ts}|${t.merchant}|${t.amount}`));
          const fresh = txns.filter((t) => !seen.has(`${t.ts}|${t.merchant}|${t.amount}`));
          state.txns.push(...fresh);
          save(); render();
          toast(`Imported ${fresh.length} transactions${txns.length - fresh.length ? `, skipped ${txns.length - fresh.length} duplicates` : ''}.`);
        };
        reader.readAsText(file);
        e.target.value = '';
      },
    });

    wrap.append(
      el('section', { class: 'card' },
        el('h2', {}, 'Data'),
        el('p', { class: 'muted small' },
          `${state.txns.length} transactions stored in this browser only. Nothing is uploaded anywhere, and there is no account to make.`),
        fileInput,
        el('div', { class: 'row wrap' },
          el('button', { class: 'btn', onclick: () => fileInput.click() }, 'Import bank CSV'),
          el('button', { class: 'btn', onclick: downloadCSV }, 'Export CSV'),
          el('button', { class: 'btn', onclick: seedDemo }, 'Load sample history'),
          el('button', {
            class: 'btn danger',
            onclick: () => {
              if (!confirm('Delete every transaction and setting stored in this browser? This cannot be undone.')) return;
              storage.del(KEY);
              state.txns = []; state.profile = blankProfile();
              render(); toast('Wiped.');
            },
          }, 'Erase everything')
        ),
        el('p', { class: 'muted small' },
          'CSV import expects a header row with a date, a description and an amount column — the usual bank export. ' +
          'Categories are guessed from the merchant name and you can fix any of them in the Ledger.')
      )
    );

    return wrap;
  }

  function downloadCSV() {
    if (!state.txns.length) return toast('Nothing to export yet.');
    const blob = new Blob([E.exportCSV(state.txns)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `budget-${today()}.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function seedDemo() {
    if (state.txns.length && !confirm('Replace your current data with the sample history?')) return;
    const { txns, profile } = DemoData.generate(today(), 4);
    state.txns = txns;
    state.profile = profile;
    save();
    go('patterns');
    toast(`Loaded ${txns.length} sample transactions.`);
  }

  /* ------------------------------------------------------------- shell */

  const VIEWS = {
    today: { label: 'Today', render: viewToday },
    envelopes: { label: 'Envelopes', render: viewEnvelopes },
    patterns: { label: 'Patterns', render: viewPatterns },
    ledger: { label: 'Ledger', render: viewLedger },
    setup: { label: 'Setup', render: viewSetup },
  };

  function go(view) {
    state.view = view;
    render();
    window.scrollTo({ top: 0 });
  }

  function render() {
    const nav = $('#nav');
    nav.replaceChildren(
      ...Object.entries(VIEWS).map(([key, v]) =>
        el('button', {
          class: `tab ${state.view === key ? 'on' : ''}`,
          'aria-current': state.view === key ? 'page' : null,
          onclick: () => go(key),
        }, v.label)
      )
    );
    const main = $('#main');
    main.replaceChildren(VIEWS[state.view].render());
  }

  load();
  render();
})();
