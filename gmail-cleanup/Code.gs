/**
 * Gmail bulk-mail cleanup.
 *
 * Finds senders who average more than THRESHOLD_PER_WEEK emails a week, moves their entire
 * history to Trash, and reports them with unsubscribe links so you can cut them off at the source.
 *
 * Everything runs inside your own Google account. Deleted mail goes to Trash (recoverable for 30
 * days), never a permanent delete.
 *
 * See README.md for setup.
 */

var SHEETS = {
  CONFIG: 'Config',
  SENDERS: 'Senders',
  LOG: 'Log',
  STATE: '_Scan'
};

/** Config keys, with the defaults written on first setup. */
var DEFAULTS = {
  SCAN_WEEKS: 8,
  THRESHOLD_PER_WEEK: 3,
  DRY_RUN: true,
  PROTECT_STARRED: true,
  PROTECT_IMPORTANT: true,
  ALLOWLIST: '',
  SWEEP_KEEP_DAYS: 30,
  SWEEP_PROTECT_ATTACHMENTS: true
};

var CONFIG_NOTES = {
  SCAN_WEEKS: 'How many weeks back to look when measuring how often a sender mails you.',
  THRESHOLD_PER_WEEK: 'More than this many emails per week means the sender gets deleted.',
  DRY_RUN: 'TRUE = report only, delete nothing. Set to FALSE once the Senders list looks right.',
  PROTECT_STARRED: 'TRUE = never delete starred mail.',
  PROTECT_IMPORTANT: 'TRUE = never delete mail Gmail marked important. Gmail marks a lot of bulk '
    + 'mail important, so set this FALSE if the cleanup deletes less than you expected.',
  ALLOWLIST: 'Never delete these, whatever the numbers say. Comma-separated. Accepts full '
    + 'addresses (news@store.com) and whole domains (@mybank.com).',
  SWEEP_KEEP_DAYS: 'Sweep only: keep anything newer than this many days, even if not important. '
    + 'Set to 0 to sweep everything regardless of age.',
  SWEEP_PROTECT_ATTACHMENTS: 'Sweep only: TRUE = never delete mail with attachments. Gmail rarely '
    + 'marks attachments important, and this is where tax forms, contracts and tickets live. Set '
    + 'FALSE for a maximal sweep.'
};

/** Senders sheet columns, 0-indexed. */
var COL = {
  ADDRESS: 0,
  NAME: 1,
  MESSAGES: 2,
  PER_WEEK: 3,
  VERDICT: 4,
  TRASHED: 5,
  UNSUB_URL: 6,
  UNSUB_MAILTO: 7,
  SEARCH: 8
};

var SENDER_HEADERS = ['Sender', 'Name', 'Messages in window', 'Per week', 'Verdict',
  'Threads trashed', 'Unsubscribe link', 'Unsubscribe email', 'View in Gmail'];

var LOG_HEADERS = ['Finished', 'Mode', 'Messages scanned', 'Senders flagged', 'Threads trashed',
  'Minutes', 'Notes'];

/** Apps Script kills an execution at 6 minutes, so each chunk stops well short and resumes. */
var CHUNK_MS = 4.5 * 60 * 1000;
var PAGE = 100;
var RESUME_FN = 'runPipeline';

/* -------------------------------------------------------------------------- menu */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Gmail Cleanup')
    .addItem('1. Set up sheets', 'setup')
    .addItem('2. Scan & report (never deletes)', 'runReport')
    .addItem('3. Run cleanup now', 'runCleanupNow')
    .addSeparator()
    .addItem('Sweep everything not important', 'runSweep')
    .addSeparator()
    .addItem('Show current settings', 'showSettings')
    .addItem('Show run status', 'showStatus')
    .addItem('Install weekly auto-run', 'installWeeklyTrigger')
    .addItem('Remove weekly auto-run', 'removeWeeklyTrigger')
    .addToUi();
}

/** Creates the four tabs and writes default config. Safe to re-run; won't clobber your settings. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var config = ensureSheet_(ss, SHEETS.CONFIG);
  if (config.getLastRow() === 0) {
    var rows = [['Setting', 'Value', 'What it does']];
    Object.keys(DEFAULTS).forEach(function (key) {
      rows.push([key, DEFAULTS[key], CONFIG_NOTES[key]]);
    });
    config.getRange(1, 1, rows.length, 3).setValues(rows);
    config.getRange(1, 1, 1, 3).setFontWeight('bold');
    config.setColumnWidth(1, 170);
    config.setColumnWidth(2, 90);
    config.setColumnWidth(3, 620);
    config.getRange(2, 3, rows.length - 1, 1).setWrap(true);
    config.setFrozenRows(1);
  }

  var senders = ensureSheet_(ss, SHEETS.SENDERS);
  if (senders.getLastRow() === 0) {
    senders.getRange(1, 1, 1, SENDER_HEADERS.length).setValues([SENDER_HEADERS])
      .setFontWeight('bold');
    senders.setFrozenRows(1);
    senders.setColumnWidth(1, 260);
  }

  var log = ensureSheet_(ss, SHEETS.LOG);
  if (log.getLastRow() === 0) {
    log.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold');
    log.setFrozenRows(1);
  }

  ensureSheet_(ss, SHEETS.STATE).hideSheet();

  toast_('Sheets ready. Run "Scan & report" next.');
}

function runReport() {
  startRun_('REPORT');
}

/**
 * Shows the settings exactly as the script reads them. DRY_RUN lives in the Config tab, not in the
 * code — editing DEFAULTS after the first setup() changes nothing — so this is the honest answer to
 * "is it actually going to delete anything?"
 */
