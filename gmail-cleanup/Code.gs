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
  ALLOWLIST: ''
};

var CONFIG_NOTES = {
  SCAN_WEEKS: 'How many weeks back to look when measuring how often a sender mails you.',
  THRESHOLD_PER_WEEK: 'More than this many emails per week means the sender gets deleted.',
  DRY_RUN: 'TRUE = report only, delete nothing. Set to FALSE once the Senders list looks right.',
  PROTECT_STARRED: 'TRUE = never delete starred mail.',
  PROTECT_IMPORTANT: 'TRUE = never delete mail Gmail marked important. Gmail marks a lot of bulk '
    + 'mail important, so set this FALSE if the cleanup deletes less than you expected.',
  ALLOWLIST: 'Never delete these, whatever the numbers say. Comma-separated. Accepts full '
    + 'addresses (news@store.com) and whole domains (@mybank.com).'
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

function runCleanupNow() {
  var cfg = readConfig_();
  if (cfg.DRY_RUN) {
    var ui = SpreadsheetApp.getUi();
    var answer = ui.alert('DRY_RUN is on',
      'Config has DRY_RUN set to TRUE, so this run will report but delete nothing.\n\n'
        + 'Continue as a dry run?', ui.ButtonSet.YES_NO);
    if (answer !== ui.Button.YES) return;
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
    PHASE: 'SCAN',
    SCAN_CURSOR: '0',
    SCAN_COUNT: '0',
    CLEAN_ROW: '2',
    CLEAN_TOTAL: '0',
    CLEAN_OFFSET: '0',
    RUN_START: String(Date.now())
  });
  clearState_();
  toast_(mode === 'REPORT' ? 'Scanning. The Senders tab fills in as it goes.' : 'Cleanup started.');
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
      if (phase === 'SCAN') {
        if (!scanStep_(cfg, deadline)) break;
        phase = 'CLASSIFY';
      } else if (phase === 'CLASSIFY') {
        classifyStep_(cfg);
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
 * Walks the scan window tallying messages per sender. Returns true when the whole window is done,
 * false when it ran out of time and needs another pass.
 */
function scanStep_(cfg, deadline) {
  var props = PropertiesService.getScriptProperties();
  var cursor = Number(props.getProperty('SCAN_CURSOR') || 0);
  var counted = Number(props.getProperty('SCAN_COUNT') || 0);
  var me = myEmail_();
  var tally = loadState_();

  var query = 'newer_than:' + cfg.SCAN_WEEKS + 'w -in:sent -in:draft -in:trash -in:chats';

  while (true) {
    if (Date.now() > deadline) {
      saveState_(tally);
      props.setProperties({ SCAN_CURSOR: String(cursor), SCAN_COUNT: String(counted) });
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
  }

  saveState_(tally);
  props.setProperties({ SCAN_CURSOR: String(cursor), SCAN_COUNT: String(counted) });
  return true;
}

/* -------------------------------------------------------------------------- classify */

/** Turns the tally into the Senders tab: rate, verdict, and unsubscribe links for the flagged. */
function classifyStep_(cfg) {
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
    if (verdict === 'DELETE') unsub = unsubscribeLinks_(entry.sampleId);

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

  var data = sheet.getRange(2, 1, lastRow - 1, SENDER_HEADERS.length).getValues();
  var row = Number(props.getProperty('CLEAN_ROW') || 2);
  var total = Number(props.getProperty('CLEAN_TOTAL') || 0);
  // Where we left off inside the sender we were part-way through when time ran out.
  var offset = Number(props.getProperty('CLEAN_OFFSET') || 0);

  for (; row <= lastRow; row++) {
    var record = data[row - 2];
    if (!record || record[COL.VERDICT] !== 'DELETE') continue;

    var outcome = trashSender_(String(record[COL.ADDRESS]), cfg, deadline, offset);
    offset = 0;

    if (outcome.trashed) {
      var running = Number(record[COL.TRASHED] || 0) + outcome.trashed;
      sheet.getRange(row, COL.TRASHED + 1).setValue(running);
      total += outcome.trashed;
    }

    if (!outcome.done) {
      props.setProperties({
        CLEAN_ROW: String(row),
        CLEAN_TOTAL: String(total),
        CLEAN_OFFSET: String(outcome.offset)
      });
      return false;
    }
  }

  props.setProperties({
    CLEAN_ROW: String(row),
    CLEAN_TOTAL: String(total),
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
  var query = 'from:' + address + ' -in:sent -in:draft -in:trash -in:chats';
  if (cfg.PROTECT_STARRED) query += ' -is:starred';
  if (cfg.PROTECT_IMPORTANT) query += ' -is:important';

  var me = myEmail_();
  var offset = startOffset || 0;
  var trashed = 0;

  while (true) {
    if (Date.now() > deadline) return { trashed: trashed, done: false, offset: offset };

    var threads = GmailApp.search(query, offset, PAGE);
    if (!threads.length) return { trashed: trashed, done: true, offset: offset };

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

    if (cfg.DRY_RUN) {
      trashed += doomed.length;
      offset += threads.length;
    } else {
      for (var i = 0; i < doomed.length; i += PAGE) {
        GmailApp.moveThreadsToTrash(doomed.slice(i, i + PAGE));
      }
      trashed += doomed.length;
      offset += kept;
    }
  }
}

function iReplied_(messages, me) {
  if (!me) return false;
  return messages.some(function (message) {
    return parseAddress_(message.getFrom()) === me;
  });
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
  var started = Number(props.getProperty('RUN_START') || Date.now());
  var minutes = Math.round((Date.now() - started) / 6000) / 10;
  var live = (mode === 'FULL' && !cfg.DRY_RUN);
  var label = live ? 'cleanup' : (mode === 'REPORT' ? 'report only' : 'dry run');

  sheet_(SHEETS.LOG).appendRow([
    new Date(), label, scanned, flagged.length, trashed, minutes,
    live ? 'Mail moved to Trash, recoverable for 30 days.'
         : 'Nothing was deleted. Set DRY_RUN to FALSE in Config to delete for real.'
  ]);

  sendSummary_(cfg, flagged, scanned, trashed, live);
  toast_(live ? ('Done. ' + trashed + ' threads moved to Trash.')
              : ('Done. ' + flagged.length + ' senders flagged, nothing deleted.'));
}

function sendSummary_(cfg, flagged, scanned, trashed, live) {
  var me = myEmail_();
  if (!me) return;

  var url = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  var html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#202124">';
  html += '<h2 style="margin:0 0 4px">Gmail cleanup ' + (live ? 'complete' : '&mdash; dry run') + '</h2>';
  html += '<p style="margin:0 0 16px;color:#5f6368">Scanned ' + scanned + ' messages from the last '
    + cfg.SCAN_WEEKS + ' weeks. ' + flagged.length + ' senders average more than '
    + cfg.THRESHOLD_PER_WEEK + ' emails a week.</p>';

  html += live
    ? '<p style="margin:0 0 16px"><b>' + trashed + ' threads moved to Trash.</b> '
      + 'Gmail keeps them for 30 days if you need something back.</p>'
    : '<p style="margin:0 0 16px;padding:10px;background:#fef7e0;border-radius:6px">'
      + '<b>Nothing was deleted.</b> ' + trashed + ' threads would have been trashed. '
      + 'Set <code>DRY_RUN</code> to <code>FALSE</code> in the Config tab to run it for real.</p>';

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

function scheduleResume_() {
  removeResumeTriggers_();
  ScriptApp.newTrigger(RESUME_FN).timeBased().after(60 * 1000).create();
}

function removeResumeTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === RESUME_FN) ScriptApp.deleteTrigger(trigger);
  });
}

/* -------------------------------------------------------------------------- helpers */

function readConfig_() {
  var sheet = sheet_(SHEETS.CONFIG);
  var cfg = {};
  Object.keys(DEFAULTS).forEach(function (key) { cfg[key] = DEFAULTS[key]; });

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function (row) {
      var key = String(row[0]).trim();
      if (!(key in DEFAULTS)) return;
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
