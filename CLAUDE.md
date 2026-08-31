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

**ASUS ROG Ally X (2024)**, Windows 11 Home 10.0.26200, Ryzen Z1 Extreme (8 cores), BIOS RC72LA.312.

- **RAM: 24 GB installed, but Windows sees 15.7 GB** — 8 GB is carved out as dedicated VRAM for
  the iGPU. Both numbers are true and the difference matters: a game plus Windows is working
  against 15.7 GB. Verified 2026-08-30.
- GPU driver 32.0.31007.6002 (2026-05-17).
- Windows username is `gordo`. Project lives at `C:\Users\gordo\Documents\Claude\hello-world`.
- `C:\Users\gordo\Documents\Claude\set-refresh-rate.ps1` predates this project. allytune will
  absorb it and add `-List` / `-Display N`, because it currently targets whichever display is
  primary and silently addresses the TV while docked.
- Battery health ~83% (66.5 Wh against 80 Wh nominal). Runtime estimates are against that.
- Memory Integrity is **off**. Relevant twice: it helps CPU-bound titles, and it is what will let
  the phase 2 low-level power driver load at all.
- Internal panel confirmed at 120 Hz. Docked runs an Alienware 32" at 3840×2160, currently limited
  to 59/60 Hz by a suspect dock.

**Always run the terminal as Administrator** — but for the real reasons, not the one previously
recorded here. Corrected 2026-08-30 by testing on the device:

- **PresentMon does NOT need elevation to capture.** It traced 357 frames from a normal user
  shell. The earlier claim that "a non-elevated session looks fine until it fails at the
  measurement" was wrong. What elevation actually buys is process-name resolution: without it,
  short-lived or other-account processes show as `<unknown>` and `--process_name` targeting is
  unreliable. allytune sidesteps this by filtering the CSV after the fact.
- **LibreHardwareMonitor genuinely cannot start without elevation.** Its manifest requires it, so
  unelevated there is no telemetry at all — no package power, no clocks, no temperatures.
- Phase 2 needs it for SMU access.

So: unelevated you can still measure frametimes, and that is most of phase 1. You cannot measure
power or heat.

## The work

Branch: `claude/rog-ally-game-optimizer-5ljjo5`.

Building **allytune**, a Python tool that runs on the device and tunes one game at a time under a
strict measurement protocol. See [docs/allytune/00-plan.md](docs/allytune/00-plan.md).

Decisions already taken: direct programmatic TDP control, Python, full autonomy within a session,
Uncharted 4 first.

### The goal is two profiles per game, not one

Stated by Gordon 2026-08-30. Every game should end up with **two** validated configurations:

| | Handheld | Docked |
|---|---|---|
| Power | On battery, SPL ceiling 25 W | Plugged in, SPL ceiling 30 W |
| Display | Internal 7" panel, 1920×1080 @ 120 Hz | Alienware 32", currently 3840×2160 @ 60 Hz |

These are **different measurement regimes**, not one setup with a knob moved. The power ceilings
differ, the thermals differ, the pixel counts differ. So:

- Every capture records which configuration it ran in.
- A noise floor established in one says nothing about the other. Each needs its own.
- Results are never pooled across the two, and the mixed states (`handheld-charging`,
  `undocked-external`) get their own labels rather than being filed under the nearest target.

A practical consequence: docked runs are plugged in, so the battery's discharge-rate sensor reads
zero and power telemetry there depends entirely on LibreHardwareMonitor, and therefore on
Administrator.

### Reading results away from the terminal

`allytune dashboard` serves a phone-readable page over WiFi (`http://<ally-ip>:8777`). A terminal
is not usable mid-game on a 7" handheld, and Gordon asked for a phone view. It is a web page
rather than a native app on purpose — nothing to install, works on the phone, the touchscreen and
the docked monitor alike.

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
| `docs/allytune/04-phase1-results.md` | **What the device actually said.** Verified inventory, the three PresentMon schemas, and what the other docs got wrong |
| `docs/allytune/01-claude-code-on-the-ally.md` | Device setup |
| `docs/allytune/02-using-claude-code.md` | Beginner command reference |
| `docs/ally-x/` | The original 11-phase manual runbook |
| `.claude/settings.json` | Permission allowlist, so sessions run without prompts |

## Conventions

- Commit to the feature branch. Do not open a PR unless asked.
- Prose in docs: explain *why*, not just what. The existing docs set that standard — match it.
- When a measurement is uncertain or unreplicated, say so in the document rather than rounding it
  into a confident claim.