function showSettings() {
  var ui = SpreadsheetApp.getUi();
  var cfg;
  try {
    cfg = readConfig_();
  } catch (err) {
    ui.alert('Cannot read settings', err.message, ui.ButtonSet.OK);
    return;
  }

  var lines = [
    cfg.DRY_RUN
      ? 'DRY_RUN is TRUE — nothing will be deleted.'
      : 'DRY_RUN is FALSE — mail WILL be moved to Trash.',
    '',
    'Read from the "' + SHEETS.CONFIG + '" tab of this spreadsheet:',
    '',
    'SCAN_WEEKS: ' + cfg.SCAN_WEEKS,
    'THRESHOLD_PER_WEEK: ' + cfg.THRESHOLD_PER_WEEK,
    'DRY_RUN: ' + cfg.DRY_RUN,
    'PROTECT_STARRED: ' + cfg.PROTECT_STARRED,
    'PROTECT_IMPORTANT: ' + cfg.PROTECT_IMPORTANT,
    'ALLOWLIST: ' + (cfg.ALLOWLIST || '(empty)'),
    'SWEEP_KEEP_DAYS: ' + cfg.SWEEP_KEEP_DAYS
      + (Number(cfg.SWEEP_KEEP_DAYS) > 0 ? '' : ' (no age limit — sweeps everything)'),
    'SWEEP_PROTECT_ATTACHMENTS: ' + cfg.SWEEP_PROTECT_ATTACHMENTS,
    '',
    'Scan searches for:',
    scanQuery_(cfg),
    '',
    'Sweep searches for:',
    sweepQuery_(cfg),
    '',
    'Paste that into the Gmail search box to check it matches mail. If it returns nothing, the '
      + 'scan will find nothing.'
  ];

  if (cfg.PROTECT_IMPORTANT) {
    lines.push('', 'Note: PROTECT_IMPORTANT is on, and Gmail auto-marks a lot of bulk mail as '
      + 'important. That is the usual reason a cleanup deletes less than expected.');
  }

  ui.alert('Current settings', lines.join('\n'), ui.ButtonSet.OK);
}

/**
 * The blunt instrument: trash everything Gmail did not mark important.
 *
 * No sender analysis and no threshold — if it isn't important, isn't starred, isn't allowlisted, and
 * you never replied to it, it goes. Deliberately manual and deliberately not on the weekly trigger.
 */
function runSweep() {
  var ui = SpreadsheetApp.getUi();
  var cfg;
  try {
    cfg = readConfig_();
  } catch (err) {
    ui.alert('Cannot read settings', err.message, ui.ButtonSet.OK);
    return;
  }

  var query = sweepQuery_(cfg);
  var keeping = [];
  if (Number(cfg.SWEEP_KEEP_DAYS) > 0) {
    keeping.push('anything from the last ' + Math.round(cfg.SWEEP_KEEP_DAYS) + ' days');
  }
  keeping.push('anything starred');
  if (cfg.SWEEP_PROTECT_ATTACHMENTS) keeping.push('anything with an attachment');
  keeping.push('threads you replied to');
  if (cfg.ALLOWLIST) keeping.push('allowlisted senders');

  var message = (cfg.DRY_RUN
      ? 'DRY_RUN is TRUE, so this will only count what it would delete.\n\n'
      : 'This deletes across your WHOLE mailbox, not just recent mail.\n\n')
    + 'Keeping: ' + keeping.join(', ') + '.\n\n'
    + 'Gmail search it will use — paste this into Gmail\'s search box first to see exactly how '
    + 'many messages match:\n\n' + query + '\n\n'
    + (cfg.DRY_RUN ? 'Run the count?' : 'Everything matching goes to Trash, recoverable for 30 '
      + 'days. On a mailbox this size it may take hours and continue over several days. Proceed?');

  if (ui.alert(cfg.DRY_RUN ? 'Sweep (dry run)' : 'Sweep everything not important', message,
      ui.ButtonSet.YES_NO) !== ui.Button.YES) {
    return;
  }
  startRun_('SWEEP');
}

/**
 * Reports where a run actually is. A scan over a large mailbox spans several executions, so "the
 * Senders tab is empty" usually means still scanning rather than nothing found.
 */
