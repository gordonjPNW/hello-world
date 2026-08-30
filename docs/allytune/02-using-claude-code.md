# Using Claude Code on the Ally — step by step

Written for someone who has not used a terminal before. Nothing here is assumed.

## What you are actually doing

Claude Code is not an app with windows and buttons. It runs inside a **terminal** — a text window
where you type a command, press Enter, and read what comes back. That is the whole interaction.

You will use exactly two kinds of command:

- **Commands typed at the terminal**, like `claude --version`. These run and finish.
- **Slash commands typed at Claude**, like `/help`. These only work once Claude is already running.

Telling them apart matters, because typing `/help` at the terminal does nothing useful, and typing
`claude --version` at Claude just asks me about it instead of running it.

---

## Step 1 — Open the terminal, as Administrator

1. Press the **Windows key**.
2. Type `terminal`.
3. **Right-click** "Windows Terminal" in the results and choose **"Run as administrator"**.
4. A box asks "Do you want to allow this app to make changes?" — choose **Yes**.

You get a black window with a line of text ending in `>`. That is the **prompt**. It is waiting for
you.

**Always run as administrator for this project.** Measuring frame rates needs it, and changing
power limits later needs it. A normal window looks identical and works fine right up until it
silently fails at the important step.

You can tell you got it right: the window title starts with **"Administrator:"**.

### PowerShell or Command Prompt?

Windows has two shells and they look nearly identical. Windows Terminal opens **PowerShell** by
default, which is what everything here assumes.

Tell them apart by the prompt:

- `PS C:\Users\gordo>` — PowerShell. What you want.
- `C:\Users\gordo>` — Command Prompt (CMD). No `PS`.

Every `claude` command in this document works identically in both, so if you land in CMD you can
carry on. The difference only matters for PowerShell-specific commands like the installer, which is
why the setup guide gives a separate CMD version of that one line.

---

## Step 2 — Go to the project folder

The terminal is always "in" a folder. You need it in the project folder. Type this and press Enter:

```
cd C:\Users\gordo\Documents\Claude\hello-world
```

`cd` means "change directory". The prompt changes to show the new location.

If you get **"The system cannot find the path specified"**, the project is not there yet — go back
to [the setup guide](01-claude-code-on-the-ally.md) and clone it first.

---

## Step 3 — Check it is installed

```
claude --version
```

**Expected:** a version number, like `2.1.211 (Claude Code)`.

**If you get "claude is not recognized..."**, one of two things is true:

- You have not opened a new terminal since installing. Close this window, open a fresh one as
  administrator, try again. A PATH change never reaches a window that was already open.
- PATH was never fixed. Run this, then open a new terminal:

  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-ally.ps1
  ```

---

## Step 4 — Check the installation is healthy

```
claude doctor
```

This prints a diagnostic report — whether the install is sound, whether the settings files are
valid, and warnings with suggested fixes. It does **not** start a session, so it is always safe to
run.

Run it any time something feels wrong. It is the first thing I will ask you for.

---

## Step 5 — Log in (first time only)

```
claude
```

The first time, this opens a browser and asks you to log in. Use the account with your Claude
subscription — Pro or Max. The free plan does not include Claude Code.

You only do this once. After that, `claude` goes straight into a session.

---

## Step 6 — Talk to it

Once running, the prompt changes and you simply type in plain English:

```
> what files are in this project?
```

Press Enter. I read the project, do the work, and reply. You do not need special syntax.

While I am working you will see tool calls scroll past — files being read, commands being run.
That is normal, and it is what you are watching for during a tuning session.

---

## The commands you will actually use

**At the terminal** (Claude not running):

| Command | What it does |
|---|---|
| `claude` | Start a session |
| `claude --version` | Print the version. Confirms it is installed |
| `claude doctor` | Health check. Safe, read-only, does not start a session |
| `claude update` | Update to the latest version |
| `claude --continue` | Reopen the most recent conversation in this folder |
| `claude --resume` | Pick from a list of earlier conversations |

`--continue` and `--resume` are the important ones for us. A tuning session spans an evening; when
you come back, `claude --continue` picks up with everything still in context instead of starting
cold.

**At Claude** (session running):

| Command | What it does |
|---|---|
| `/help` | List available commands |
| `/status` | Show current session state |
| `/clear` | Start fresh with empty context, same session |
| `/compact` | Summarise the conversation to free up room when it gets long |
| `/resume` | Jump back to an earlier conversation |
| `/model` | Switch model |
| `/permissions` | See and edit what I am allowed to run without asking |
| `/config` | Settings — theme, model, preferences |
| `/login` `/logout` | Sign in and out |
| `/exit` | Quit. Alias: `/quit` |

---

## Getting out and interrupting

- **To stop me mid-task**, press **Esc**. I stop; the session stays open.
- **To quit**, type `/exit` and press Enter.
- **If truly stuck**, press **Ctrl+C** a couple of times, or close the window. Nothing is lost —
  conversations are saved, and `claude --continue` brings the last one back.

---

## The shortcut

Typing is the slow part on a handheld, so the repo has `tune.cmd`. From the project folder:

| Type this | What happens |
|---|---|
| `tune` | Starts Claude Code and hands it the current work brief |
| `tune resume` | Reopens the most recent conversation |
| `tune doctor` | Health check, no session |

Four characters instead of a sentence. If `claude` is not on PATH it tells you exactly how to fix
it rather than failing with a Windows error.

## Pasting into the terminal

Copying commands from a phone or another machine does not always work. Three ways in:

- **Windows Terminal** — `Ctrl+V`. This is the modern one, and the bootstrap script installs it.
- **Command Prompt (the older black window)** — **right-click** pastes. `Ctrl+V` may not.
- **Neither works** — use `tune`, or open this repo's docs on the device itself and read the
  commands from there.

Prefer Windows Terminal. Press the Windows key, type `terminal`, right-click, run as administrator.
It handles paste, tabs and scrolling far better than the legacy Command Prompt.

## A normal session, start to finish

```
1. Windows key → type "terminal" → right-click → Run as administrator
2. cd C:\Users\gordo\Documents\Claude\hello-world
3. tune                     (or: tune resume, to pick up where you left off)
4. ...work...
5. /exit
```

Five lines, and only one of them is longer than a word.

---

## When something goes wrong

Do not try to diagnose it. Copy the error text — or take a screenshot, which works fine — and paste
it to me. Screenshots of the terminal are genuinely useful; I can read them.

`claude doctor` output is the single most useful thing to send when the problem is with Claude Code
itself rather than the project.
