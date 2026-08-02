# Gmail bulk-mail cleanup

Finds every sender who mails you more than three times a week, moves their entire history to Trash,
and emails you the list with unsubscribe links so you can stop them at the source.

It runs as a Google Apps Script inside your own Google account. No install, no Google Cloud project,
no API keys, nothing on your computer. Because it's tied to an *account* and not a device, there is
no Mac vs Android version — the same sheet works for anyone you give it to.

## Setup (about 5 minutes, needs a desktop browser)

1. Go to [sheets.new](https://sheets.new) to make a blank spreadsheet. Name it something like
   "Gmail Cleanup".
2. **Extensions → Apps Script**. An editor opens in a new tab.
3. Delete the placeholder `function myFunction() {}` and paste in all of [`Code.gs`](Code.gs). Save.
4. Click the gear (**Project Settings**) in the left sidebar and tick
   **"Show 'appsscript.json' manifest file in editor"**.
5. Back in **Editor**, open `appsscript.json` and replace it with [this one](appsscript.json). Save.
   This is what turns on the Gmail service the unsubscribe-link lookup needs.
6. Reload the spreadsheet tab. A **Gmail Cleanup** menu appears next to Help.
7. **Gmail Cleanup → 1. Set up sheets**, and approve the permissions when asked.

On the permission screen Google will warn that the app isn't verified. That's expected — "unverified"
just means it's a personal script that hasn't been through Google's review, not that anything is
wrong. Click **Advanced → Go to (your project name)** to continue. The code is right here in this
repo if you want to read what you're approving.

## Using it

**Gmail Cleanup → 2. Scan & report** first. It reads the last 8 weeks, works out how often each
sender mails you, and fills in the **Senders** tab. It deletes nothing, ever — this step is safe to
run as many times as you like.

On a big mailbox this takes several minutes and runs in bursts, pausing and resuming itself. Rows
appear in the **Senders** tab as it goes; **Show run status** tells you where it's up to.

Read that list before going further. Anything marked `DELETE` is scheduled to lose its **entire
history**, not just recent mail. Sort by "Per week" and look for anyone you'd miss — that's the
step that catches the store you actually order from. Add those to `ALLOWLIST` in the **Config** tab.

Then set `DRY_RUN` to `FALSE` in Config and run **3. Run cleanup now**.

Finally, **Install weekly auto-run**. It runs itself every Monday at 7am and emails you a summary of
what it trashed plus any new bulk senders with unsubscribe links. That summary is the whole point of
the schedule: once it's on, you never open the sheet again, which is why it works fine if you live
on your phone.

A big mailbox takes longer than Google allows a single script run to last. The script handles that
itself — it saves its place, schedules itself to pick up a minute later, and repeats until it's
finished. If a run seems to stop early, it hasn't; check the **Log** tab in a few minutes.

## The sweep: delete everything not marked important

The threshold cleanup only touches senders who *currently* exceed your rate limit, so most of a large
old mailbox is out of its reach by design. **Gmail Cleanup → Sweep everything not important** is the
blunt instrument: it trashes everything Gmail didn't flag as important, mailbox-wide, with no sender
analysis at all.

It always keeps:

- **Important mail** — that's the whole selector
- **Starred mail**, and **threads you replied to**
- **Anything from the last 30 days**, even if unimportant (`SWEEP_KEEP_DAYS`)
- **Anything with an attachment** (`SWEEP_PROTECT_ATTACHMENTS`)
- **Allowlisted senders**

To go harder, set `SWEEP_KEEP_DAYS` to `0` and `SWEEP_PROTECT_ATTACHMENTS` to `FALSE`. Those two are
the difference between "aggressive" and "everything that isn't important, full stop."

Before it starts, the confirmation dialog prints the exact Gmail search it will use. **Paste that into
Gmail's search box first** — the result count is precisely what's about to be deleted, and it takes
seconds. Worth doing once even though everything is recoverable from Trash for 30 days.

The sweep is deliberately manual and never runs on the weekly trigger. Only the threshold cleanup is
scheduled.

**It may take days.** Gmail allows a script roughly 20,000 operations per day. A sweep of a 30k+
mailbox will exhaust that, which is fine — it saves its place, writes a `paused` row in the Log, and
resumes automatically about 6 hours later, repeating until it finishes. Attachments and importance
protections mean the count also won't match your total message count.

## Config

| Setting | Default | What it does |
| --- | --- | --- |
| `SCAN_WEEKS` | 8 | How far back to look when measuring a sender's rate. |
| `THRESHOLD_PER_WEEK` | 3 | More than this many per week and the sender gets deleted. |
| `DRY_RUN` | TRUE | Report but delete nothing. Set FALSE when the Senders list looks right. |
| `PROTECT_STARRED` | TRUE | Never delete starred mail. |
| `PROTECT_IMPORTANT` | TRUE | Never delete mail Gmail marked important. |
| `ALLOWLIST` | empty | Never delete these. Comma-separated, takes `news@store.com` or `@mybank.com`. |
| `SWEEP_KEEP_DAYS` | 30 | Sweep only: keep mail newer than this many days. `0` sweeps everything. |
| `SWEEP_PROTECT_ATTACHMENTS` | TRUE | Sweep only: never delete mail with attachments. |

## What it will never delete

- Threads you've replied to. If you sent a message in it, it's a conversation, not bulk mail.
- Starred and important mail, while those two flags are on.
- Anything in `ALLOWLIST`, your own address, or your Sent and Drafts.

Deleted mail goes to **Trash**, not a permanent delete, so you have 30 days to pull something back
before Gmail purges it for good.

## Giving it to someone else

Open your sheet, then **File → Make a copy** is what *they* do, not you. Send them the sheet's URL
with `/edit` at the end swapped for `/copy`:

```
https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/copy
```

They click it, get their own copy with the script already inside, approve the permissions in their
own account, and start at "Using it" above. Their copy touches only their mailbox and they never see
yours — the script always runs as whoever authorized it. Your Config, allowlist, and logs don't
follow the copy in any meaningful way, so tell them to run **Set up sheets** and do their own dry run
first.

Setup needs a real browser, so have them do it on a computer. After that it's automatic and they can
ignore it from their phone.

## Troubleshooting

**Nothing was deleted.** `DRY_RUN` lives in the **Config tab of the spreadsheet**, not in the code.
The `DEFAULTS` block in `Code.gs` only fills that tab in the first time you run "Set up sheets" —
after that the sheet wins and editing the code changes nothing. Use **Gmail Cleanup → Show current
settings** to see what the script actually reads. Also check which menu item you clicked: **2. Scan &
report** never deletes, whatever `DRY_RUN` says. Deleting is **3. Run cleanup now**.

**The Senders tab is empty, or the run seems to have done nothing.** On a large mailbox the scan
takes longer than Google allows one script run to last, so it works in ~4-minute bursts and picks
itself up about a minute later. The Senders tab now refreshes after every burst, so you should see
rows appearing. **Gmail Cleanup → Show run status** tells you which phase it's in and whether a
continuation is queued. If it says nothing is queued and the phase isn't DONE, the run stalled —
open **Extensions → Apps Script → Executions** to see the error, then start it again.

**It deleted far less than the dry run projected.** `PROTECT_IMPORTANT` is on by default and Gmail
auto-marks a lot of promotional mail as important. Set it to `FALSE` in Config and run again. The
summary email and Log now print both protection flags for exactly this reason.

**"Config tab not found" or "Config tab is empty".** The tab was renamed or deleted. Rename it back
to `Config`, or run "Set up sheets" on a fresh copy. The script refuses to guess here on purpose —
falling back to defaults would silently turn `DRY_RUN` back on.

## Two things that surprise people on the first run

**The cleanup deletes less than the dry run said it would.** Gmail auto-marks a lot of promotional
mail as "important", and `PROTECT_IMPORTANT` skips all of it. Set that to `FALSE` in Config and run
again.

**A sender you wanted got flagged.** Three-a-week is a blunt rule. Retailers you actually buy from
blow past it during a sale, and since the sweep covers their whole history it takes old receipts and
shipping confirmations too. Nothing is gone for 30 days — pull it out of Trash, then add the sender
to `ALLOWLIST` so it doesn't happen again next Monday.

## Quotas

Consumer Gmail accounts get 20,000 Gmail read operations a day from Apps Script; Workspace accounts
get more. The script batches its reads to stay well under that, but a first run over a decade of mail
on a very large mailbox could hit the ceiling. If it does, the run stops with a quota error in the
**Log** tab — just run it again the next day and it'll continue from where it stopped.