function showStatus() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var phase = props.getProperty('PHASE');

  if (!phase) {
    ui.alert('Run status', 'No run has been started yet in this copy.', ui.ButtonSet.OK);
    return;
  }

  var pending = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === RESUME_FN;
  }).length;

  // The surest sign a run is executing right now: runPipeline holds the script lock for its whole
  // chunk. Without this check an in-flight first chunk looks stalled, because progress counters and
  // the continuation trigger are both only written when a chunk pauses.
  var lock = LockService.getScriptLock();
  var running = !lock.tryLock(0);
  if (!running) lock.releaseLock();

  var heartbeat = Number(props.getProperty('HEARTBEAT') || 0);
  var sinceBeat = heartbeat ? Math.round((Date.now() - heartbeat) / 1000) : null;
  var sendersFound = Math.max(0, sheet_(SHEETS.STATE).getLastRow());

  var lines = [
    'Phase: ' + phase + (phase === 'DONE' ? ' (finished)' : ''),
    'Mode: ' + (props.getProperty('MODE') || '?'),
    'Threads scanned so far: ' + (props.getProperty('SCAN_SEEN')
      || props.getProperty('SCAN_CURSOR') || '0'),
    'Messages counted so far: ' + (props.getProperty('SCAN_COUNT') || '0'),
    'Senders found so far: ' + sendersFound,
    'Threads trashed so far: ' + (props.getProperty('CLEAN_TOTAL') || '0'),
    '',
    'Continuation jobs queued: ' + pending,
    'Last progress: ' + (sinceBeat === null ? 'none yet' : sinceBeat + ' seconds ago')
  ];

  if (phase === 'DONE') {
    lines.push('', 'This run has finished. See the Log tab.');
  } else if (running) {
    lines.push('', 'A run is executing RIGHT NOW. Counters only update when each burst ends, so '
      + 'zeros here are normal for the first few minutes. Leave it alone and check back.');
  } else if (pending > 0) {
    lines.push('', 'Paused between bursts — it resumes in under a minute.');
  } else if (sinceBeat !== null && sinceBeat < 180) {
    lines.push('', 'Between bursts. Give it a minute, then check again.');
  } else {
    lines.push('', 'Nothing is running and nothing is queued, so this run has stalled. Open '
      + 'Extensions > Apps Script > Executions to see the error, then start it again.');
  }

  ui.alert('Run status', lines.join('\n'), ui.ButtonSet.OK);
}

function runCleanupNow() {
  var ui = SpreadsheetApp.getUi();
  var cfg;
  try {
    cfg = readConfig_();
  } catch (err) {
    ui.alert('Cannot read settings', err.message, ui.ButtonSet.OK);
    return;
  }

  // Always confirm, and always say which mode is about to run. Finding out afterwards from the Log
  // is how a run that quietly did nothing looks identical to one that worked.
  var message = cfg.DRY_RUN
    ? 'DRY_RUN is TRUE in the Config tab, so this run will report but DELETE NOTHING.\n\n'
        + 'Set DRY_RUN to FALSE in the Config tab if you meant to delete for real.\n\n'
        + 'Continue as a dry run?'
    : 'DRY_RUN is FALSE. This will move every flagged sender\'s mail to Trash — their ENTIRE '
        + 'history, not just recent mail.\n\n'
        + 'Trash is recoverable for 30 days. Starred, important, and replied-to mail is skipped '
        + 'while those protections are on.\n\nDelete for real?';

  if (ui.alert(cfg.DRY_RUN ? 'Dry run' : 'Delete for real', message, ui.ButtonSet.YES_NO)
      !== ui.Button.YES) {
    return;
  }
  startRun_('FULL');
}

/* -------------------------------------------------------------------------- pipeline */

/**
 * Resets state and kicks off a run. Phases advance through SCAN -> CLASSIFY -> CLEAN -> SUMMARY,
 * each one resumable, because a big mailbox takes longer than one execution is allowed to run.
 */
function startRun_(mode) {
  var props = PropertiesService.getScriptProperties();
  props.setProperties({
    MODE: mode,
    // The sweep needs no sender analysis, so it skips straight past scan and classify.
    PHASE: (mode === 'SWEEP') ? 'SWEEP' : 'SCAN',
    SCAN_CURSOR: '0',
    SCAN_COUNT: '0',
    CLEAN_ROW: '2',
    CLEAN_TOTAL: '0',
    CLEAN_KEPT: '0',
    CLEAN_OFFSET: '0',
    RUN_START: String(Date.now())
  });
  clearState_();
  toast_(mode === 'REPORT' ? 'Scanning. The Senders tab fills in as it goes.'
    : (mode === 'SWEEP' ? 'Sweep started. This can span hours or days on a big mailbox.'
                        : 'Cleanup started.'));
  runPipeline();
}

/** Runs as much of the pipeline as fits in one execution, then schedules itself to continue. */
function runPipeline() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;

  try {
    removeResumeTriggers_();
    var deadline = Date.now() + CHUNK_MS;
    var props = PropertiesService.getScriptProperties();
    var cfg = readConfig_();
    var mode = props.getProperty('MODE') || 'FULL';
    var phase = props.getProperty('PHASE') || 'SCAN';

    while (phase !== 'DONE' && Date.now() < deadline) {
      if (phase === 'SWEEP') {
        if (!sweepStep_(cfg, deadline)) break;
        phase = 'SUMMARY';
      } else if (phase === 'SCAN') {
        if (!scanStep_(cfg, deadline)) {
          // Out of time mid-scan. Refresh the Senders tab from what we have so far so there is
          // visible progress, then let the resume trigger pick it up.
          classifyStep_(cfg, true);
          break;
        }
        phase = 'CLASSIFY';
      } else if (phase === 'CLASSIFY') {
        classifyStep_(cfg, false);
        phase = (mode === 'REPORT') ? 'SUMMARY' : 'CLEAN';
      } else if (phase === 'CLEAN') {
        if (!cleanStep_(cfg, deadline)) break;
        phase = 'SUMMARY';
      } else if (phase === 'SUMMARY') {
        summaryStep_(cfg, mode);
        phase = 'DONE';
      }
      props.setProperty('PHASE', phase);
    }

    if (phase !== 'DONE') scheduleResume_();
  } finally {
    lock.releaseLock();
  }
}

