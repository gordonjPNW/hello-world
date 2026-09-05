# allytune — a per-game optimizer for the ROG Ally X

A Python tool that runs on the Ally X, measures a game properly, and tunes it one variable at a
time. Built so an agent can drive the whole loop unattended between benchmark runs.

Status: **plan**. Nothing is built yet.

## Why this exists

The Miles Morales session went well and the Uncharted 4 session did not, and the difference is
not the games — it is the size of the effect being measured.

Miles Morales handed back a **148%** difference between 10 W and 17 W (~25 fps vs ~62 fps). An
effect that large is visible by eye. No instrumentation, no fixed route and no repeat runs were
needed, because nothing about the method could plausibly have manufactured a 2.5× gap.

Most tuning is not like that. A shadow-quality step or an FSR level is worth 5–15%, and 5–15% is
**below the noise floor of playing for a bit and seeing how it feels**. Walking a slightly
different path, a warmer chip on the second run, or shaders still compiling all move the number by
more than the change being tested. Under those conditions a session produces confident-sounding
conclusions that are uncorrelated with reality — which is what "way less good results" feels like
from the inside.

There is a second, sharper lesson already in [the TDP reference](../../ally-x-tdp-reference.md):
the documented perf-per-watt curve predicted +35% from 10 W → 17 W and the actual measurement was
+148%, because the curve was derived from GPU-bound work and Miles Morales is CPU-bound. **Priors
about this chip do not transfer between games.** Every game has to be measured on its own terms.

So the product here is not a settings database. It is a measurement rig with a strict enough
protocol that a 5% change is resolvable, plus enough control over the machine that an agent can
run the protocol twenty times without a human touching anything but the controller.

## What it does, end to end

You pick a game. You walk one fixed 90-second route each time you're prompted. Everything else —
power limits, display mode, frame cap, in-game settings, game relaunches, capture, statistics,
deciding what to try next, writing up the result — is the tool's job.

Output per game: a validated settings file patch, a TDP profile, a frame cap, a display
configuration, the game's own measured perf-per-watt curve, and a markdown report stating what was
tested, what won, and **what was indistinguishable from noise**.

## Decisions taken

| Decision | Choice |
|---|---|
| TDP control | Direct programmatic. The tool owns the power limits. |
| Stack | Python. |
| Autonomy | Full auto within a session; interrupts only for the route. |
| First game | Uncharted 4: Legacy of Thieves. |

---

## Architecture

A Python package `allytune`, installed on the Ally X, driven by a CLI with machine-readable
output. A small local web UI exists so the device's own touchscreen (or a phone) can start and
stop runs — a terminal is not usable mid-game on a 7" handheld.

```
allytune/
  capture/     PresentMon wrapper — frametimes, GPU busy, bottleneck classification
  telemetry/   LibreHardwareMonitor + WMI battery — power, temps, clocks, real draw
  power/       TDP control (SPL/sPPT/fPPT) + a watchdog for Armoury Crate contention
  display/     refresh rate, resolution, per-display targeting
  framecap/    RTSS profile control
  games/       per-game adapters: settings file, knob map, launch, route definition
  experiment/  the tuning loop: plan, execute, analyse, decide
  store/       SQLite — every run, every setting, every metric, forever
  report/      markdown generation into docs/
  web/         FastAPI + one touch-friendly page on localhost
```

### capture — the part that makes small effects visible

Intel **PresentMon** (open source, CLI, CSV out) is the foundation. Per frame it gives time
between presents and **GPU busy time**, and the ratio of those two is the bottleneck classifier:

| GPU busy ÷ frame time | Meaning | What actually helps |
|---|---|---|
| > 0.95 | GPU-bound | Resolution, FSR, GPU settings, watts |
| < 0.85 | CPU-bound or present-blocked | Crowd/physics/draw distance, watts at the low end. **Upscaling does nothing.** |
| ~1.0 but pinned at cap | Cap-bound | Nothing. Lower the wattage instead. |

This single number would have short-circuited the Miles Morales confusion on run one, and it is
the first thing we will learn about Uncharted 4.

**The primary metric is not average fps.** At a 40 fps cap what you feel is pacing, so the ranked
metrics are:

1. 1% low frametime (ms)
2. Frametime standard deviation
3. 0.1% low frametime — catches streaming and VRAM hitches
4. Average fps — only meaningful uncapped, or when below the cap

### power — direct TDP control

Two backends, tried in order: the **ASUS ACPI-WMI** interface (vendor path, same one Armoury Crate
itself uses) and **ryzenadj** (SMU access via a WinRing0-class driver) as fallback. Every write is
verified by read-back, and every set is confirmed under load — a limit that is accepted but not
honoured is a silent data-corrupter.

**Armoury Crate contention is the top technical risk.** It re-asserts power limits on operating
mode changes, on AC plug/unplug and on resume from sleep. Mitigation: a watchdog polls the live
limits at 1 Hz throughout every capture, and **a run whose limits moved mid-capture is discarded,
not averaged in.** Silently averaging a drifted run is exactly the failure mode that produces
confident wrong answers.

### games — per-game adapters

Each game is a small descriptor: executable name, Steam app id, settings file path and format, a
map from canonical knob names (`shadow_quality`, `upscaler`, `render_scale`) to that game's actual
keys and legal values, whether a setting needs a relaunch, and the route definition.

Patching the settings file rather than driving the in-game menu is what makes unattended sweeps
possible. Two rules, both learned the hard way by everyone who has tried this:

- **Back up the original before the first write**, and ship `allytune restore`.
- **Never patch while the game is running.** Most games write their settings file on exit and will
  cheerfully clobber the patch with stale values.

