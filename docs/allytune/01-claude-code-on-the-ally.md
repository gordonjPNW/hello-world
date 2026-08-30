# Getting Claude Code onto the Ally X

The install itself is one command. The part worth planning is **where you type during a tuning
run**, because the handheld will be running a game full-screen at a fixed camera position, and
anything that pulls focus away from it destroys the measurement.

## Where you type

You have on-screen keyboards, so all three of these work. They differ in what they cost you
*during a capture*.

| | How | Good for | Cost |
|---|---|---|---|
| **On the handheld** | Windows Terminal + on-screen keyboard | Setup, quick checks, anything between runs | Steals the screen from the game — unusable mid-capture |
| **Docked** | Ally in the dock, keyboard and mouse on the Alienware | Writing code, long sessions, comfort | Not available while playing handheld |
| **SSH from another machine** | Laptop or desktop drives the Ally over the network | **Tuning sessions** | One-time setup |

Any of them is fine for installing and configuring. Do it on the handheld with the OSK if that is
what is in front of you.

**SSH earns its place during runs, not during setup.** A 90-second capture requires the game to
hold foreground and a steady frame rate for the whole window. Tabbing to a terminal to start or
stop a run drops the game out of focus, changes what the GPU is doing, and puts a spike in exactly
the frametime data the run exists to collect. Typing from another machine sidesteps that entirely —
the Ally never knows you are there.

The bootstrap script sets SSH up for you with `-EnableSsh`. It is worth the five minutes even
though you can type on the device.

The allytune web UI (phase 4) is the other answer to the same problem: a touch target on the Ally's
own screen or your phone to start and stop a run, with the game still in front. Between SSH and
that, you should never need to alt-tab during a capture.

## Setup

Open **Windows Terminal as Administrator** — on the handheld with the on-screen keyboard, or
docked with a keyboard if you would rather. Either is fine for this part.

Administrator matters and keeps mattering. PresentMon needs it to open an ETW trace, and phase 2
power control needs it to talk to the SMU. A non-elevated session will fail at the first real
measurement, so make elevated the habit now.

### 1. Prerequisites and Claude Code

```powershell
mkdir C:\Users\gordo\Documents\Claude -Force
cd C:\Users\gordo\Documents\Claude
git clone https://github.com/gordonjPNW/hello-world.git
cd hello-world
git checkout claude/rog-ally-game-optimizer-5ljjo5

powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-ally.ps1 -EnableSsh
```

If `git` is not installed yet, chicken-and-egg: install it first with
`winget install --id Git.Git --exact`, then run the clone.

The script installs Git for Windows, Python 3.12, Windows Terminal and Claude Code, enables the
OpenSSH server, and verifies the lot. It is idempotent — re-run it any time.

`-ExecutionPolicy Bypass` is required for the same reason it was for `set-refresh-rate.ps1`:
Windows blocks unsigned local scripts, and the call operator with a quoted path does not get past
it.

**Git for Windows is not optional here**, despite being optional in the official docs. It supplies
Git Bash, which is what gives me the Bash tool. Without it I am restricted to PowerShell, which
makes the analysis and file-patching work in later phases considerably clumsier.

### 2. Log in

Open a **new** terminal — PATH changes do not reach a shell that was already running — then:

```powershell
cd C:\Users\gordo\Documents\Claude\hello-world
claude
```

A browser opens for login. Claude Code needs a Pro or Max account; the free plan does not include
it.

Verify with:

```powershell
claude --version
claude doctor
```

`claude doctor` prints install health and flags settings-file problems without starting a session.
Run it if anything looks wrong later.

### 3. Confirm SSH works

From your other machine, on the same network:

```
ssh gordo@<ally-ip>
```

The bootstrap script prints the Ally's addresses at the end. Once connected, `cd` to the repo and
run `claude` there — same session, typed from a real keyboard, with the handheld free to run the
game.

Worth confirming now, while a broken SSH setup is a minor annoyance, rather than at the start of a
tuning session when it is the thing standing between you and a clean capture.

## Interruptions

You asked for no interruptions, and permission prompts are the main source of them.

`.claude/settings.json` in this repo already carries an allowlist: git operations, file reads and
edits, `allytune` commands, read-only PowerShell (`Get-*`), and the docs domains. Those run without
asking. Genuinely destructive things — force pushes, hard resets, recursive deletes — are on the
deny list and stay there.

That covers the routine loop. If some specific command keeps prompting during a session, tell me
and I will add it to the allowlist rather than you approving it twenty times.

There is also `claude --dangerously-skip-permissions`, which approves everything. It is a real
option on a personal device you own, and it is the flag's name for a reason: it removes the last
check on commands that touch your game installs, your saves and your power limits. My
recommendation is the allowlist — it gets you to the same zero-prompt experience for the commands
we actually run, without also pre-approving the one that goes wrong.

## Repo layout on the device

```
C:\Users\gordo\Documents\Claude\
  set-refresh-rate.ps1        existing - allytune will absorb and extend this
  hello-world\
    .claude\settings.json     permission allowlist
    scripts\bootstrap-ally.ps1
    docs\allytune\            the plan and this guide
    docs\ally-x\              the existing manual runbook
    ally-x-tdp-reference.md   measured profiles, fan curve, results
```

Cloning into the existing `Documents\Claude` folder keeps everything in one place and puts
`set-refresh-rate.ps1` next door — phase 1 will fold it in, along with the `-List` and `-Display N`
options the reference doc already flags as needed, so it can stop silently addressing the TV.

## Troubleshooting

**`claude` not recognised after install.** PATH was updated but your shell predates the change.
Open a new terminal. If it persists, confirm `C:\Users\gordo\.local\bin` is on PATH — that is where
the native installer puts the binary.

**`irm` is not recognised.** You are in CMD, not PowerShell. The prompt shows `PS C:\` in
PowerShell. Use the CMD form instead:
`curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd`

**Claude Code cannot find Git Bash.** Point it explicitly in `.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_GIT_BASH_PATH": "C:\\Program Files\\Git\\bin\\bash.exe" } }
```

**SSH connects but commands behave oddly.** The bootstrap script sets the default SSH shell to
PowerShell; without that you land in `cmd`. Re-run it with `-EnableSsh` from an elevated terminal.

**The Ally sleeps mid-session.** Expected, and it will interrupt a long run. Set it to stay awake
while plugged in for tuning sessions — but change it back afterwards, because the standby drain
check in the reference doc's open items depends on sleep actually working.

## Next

Phase 1 of [the plan](00-plan.md): capture, telemetry and analysis, read-only. Nothing writes to
the machine until that can resolve a 5% difference on Uncharted 4.

Sources: [Claude Code setup docs](https://code.claude.com/docs/en/setup)