/* -------------------------------------------------------------------------- scan */

/**
 * The search that defines the scan window.
 *
 * Gmail's newer_than: only understands d, m and y — there is no w. "newer_than:8w" is not a narrow
 * search, it's an invalid one, and Gmail answers it with zero results, so convert weeks to days.
 * Drafts are excluded with is:draft, which is the real operator; in:draft is not one.
 */
function scanQuery_(cfg) {
  var days = Math.max(1, Math.round(cfg.SCAN_WEEKS * 7));
  return 'newer_than:' + days + 'd -in:sent -in:trash -in:chats -is:draft';
}

/**
 * The mailbox-wide sweep: everything Gmail did not mark important.
 *
 * Unlike the threshold cleanup this does no sender analysis — importance is the whole selector, so
 * PROTECT_IMPORTANT is irrelevant here (important mail is what's being kept). Starred mail and the
 * allowlist are excluded in the query; replied-to threads are filtered per-thread by trashMatching_,
 * because Gmail has no search operator for "a thread I wrote in".
 */
function sweepQuery_(cfg) {
  var query = '-is:important -is:starred -in:sent -in:trash -in:chats -is:draft';

  var keepDays = Number(cfg.SWEEP_KEEP_DAYS);
  if (keepDays > 0) query += ' older_than:' + Math.round(keepDays) + 'd';

  if (cfg.SWEEP_PROTECT_ATTACHMENTS) query += ' -has:attachment';

  String(cfg.ALLOWLIST || '').split(/[,\n]/).forEach(function (raw) {
    var entry = raw.trim().toLowerCase();
    if (entry) query += ' -from:' + entry;
  });

  return query;
}

/**
 * Walks the scan window tallying messages per sender. Returns true when the whole window is done,
 * false when it ran out of time and needs another pass.
 */
function scanStep_(cfg, deadline) {
  var props = PropertiesService.getScriptProperties();
  var cursor = Number(props.getProperty('SCAN_CURSOR') || 0);
  var counted = Number(props.getProperty('SCAN_COUNT') || 0);
  var me = myEmail_();
  var tally = loadState_();

  var query = scanQuery_(cfg);

  while (true) {
    if (Date.now() > deadline) {
      saveState_(tally);
      props.setProperties({
        SCAN_CURSOR: String(cursor),
        SCAN_COUNT: String(counted),
        SCAN_SEEN: String(cursor),
        HEARTBEAT: String(Date.now())
      });
      return false;
    }

    var threads = GmailApp.search(query, cursor, PAGE);
    if (!threads.length) break;

    // One batched call for the whole page instead of a fetch per thread.
    var messagesByThread = GmailApp.getMessagesForThreads(threads);
    for (var i = 0; i < messagesByThread.length; i++) {
      var messages = messagesByThread[i];
      for (var j = 0; j < messages.length; j++) {
        var from = messages[j].getFrom();
        var address = parseAddress_(from);
        if (!address || address === me) continue;

        var entry = tally[address];
        if (!entry) {
          entry = tally[address] = { name: parseName_(from), messages: 0, sampleId: messages[j].getId() };
        }
        entry.messages++;
        counted++;
      }
    }

    cursor += threads.length;

    // Display-only progress. SCAN_CURSOR stays authoritative and is written on pause/finish, so a
    // crash mid-chunk can't resume from a cursor whose tally was never saved.
    if (cursor % (PAGE * 5) === 0) {
      props.setProperties({ SCAN_SEEN: String(cursor), HEARTBEAT: String(Date.now()) });
    }
  }

  saveState_(tally);
  props.setProperties({
    SCAN_CURSOR: String(cursor),
    SCAN_COUNT: String(counted),
    SCAN_SEEN: String(cursor),
    HEARTBEAT: String(Date.now())
  });
  return true;
}

/* -------------------------------------------------------------------------- classify */

/**
 * Turns the tally into the Senders tab: rate, verdict, and unsubscribe links for the flagged.
 *
 * Called with interim=true after each scan chunk so the sheet fills in as the scan runs — on a big
 * mailbox the scan spans several executions, and waiting until the end means staring at an empty
 * tab wondering whether anything is happening. Interim passes skip the unsubscribe lookups, which
 * cost an API call per flagged sender and would be redone every chunk for no benefit.
 */
function classifyStep_(cfg, interim) {
  var tally = loadState_();
  var me = myEmail_();
  var rows = [];

  Object.keys(tally).forEach(function (address) {
    var entry = tally[address];
    var perWeek = entry.messages / cfg.SCAN_WEEKS;
    var verdict;

    if (address === me || isAllowlisted_(address, cfg.ALLOWLIST)) {
      verdict = 'ALLOWLISTED';
    } else if (perWeek > cfg.THRESHOLD_PER_WEEK) {
      verdict = 'DELETE';
    } else {
      verdict = 'KEEP';
    }

    var unsub = { url: '', mailto: '' };
    if (verdict === 'DELETE' && !interim) unsub = unsubscribeLinks_(entry.sampleId);

    rows.push([
      address,
      entry.name,
      entry.messages,
      Math.round(perWeek * 10) / 10,
      verdict,
      0,
      unsub.url,
      unsub.mailto,
      'https://mail.google.com/mail/u/0/#search/' + encodeURIComponent('from:' + address)
    ]);
  });

  // Worst offenders first, so the top of the sheet is the part worth reading.
  rows.sort(function (a, b) { return b[COL.MESSAGES] - a[COL.MESSAGES]; });

  var sheet = sheet_(SHEETS.SENDERS);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, SENDER_HEADERS.length).clearContent();
  }
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, SENDER_HEADERS.length).setValues(rows);
  }
}

