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

## Config

| Setting | Default | What it does |
| --- | --- | --- |
| `SCAN_WEEKS` | 8 | How far back to look when measuring a sender's rate. |
| `THRESHOLD_PER_WEEK` | 3 | More than this many per week and the sender gets deleted. |
| `DRY_RUN` | TRUE | Report but delete nothing. Set FALSE when the Senders list looks right. |
| `PROTECT_STARRED` | TRUE | Never delete starred mail. |
| `PROTECT_IMPORTANT` | TRUE | Never delete mail Gmail marked important. |
| `ALLOWLIST` | empty | Never delete these. Comma-separated, takes `news@store.com` or `@mybank.com`. |

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
