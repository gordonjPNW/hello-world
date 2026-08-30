# CLAUDE.md

Project memory for the ROG Ally X game-optimization work.

## Who I am working with

Gordon is **new to command-line tooling**. Give step-by-step instructions that assume no terminal
experience: exact commands to type, what the expected output looks like, and what to do when it
does not appear. Do not assume familiarity with shells, PATH, git, or package managers. Explain a
thing the first time it comes up rather than referring to it as if known.

He sends screenshots of the terminal rather than pasted text. Read them; they are usually complete
enough to diagnose from.

Available input methods on the device: on-screen keyboards, a dock with keyboard and mouse, and
PowerShell. Terminal access is not a constraint.

## The device

**ASUS ROG Ally X (2024)**, Windows 11, Ryzen Z1 Extreme, 24 GB RAM.

- Windows username is `gordo`. Project lives at `C:\Users\gordo\Documents\Claude\hello-world`.
- `C:\Users\gordo\Documents\Claude\set-refresh-rate.ps1` predates this project. allytune will
  absorb it and add `-List` / `-Display N`, because it currently targets whichever display is
  primary and silently addresses the TV while docked.
- Battery health ~83% (66.5 Wh against 80 Wh nominal). Runtime estimates are against that.
- Memory Integrity is **off**. Relevant twice: it helps CPU-bound titles, and it is what will let
  the phase 2 low-level power driver load at all.
- Internal panel confirmed at 120 Hz. Docked runs an Alienware 32" at 3840×2160, currently limited
  to 59/60 Hz by a suspect dock.

**Always run the terminal as Administrator.** PresentMon needs it for ETW tracing and phase 2 needs
it for SMU access. A non-elevated session looks fine until it fails at the measurement.

## The work

Branch: `claude/rog-ally-game-optimizer-5ljjo5`.

Building **allytune**, a Python tool that runs on the device and tunes one game at a time under a
strict measurement protocol. See [docs/allytune/00-plan.md](docs/allytune/00-plan.md).

Decisions already taken: direct programmatic TDP control, Python, full autonomy within a session,
Uncharted 4 first.

### The principle behind all of it

Miles Morales tuned well because 10 W → 17 W was a **148%** difference — visible by eye, immune to
sloppy method. Uncharted 4 did not, because ordinary tuning changes are worth 5–15%, which is below
the noise floor of playing for a bit and forming an impression.

So: **establish the noise floor from three identical runs before testing anything**, and report any
change smaller than it as no measurable difference. Never present an unreplicated result as a
finding.

Related, and already proven once on this hardware: the documented perf-per-watt curve predicted
+35% and measured +148%, because the curve came from GPU-bound work and Miles Morales is CPU-bound.
**Priors about this chip do not transfer between games.** Measure each one.

## Key documents

| File | What it holds |
|---|---|
| `ally-x-tdp-reference.md` | Measured TDP profiles, fan curve, display config, results, open items |
| `docs/allytune/00-plan.md` | allytune architecture, protocol, build phases |
| `docs/allytune/01-claude-code-on-the-ally.md` | Device setup |
| `docs/allytune/02-using-claude-code.md` | Beginner command reference |
| `docs/ally-x/` | The original 11-phase manual runbook |
| `.claude/settings.json` | Permission allowlist, so sessions run without prompts |

## Conventions

- Commit to the feature branch. Do not open a PR unless asked.
- Prose in docs: explain *why*, not just what. The existing docs set that standard — match it.
- When a measurement is uncertain or unreplicated, say so in the document rather than rounding it
  into a confident claim.