/**
 * Reads List-Unsubscribe off a sample message. Uses the Gmail advanced service because GmailApp
 * can't read arbitrary headers without pulling the whole raw message down.
 */
function unsubscribeLinks_(messageId) {
  var result = { url: '', mailto: '' };
  if (!messageId) return result;

  try {
    var message = Gmail.Users.Messages.get('me', messageId, {
      format: 'metadata',
      metadataHeaders: ['List-Unsubscribe']
    });
    var headers = (message.payload && message.payload.headers) || [];
    var value = '';
    headers.forEach(function (header) {
      if (header.name.toLowerCase() === 'list-unsubscribe') value = header.value;
    });
    if (!value) return result;

    // Header looks like: <https://example.com/unsub?id=1>, <mailto:unsub@example.com>
    var parts = value.match(/<[^>]+>/g) || [];
    parts.forEach(function (part) {
      var link = part.slice(1, -1).trim();
      if (/^https?:/i.test(link) && !result.url) result.url = link;
      if (/^mailto:/i.test(link) && !result.mailto) result.mailto = link.replace(/^mailto:/i, '');
    });
  } catch (err) {
    result.url = 'lookup failed: ' + err.message;
  }
  return result;
}

/* -------------------------------------------------------------------------- clean */

/** Trashes every DELETE sender's full history. Returns false if it needs another pass. */
function cleanStep_(cfg, deadline) {
  var props = PropertiesService.getScriptProperties();
  var sheet = sheet_(SHEETS.SENDERS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return true;

  // Without this the reply protection fails open: iReplied_ compares against an empty string, finds
  // no match on anything, and every conversation gets trashed. Better to stop than to delete blind.
  if (!myEmail_()) {
    throw new Error('Could not determine your email address, so replied-to threads cannot be '
      + 'protected. Run the cleanup from the menu (not a trigger) and re-authorize if asked.');
  }

  var data = sheet.getRange(2, 1, lastRow - 1, SENDER_HEADERS.length).getValues();
  var row = Number(props.getProperty('CLEAN_ROW') || 2);
  var total = Number(props.getProperty('CLEAN_TOTAL') || 0);
  var keptTotal = Number(props.getProperty('CLEAN_KEPT') || 0);
  // Where we left off inside the sender we were part-way through when time ran out.
  var offset = Number(props.getProperty('CLEAN_OFFSET') || 0);

  for (; row <= lastRow; row++) {
    var record = data[row - 2];
    if (!record || record[COL.VERDICT] !== 'DELETE') continue;

    var outcome = trashSender_(String(record[COL.ADDRESS]), cfg, deadline, offset);
    offset = 0;
    keptTotal += outcome.keptReplied;
    props.setProperty('HEARTBEAT', String(Date.now()));

    if (outcome.trashed) {
      var running = Number(record[COL.TRASHED] || 0) + outcome.trashed;
      sheet.getRange(row, COL.TRASHED + 1).setValue(running);
      total += outcome.trashed;
    }

    if (!outcome.done) {
      props.setProperties({
        CLEAN_ROW: String(row),
        CLEAN_TOTAL: String(total),
        CLEAN_KEPT: String(keptTotal),
        CLEAN_OFFSET: String(outcome.offset)
      });
      return false;
    }
  }

  props.setProperties({
    CLEAN_ROW: String(row),
    CLEAN_TOTAL: String(total),
    CLEAN_KEPT: String(keptTotal),
    CLEAN_OFFSET: '0'
  });
  return true;
}

/**
 * Trashes one sender's mail across the whole mailbox, skipping anything protected.
 *
 * Trashed threads drop out of the search (it excludes in:trash), so the paging offset only ever
 * advances past threads we deliberately kept — that's what keeps this from re-reading its own work.
 */
function trashSender_(address, cfg, deadline, startOffset) {
  var query = 'from:' + address + ' -in:sent -in:trash -in:chats -is:draft';
  if (cfg.PROTECT_STARRED) query += ' -is:starred';
  if (cfg.PROTECT_IMPORTANT) query += ' -is:important';
  return trashMatching_(query, cfg, deadline, startOffset);
}

/**
 * Trashes everything a query matches, skipping threads the user took part in.
 *
 * Shared by the per-sender cleanup and the mailbox-wide sweep so both get the same reply protection,
 * the same 100-thread trash batching, and the same resume behaviour.
 */
function trashMatching_(query, cfg, deadline, startOffset) {
  // Progress lives out here so a quota error mid-page doesn't discard the thousands of threads this
  // call already trashed — the throw unwinds the loop, but the counts survive in this object.
  var progress = { trashed: 0, keptReplied: 0, done: false, offset: startOffset || 0 };

  try {
    trashMatchingUnguarded_(query, cfg, deadline, progress);
  } catch (err) {
    // A mailbox-wide sweep exhausts Gmail's daily allowance long before it runs out of mail. That's
    // a pause, not a failure: keep what was done and come back in a few hours.
    if (!isQuotaError_(err)) throw err;
    PropertiesService.getScriptProperties().setProperty('QUOTA_PAUSED', String(Date.now()));
    progress.quota = true;
    progress.done = false;
  }
  return progress;
}

function isQuotaError_(err) {
  var text = String((err && err.message) || err).toLowerCase();
  return text.indexOf('too many times') !== -1
    || text.indexOf('limit exceeded') !== -1
    || text.indexOf('quota') !== -1
    || text.indexOf('rate limit') !== -1;
}

function trashMatchingUnguarded_(query, cfg, deadline, progress) {
  var me = myEmail_();

  while (true) {
    if (Date.now() > deadline) {
      progress.done = false;
      return;
    }

    var threads = GmailApp.search(query, progress.offset, PAGE);
    if (!threads.length) {
      progress.done = true;
      return;
    }

    // A one-message thread can't contain a reply, and nearly all bulk mail is one message, so
    // only pay for the message fetch when a thread actually has a conversation in it.
    var hasConversation = threads.some(function (thread) { return thread.getMessageCount() > 1; });
    var messagesByThread = hasConversation ? GmailApp.getMessagesForThreads(threads) : null;

    var doomed = [];
    var kept = 0;
    threads.forEach(function (thread, i) {
      if (messagesByThread && thread.getMessageCount() > 1 && iReplied_(messagesByThread[i], me)) {
        kept++;
      } else {
        doomed.push(thread);
      }
    });

    progress.keptReplied += kept;

    if (cfg.DRY_RUN) {
      progress.trashed += doomed.length;
      progress.offset += threads.length;
    } else {
      for (var i = 0; i < doomed.length; i += PAGE) {
        GmailApp.moveThreadsToTrash(doomed.slice(i, i + PAGE));
        // Credit each batch as it lands, so a quota error on a later batch keeps this one counted.
        progress.trashed += Math.min(PAGE, doomed.length - i);
      }
      progress.offset += kept;
    }
  }
}

function iReplied_(messages, me) {
  if (!me) return false;
  return messages.some(function (message) {
    return parseAddress_(message.getFrom()) === me;
  });
}

/* -------------------------------------------------------------------------- sweep */

/**
 * Trashes everything the sweep query matches, across the whole mailbox. Returns false if it ran out
 * of time or hit Gmail's daily quota and needs another pass.
 */
function sweepStep_(cfg, deadline) {
  var props = PropertiesService.getScriptProperties();

  if (!myEmail_()) {
    throw new Error('Could not determine your email address, so replied-to threads cannot be '
      + 'protected. Run the sweep from the menu and re-authorize if asked.');
  }

  var offset = Number(props.getProperty('CLEAN_OFFSET') || 0);
  var total = Number(props.getProperty('CLEAN_TOTAL') || 0);
  var keptTotal = Number(props.getProperty('CLEAN_KEPT') || 0);

  var outcome = trashMatching_(sweepQuery_(cfg), cfg, deadline, offset);

  total += outcome.trashed;
  keptTotal += outcome.keptReplied;
  props.setProperties({
    CLEAN_TOTAL: String(total),
    CLEAN_KEPT: String(keptTotal),
    CLEAN_OFFSET: String(outcome.offset),
    HEARTBEAT: String(Date.now())
  });

  return outcome.done;
}

/* -------------------------------------------------------------------------- summary */

function summaryStep_(cfg, mode) {
  var props = PropertiesService.getScriptProperties();
  var sheet = sheet_(SHEETS.SENDERS);
  var lastRow = sheet.getLastRow();
  var flagged = [];

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, SENDER_HEADERS.length).getValues().forEach(function (record) {
      if (record[COL.VERDICT] === 'DELETE') flagged.push(record);
    });
  }

  var scanned = Number(props.getProperty('SCAN_COUNT') || 0);
  var trashed = Number(props.getProperty('CLEAN_TOTAL') || 0);
  var keptReplied = Number(props.getProperty('CLEAN_KEPT') || 0);
  var started = Number(props.getProperty('RUN_START') || Date.now());
  var minutes = Math.round((Date.now() - started) / 6000) / 10;
  var live = (mode !== 'REPORT' && !cfg.DRY_RUN);
  var label = mode === 'REPORT' ? 'report only'
    : (mode === 'SWEEP' ? (live ? 'sweep' : 'sweep (dry run)')
                        : (live ? 'cleanup' : 'dry run'));

  // Spell out the settings that decide how much actually got deleted, so a small number is
  // self-explanatory instead of looking like a failure.
  var notes = live
    ? 'Mail moved to Trash, recoverable for 30 days.'
    : (mode === 'REPORT'
        ? 'Report only — menu item 2 never deletes. Use "3. Run cleanup now" to delete.'
        : 'Nothing was deleted: DRY_RUN is TRUE in the Config tab. Set it to FALSE there — '
          + 'editing the code does not change it.');
  notes += ' Skipped ' + keptReplied + ' threads you had replied to.'
    + ' PROTECT_IMPORTANT=' + cfg.PROTECT_IMPORTANT
    + ', PROTECT_STARRED=' + cfg.PROTECT_STARRED + '.';

  // The sweep does no scanning, so a zero there is expected rather than a broken search.
  if (mode === 'SWEEP') {
    notes = (live ? 'Swept everything not marked important. Mail is in Trash, recoverable for 30 '
                    + 'days.'
                  : 'Sweep dry run — nothing deleted. ' + trashed + ' threads would go.')
      + ' Search used: ' + sweepQuery_(cfg)
      + '. Skipped ' + keptReplied + ' threads you had replied to.';
  } else if (scanned === 0) {
    notes = 'WARNING: the scan matched 0 messages, so nothing could be flagged. Search used: '
      + scanQuery_(cfg) + ' — check it returns results when pasted into the Gmail search box.';
  }

  sheet_(SHEETS.LOG).appendRow([
    new Date(), label, scanned, flagged.length, trashed, minutes, notes
  ]);

  sendSummary_(cfg, flagged, scanned, trashed, live, keptReplied, mode);
  toast_(live ? ('Done. ' + trashed + ' threads moved to Trash.')
              : ('Done. ' + flagged.length + ' senders flagged, nothing deleted.'));
}

