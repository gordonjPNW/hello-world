# Handoff prompt — continue allytune locally

This is the brief for a Claude Code session running **on the Ally X itself**, where the hardware is
available. The planning and setup were done in a remote session with no device access; everything
below needs the real machine.

To use it, from the project folder on the Ally, type:

```
tune
```

That is the whole command. `tune.cmd` starts Claude Code and hands it this brief, so there is
nothing to paste or type out — which matters on a handheld with an on-screen keyboard and no shared
clipboard.

Also available:

```
tune resume     reopen the most recent conversation
tune doctor     installation health check, no session
```

The long way, if you prefer it, is `claude` followed by
`Read docs/allytune/03-handoff-prompt.md and carry it out.`

---

## Context

You are running on an **ASUS ROG Ally X** (Windows 11, Ryzen Z1 Extreme, 24 GB). Read `CLAUDE.md`
first — it holds the device facts, the paths, and how to pitch instructions to Gordon, who is new
to the command line.

Then read, in order:

1. `docs/allytune/00-plan.md` — what allytune is and why. **The rationale in the opening section is
   the whole point of the project**; do not optimise it away.
2. `ally-x-tdp-reference.md` — measured TDP profiles, fan curve, display config, and the Miles
   Morales results.

Work on branch `claude/rog-ally-game-optimizer-5ljjo5`. Commit as you go. Do not open a pull
request.

## Your task: build and validate phase 1

Phase 1 is **capture, telemetry and analysis — read-only**. Nothing writes to the machine's
settings, power limits or game configs. That comes in phase 2, after the measurement rig is trusted.

### 1. Inventory the device

Build `allytune inventory`: system, BIOS, CPU, RAM, GPU driver version, battery design vs
full-charge capacity, every display with its supported modes, and which relevant processes are
running (Armoury Crate, RTSS, Adrenalin).

Cross-check the output against `ally-x-tdp-reference.md`. Where reality disagrees with the
document, **the document is wrong** — it was written partly from assumption. Correct it and say
what changed.

### 2. Install the capture tools

- **Intel PresentMon** — frametime and GPU-busy capture. Pin a specific version; record which.
- **LibreHardwareMonitor** — power, temperature and clock telemetry. It can serve sensor data as
  JSON over a local HTTP port, which is the easiest thing to poll.

Add these to `scripts/bootstrap-ally.ps1` once you know the working download URLs and paths. Do not
guess them — verify each one actually downloads and runs on this machine.

### 3. Build the package

Layout is sketched in the plan. Structure it so the analysis core has **no Windows dependency** and
is unit-testable, with the platform-specific parts as thin adapters. Prefer the standard library;
every dependency is something to install on a handheld.

Two things need real care:

**PresentMon CSV schema.** Version 1.x and 2.x use different column names for the same quantities
(`msBetweenPresents` vs `FrameTime`, `msGPUActive` vs `GPUBusy`). Detect which you have and map to
one canonical set. Write tests against captured sample rows.

**Metrics.** Primary is 1% low frametime and frametime standard deviation, **not** average fps —
the target is a 40 fps cap, where what is felt is pacing. Also compute the **GPU-busy ratio**
(GPU busy ÷ frame time), which classifies CPU-bound versus GPU-bound and is the single most useful
number in the project. Discard the warm-up window. Exclude dropped frames and count them separately.

### 4. Prove it can resolve 5%

This is the acceptance test, and it is the only thing that matters in phase 1.

Run three **identical** captures on Uncharted 4 — same route, same settings, same power profile —
and report the spread. That spread is the noise floor.

- **Noise floor under ~3%** → the rig works. Proceed.
- **Noise floor near or above 5%** → phase 1 is not done. Find the variance and kill it before
  building anything else. Usual suspects: thermal state differing between runs, shader compilation
  on the first run, background processes, and a route that is not actually repeatable.

Report the number honestly. A rig that cannot resolve 5% makes every downstream conclusion
worthless, and saying so is far more valuable than a green tick.

## Ground rules

- **Read-only.** No writes to power limits, display settings, or game configuration files.
- **Verify, do not assume.** Every path, download URL, CSV column and sensor name gets confirmed
  against the actual machine. Guessing is what the remote session could not avoid; you can.
- **Instructions for Gordon assume no terminal experience.** Exact commands, expected output, and
  what to do when it differs. See `docs/allytune/02-using-claude-code.md` for the register.
- **Elevated terminal required.** PresentMon needs Administrator for ETW tracing. If the session is
  not elevated, say so immediately rather than debugging a confusing failure later.
- **Uncertainty gets written down**, in the docs and in commit messages. An unreplicated number is
  labelled as one.

## Known gotchas

- The Claude Code native installer does not reliably add `~\.local\bin` to PATH.
  `scripts/bootstrap-ally.ps1` repairs this.
- `set-refresh-rate.ps1` targets whichever display is primary, so while docked it silently
  addresses the TV. Folding it in with `-List` and `-Display N` is a phase 1 job.
- PowerShell blocks unsigned local scripts; `-ExecutionPolicy Bypass` is required and the call
  operator with a quoted path does not get past it.
- Armoury Crate re-asserts power limits on mode change, plug/unplug and resume. It cannot corrupt a
  read-only phase 1, but note anything you observe — phase 2 depends on knowing its behaviour.

## Definition of done

- `allytune inventory` runs and its output is reconciled against the reference doc.
- `allytune measure --seconds 90` produces frametime statistics, a GPU-busy ratio, and a bottleneck
  classification from a live game.
- Three identical Uncharted 4 runs produce a stated noise floor.
- Unit tests cover the CSV parsing and the metrics.
- A short results document in `docs/allytune/` records the noise floor, the classification, and
  anything the reference doc got wrong.
- Everything committed to `claude/rog-ally-game-optimizer-5ljjo5`.