---

## The protocol

This is the actual product. The code exists to enforce it.

**1. A fixed route.** 90 seconds, identical every run. Prefer a *stationary* camera in the heaviest
area over a walked path — a fixed vista removes human variance almost entirely, which matters more
than testing the "typical" case. An in-game benchmark, where one exists, beats both.

**2. Discard the warm-up.** The first 15 seconds are shader compilation, asset streaming and clock
ramp. Captured, then trimmed in analysis.

**3. Establish the noise floor before testing anything.** Three runs of the *identical*
configuration. The spread across those three is the resolution limit of the whole session, and it
gets printed at the top of every report:

> noise floor ±2.1 fps · shadows High→Medium bought +1.4 fps · **indistinguishable from noise**

**This is the step that was missing on Uncharted 4**, and it is the one that turns "way less good
results" into a number you can trust.

**4. Control for thermal and shader history.** Back-to-back runs start hotter, and the first run
after any settings change recompiles shaders and is always slower. So: wait for the APU to drop
below a threshold between runs, discard the first run after a settings change, and randomise run
order within a sweep so thermal drift cannot correlate with the variable under test.

**5. One factor at a time**, from a fixed baseline — then compose the winners and **re-verify the
composed stack**, because interactions are real and a stack of individually-good settings is not
automatically good.

### The per-game sequence

| Phase | Runs | What it establishes |
|---|---|---|
| **A · Ceiling probe** | 3–4 | Uncapped at 30 W, min settings vs max. Is the target even reachable on this chip? |
| **B · Classification** | 0 (reuses A) | CPU-bound, GPU-bound, VRAM-limited, or cap-bound. Determines which knobs are worth sweeping at all. |
| **C · Wattage sweep** | 4 | 10 / 13 / 17 / 22 W at fixed settings. Produces *this game's* perf-per-watt curve rather than assuming the reference one. Finds the knee. |
| **D · Settings sweep** | 6–10 | One factor at a time on the knobs phase B says matter. |
| **E · Compose & soak** | 2–3 | Verify the stack, then 20 minutes for clock hold and real battery drain. |
| **F · Emit** | — | Profile, Armoury Crate binding, markdown report. |

Roughly 20 runs, about 45 minutes of route-walking per game, unattended in between.

Phase E's soak is the existing validation rule from the TDP reference: clocks hold means the
profile is sound, clocks sag means fix the fan curve rather than adding watts.

---

## Build phases

| Phase | Deliverable | Done when |
|---|---|---|
| **0 · Scaffold** | Package, installer, `allytune inventory` — dumps device, firmware, display, battery health, current limits | Inventory runs on the Ally and matches what the docs already record |
| **1 · Measure** | capture + telemetry + analysis. Read-only, nothing is written to the machine | `allytune measure --seconds 90` produces a noise floor on Uncharted 4 |
| **2 · Control** | power, display, frame cap, game config, with verification and restore | Each control verifiably round-trips, and the Armoury Crate watchdog fires when it should |
| **3 · Experiment** | The loop, the SQLite store, report generation | A full A–F sequence runs unattended between routes |
| **4 · Ergonomics** | Web UI, `--json` on everything, a skill encoding the protocol | Startable from the Ally's touchscreen; agent-drivable without prompts |
| **5 · Uncharted 4** | The actual answer | Report committed with numbers and a stated noise floor |

Phase 1 is the one that matters. If it cannot resolve a 5% difference, nothing downstream is worth
building.

## Giving the agent control on the device

"Full control without interruptions" is concretely four things:

1. Claude Code installed on the Ally X, running in a clone of this repo.
2. A `.claude/settings.json` allowlist covering `allytune *` so routine commands don't prompt.
3. A skill (`.claude/skills/tune/`) encoding the protocol above, so the method is loaded rather
   than remembered.
4. The SQLite store as shared memory — every past run queryable, so a later session can pick up
   where an earlier one stopped.

The honest limit: I cannot walk the benchmark route. Everything between routes is automatable;
the route itself is you. Synthetic input replay was considered and rejected for now — it drifts,
needs per-game calibration, and a drifting route silently corrupts exactly the small-effect
measurements this whole design exists to protect.

## Uncharted 4 — open questions to answer in phase 1

- Locate the settings file, confirm its format, and confirm the game **reads** it at launch rather
  than only writing it at exit.
- Confirm the upscaler situation — FSR2 is expected; check whether render scale is a separate
  slider, since that changes how phase D is structured.
- Find the route. A fixed heavy vista is preferred over a walked path.
- Classify it. The working hypothesis is that it is *more* GPU-bound than Miles Morales, which
  would invert which knobs matter — but the whole point of this document is that hypotheses about
  this chip have already been wrong once by a factor of four. Measure it.

## Risks

| Risk | Mitigation |
|---|---|
| Armoury Crate re-asserts power limits mid-run | 1 Hz watchdog; discard affected runs rather than averaging them |
| WinRing0-class driver flagged by AV or the Windows vulnerable-driver blocklist | Single-player titles only; never alongside kernel anti-cheat. Memory Integrity is already off on this device. Prefer the ASUS WMI backend where it works |
| Settings file corrupted or clobbered | Back up before first write; patch only while the game is closed; `allytune restore` |
| Game silently ignores an out-of-range value | Read back after launch; verify the menu once by hand per new knob |
| Thermal and shader-compilation drift | Cooldown gate, discard-first-run-after-change, randomised run order |
| Effects genuinely smaller than the noise floor | Report them as such. "No measurable difference" is a valid and useful result |