function sendSummary_(cfg, flagged, scanned, trashed, live, keptReplied, mode) {
  var me = myEmail_();
  if (!me) return;

  var url = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  var html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#202124">';
  html += '<h2 style="margin:0 0 4px">Gmail cleanup ' + (live ? 'complete' : '&mdash; dry run') + '</h2>';
  html += '<p style="margin:0 0 16px;color:#5f6368">Scanned ' + scanned + ' messages from the last '
    + cfg.SCAN_WEEKS + ' weeks. ' + flagged.length + ' senders average more than '
    + cfg.THRESHOLD_PER_WEEK + ' emails a week.</p>';

  if (live) {
    html += '<p style="margin:0 0 16px"><b>' + trashed + ' threads moved to Trash.</b> '
      + 'Gmail keeps them for 30 days if you need something back.</p>';
  } else if (mode === 'REPORT') {
    html += '<p style="margin:0 0 16px;padding:10px;background:#fef7e0;border-radius:6px">'
      + '<b>Nothing was deleted &mdash; this was a report.</b> ' + trashed + ' threads would be '
      + 'trashed. Use <b>Gmail Cleanup &rarr; 3. Run cleanup now</b> to delete.</p>';
  } else {
    html += '<p style="margin:0 0 16px;padding:10px;background:#fef7e0;border-radius:6px">'
      + '<b>Nothing was deleted.</b> ' + trashed + ' threads would have been trashed. '
      + '<code>DRY_RUN</code> is <code>TRUE</code> in the <b>Config tab</b> &mdash; set it to '
      + '<code>FALSE</code> there. Editing the code does not change it.</p>';
  }

  html += '<p style="margin:0 0 16px;color:#5f6368;font-size:12px">Skipped ' + keptReplied
    + ' threads you had replied to. PROTECT_IMPORTANT=' + cfg.PROTECT_IMPORTANT
    + ', PROTECT_STARRED=' + cfg.PROTECT_STARRED
    + (cfg.PROTECT_IMPORTANT
        ? ' &mdash; Gmail auto-marks much bulk mail important, so turning PROTECT_IMPORTANT off '
          + 'usually deletes considerably more.'
        : '') + '</p>';

  if (flagged.length) {
    html += '<p style="margin:0 0 8px"><b>Unsubscribe to stop these at the source:</b></p>';
    html += '<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:13px">';
    html += '<tr style="background:#f1f3f4"><th align="left">Sender</th><th align="right">Per week</th>'
      + '<th align="left">Unsubscribe</th></tr>';

    flagged.slice(0, 40).forEach(function (record) {
      var link = record[COL.UNSUB_URL]
        ? '<a href="' + record[COL.UNSUB_URL] + '">unsubscribe</a>'
        : (record[COL.UNSUB_MAILTO]
            ? '<a href="mailto:' + record[COL.UNSUB_MAILTO] + '">email to unsubscribe</a>'
            : '<span style="color:#80868b">no unsubscribe link</span>');
      html += '<tr style="border-top:1px solid #e0e0e0">'
        + '<td>' + escapeHtml_(String(record[COL.NAME] || record[COL.ADDRESS])) + '<br>'
        + '<span style="color:#5f6368;font-size:12px">' + escapeHtml_(String(record[COL.ADDRESS])) + '</span></td>'
        + '<td align="right">' + record[COL.PER_WEEK] + '</td>'
        + '<td>' + link + '</td></tr>';
    });
    html += '</table>';
    if (flagged.length > 40) {
      html += '<p style="color:#5f6368">and ' + (flagged.length - 40) + ' more in the sheet.</p>';
    }
  }

  html += '<p style="margin-top:20px"><a href="' + url + '">Open the cleanup sheet</a></p></div>';

  MailApp.sendEmail({
    to: me,
    subject: 'Gmail cleanup: ' + (live ? trashed + ' threads trashed' : flagged.length + ' bulk senders found'),
    htmlBody: html
  });
}

/* -------------------------------------------------------------------------- triggers */

function installWeeklyTrigger() {
  removeWeeklyTrigger();
  ScriptApp.newTrigger('weeklyRun').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  toast_('Weekly auto-run installed for Monday mornings.');
}

function removeWeeklyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'weeklyRun') ScriptApp.deleteTrigger(trigger);
  });
}

/** What the weekly trigger calls. */
function weeklyRun() {
  startRun_('FULL');
}

/**
 * Queues the next chunk. Normally a minute out, but after a Gmail quota refusal there is no point
 * retrying until the daily allowance rolls over, so back off for hours instead of hammering it.
 */
function scheduleResume_() {
  removeResumeTriggers_();
  var props = PropertiesService.getScriptProperties();
  var pausedAt = Number(props.getProperty('QUOTA_PAUSED') || 0);
  var quotaPaused = pausedAt && (Date.now() - pausedAt) < 60 * 1000;

  if (quotaPaused) {
    props.deleteProperty('QUOTA_PAUSED');
    ScriptApp.newTrigger(RESUME_FN).timeBased().after(6 * 60 * 60 * 1000).create();
    sheet_(SHEETS.LOG).appendRow([new Date(), 'paused', '', '', '', '',
      'Hit Gmail\'s daily limit. Progress is saved; it continues automatically in about 6 hours. '
        + 'A full sweep of a large mailbox can take a few days this way.']);
    toast_('Hit Gmail\'s daily limit. Continues automatically in ~6 hours.');
    return;
  }

  ScriptApp.newTrigger(RESUME_FN).timeBased().after(60 * 1000).create();
}

function removeResumeTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === RESUME_FN) ScriptApp.deleteTrigger(trigger);
  });
}

/* -------------------------------------------------------------------------- helpers */

/**
 * Reads settings from the Config tab, which is the only source of truth — DEFAULTS below just seeds
 * that tab on first setup.
 *
 * Throws rather than falling back to DEFAULTS if the tab is missing or empty. Falling back would
 * silently re-enable DRY_RUN, so a renamed tab would look exactly like a cleanup that decided there
 * was nothing to delete.
 */
function readConfig_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEETS.CONFIG);

  if (!sheet) {
    throw new Error('No "' + SHEETS.CONFIG + '" tab in this spreadsheet. If you renamed it, rename '
      + 'it back to "' + SHEETS.CONFIG + '". Otherwise run "1. Set up sheets" first.');
  }
  if (sheet.getLastRow() < 2) {
    throw new Error('The "' + SHEETS.CONFIG + '" tab is empty. Run "1. Set up sheets" to fill it in.');
  }

  var cfg = {};
  Object.keys(DEFAULTS).forEach(function (key) { cfg[key] = DEFAULTS[key]; });

  var seen = {};
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function (row) {
    var key = String(row[0]).trim();
    if (!(key in DEFAULTS)) return;
    seen[key] = true;
    var value = row[1];
    if (typeof DEFAULTS[key] === 'boolean') {
      cfg[key] = (value === true || String(value).trim().toUpperCase() === 'TRUE');
    } else if (typeof DEFAULTS[key] === 'number') {
      var num = Number(value);
      if (num > 0) cfg[key] = num;
    } else {
      cfg[key] = String(value || '');
    }
  });

  // A deleted DRY_RUN row would quietly default back to TRUE, which is the same trap.
  if (!seen.DRY_RUN) {
    throw new Error('No DRY_RUN row in the "' + SHEETS.CONFIG + '" tab. Add one, or run '
      + '"1. Set up sheets" on a fresh copy.');
  }
  return cfg;
}

function isAllowlisted_(address, allowlist) {
  if (!allowlist) return false;
  return String(allowlist).split(/[,\n]/).some(function (raw) {
    var entry = raw.trim().toLowerCase();
    if (!entry) return false;
    if (entry.charAt(0) === '@') return address.slice(-entry.length) === entry;
    return address === entry;
  });
}

/** "Store Name <news@store.com>" -> "news@store.com" */
function parseAddress_(from) {
  var match = String(from).match(/<([^>]+)>/);
  var address = match ? match[1] : String(from);
  return address.trim().toLowerCase();
}

/** "Store Name <news@store.com>" -> "Store Name" */
function parseName_(from) {
  var name = String(from).replace(/<[^>]*>/, '').trim().replace(/^["']|["']$/g, '').trim();
  return name || parseAddress_(from);
}

function myEmail_() {
  var email = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '';
  return email.toLowerCase();
}

/* State lives in a hidden sheet rather than script properties, which cap out at 9KB per value —
   a busy mailbox easily has more senders than that. */

function loadState_() {
  var sheet = sheet_(SHEETS.STATE);
  var tally = {};
  if (sheet.getLastRow() < 1) return tally;
  sheet.getRange(1, 1, sheet.getLastRow(), 4).getValues().forEach(function (row) {
    if (!row[0]) return;
    tally[String(row[0])] = { name: row[1], messages: Number(row[2]), sampleId: String(row[3]) };
  });
  return tally;
}

function saveState_(tally) {
  var sheet = sheet_(SHEETS.STATE);
  var rows = Object.keys(tally).map(function (address) {
    var entry = tally[address];
    return [address, entry.name, entry.messages, entry.sampleId];
  });
  sheet.clear();
  if (rows.length) sheet.getRange(1, 1, rows.length, 4).setValues(rows);
}

function clearState_() {
  sheet_(SHEETS.STATE).clear();
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ensureSheet_(ss, name);
}

function ensureSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function escapeHtml_(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Toasts only work when a person has the sheet open; triggers run without one. */
function toast_(message) {
  try {
    SpreadsheetApp.getActiveSpreadsheet().toast(message, 'Gmail Cleanup', 8);
  } catch (err) {
    // Running from a trigger, nothing to toast to.
  }
}
