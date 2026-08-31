# Phase 1 results — what the device actually said

First session with the hardware present. Everything below was read off this Ally X on
**2026-08-30**, not inferred. Where it contradicts an earlier document, the earlier document was
written without device access and is wrong; the correction is noted and the source doc updated.

**Status: the rig is built and tested. The acceptance test has not been run.** It requires
someone to play a fixed route in Uncharted 4 three times, which is the one part of this project
that cannot be automated. See [The acceptance test](#the-acceptance-test-not-yet-run) for exactly
what to do and what number to look for. Nothing downstream should be treated as trustworthy until
that number exists.

---

## What the reference doc got wrong

| Claim | Reality | Where it came from |
|---|---|---|
| "PresentMon needs Administrator for ETW tracing. A non-elevated session looks fine until it fails at the measurement." | **False.** PresentMon 2.5.1 captures perfectly unelevated — 357 frames in a 3 s test from a normal user shell. Elevation is still wanted, but for a *different* reason: without it PresentMon cannot resolve process names for short-lived or other-account processes, so `--process_name` targeting is unreliable. | `CLAUDE.md` |
| PresentMon 2.x columns are `FrameTime` / `GPUBusy` | Half right, and misleading. Those are the `--v2_metrics` names. The **default** output (no metrics flag) uses `MsBetweenPresents` / `MsGPUBusy`. There are three schemas, not two. | `03-handoff-prompt.md` |
| "24 GB RAM" | 24 GB is installed, but **8 GB is carved out for the iGPU**, so Windows sees 15.7 GB. Both numbers are true and the difference matters — a game plus Windows is working against 15.7 GB, not 24. | `CLAUDE.md` |
| Uncharted 4's settings live in a patchable file | **No plaintext graphics config exists.** See [Uncharted 4](#uncharted-4) below. This is the most consequential correction here, because the plan's unattended settings sweep depends on it. | `00-plan.md` |
| Battery health ~83% (66.5 Wh) | **Confirmed.** 66 288 mWh full-charge against 80 000 nominal = 82.9%. | `ally-x-tdp-reference.md` |
| Internal panel at 120 Hz | **Confirmed**, still holding at 1920×1080 @ 120 Hz. | `ally-x-tdp-reference.md` |

## Device inventory

```
Model            ROG Ally X RC72LA_RC72LA (ASUSTeK)
BIOS             RC72LA.312
OS               Windows 11 Home 10.0.26200
CPU              AMD Ryzen Z1 Extreme, 8 cores
GPU              AMD Radeon Graphics, driver 32.0.31007.6002 (2026-05-17)
RAM              24.0 GB installed (4 × 6 GB Micron LPDDR5X-7500)
                 15.7 GB visible to Windows
                 8.0 GB carved out as dedicated VRAM
Battery          66 288 of 80 000 mWh = 82.9% health
Display          TMX TL070FVXS01-0, internal, 1920×1080 @ 120 Hz
```

The panel model string `TL070FVXS01-0` is worth recording: it is how allytune tells the internal
panel apart from an external monitor, which is what stops the display code repeating
`set-refresh-rate.ps1`'s trick of silently addressing the TV while docked.

### Processes running during inventory

`ArmouryCrateSE`, `AMDRSServ`, `RadeonSoftware`, `cncmd`, `GameBar`.

Armoury Crate SE being resident is expected and harmless to a read-only phase, but it is the
component that re-asserts power limits on mode change, plug/unplug and resume — so phase 2's
watchdog is not optional.

### ASUS services

Eleven ASUS services are installed; seven are running. `ArmouryCrateControlInterface`, `asus` and
`asusm` are stopped. This is consistent with the earlier service-trim work and is noted only so a
later session does not mistake it for a broken install.

---

## The capture stack

### PresentMon 2.5.1 — pinned

```
tools/PresentMon-2.5.1-x64.exe
SHA-256  9BEC3083069F58F911E6A512F4806DB51A27BD096103087BC1D05EF54C80A191
URL      https://github.com/GameTechDev/PresentMon/releases/download/v2.5.1/PresentMon-2.5.1-x64.exe
```

The 0.9 MB console build, not the 150 MB MSI — allytune only drives the CLI.

**Three CSV schemas, not two.** This is the single most important technical finding of the
session, because a parser built on the brief's assumption would have failed on the default case:

| Invocation | Time column | Units | Frame time | GPU busy | Dropped |
|---|---|---|---|---|---|
| *(no flag)* | `TimeInMs` | ms | `MsBetweenPresents` | `MsGPUBusy` | inferred from `MsUntilDisplayed` |
| `--v2_metrics` | `CPUStartTime` | ms | `FrameTime` | `GPUBusy` | inferred from `DisplayedTime` |
| `--v1_metrics` | `TimeInSeconds` | **s** | `msBetweenPresents` | `msGPUActive` | explicit `Dropped` column |

allytune defaults to the no-flag schema, which is the richest of the three — it carries
`MsBetweenDisplayChange` and `MsUntilDisplayed` alongside both busy times. All three are parsed
and unit-tested.

Three traps, each found by testing rather than reading:

1. **Every CSV carries a UTF-8 BOM.** Read as plain `utf-8`, the first column name becomes
   `\ufeffApplication`. The numeric columns keep working, so the failure is silent: process
   filtering matches nothing and the capture looks empty for no visible reason. Files are opened
   as `utf-8-sig` and the parser strips a BOM defensively as well.
2. **Time units differ between schemas.** `TimeInSeconds` is seconds; `TimeInMs` and
   `CPUStartTime` are milliseconds. Verified by checking that a capture's timestamp span matched
   its summed frame times, rather than assuming. Getting this wrong scales every duration by 1000
   and would quietly destroy the warm-up trim.
3. **PresentMon writes no CSV at all when it captures zero presents** — while still exiting 0 and
   printing `Started recording. / Stopped recording.` The absence of the file *is* the signal.
   allytune raises a dedicated `NoFramesCaptured` explaining that the game probably was not
   drawing, because reporting it as a crash sends you debugging the wrong component.

### LibreHardwareMonitor 0.9.6 — pinned

```
tools/LibreHardwareMonitor/
SHA-256  086D9F1B5A99E643EDC2CFAAAC16051685B551E4C5AC0B32A57C58C0E529C001
URL      https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases/download/v0.9.6/LibreHardwareMonitor.zip
```

**It requires Administrator to launch at all.** Its manifest demands elevation, so from a normal
user session it does not start — it raises a UAC prompt and nothing else. Verified: the launch
attempt from this session was refused. Its config has been pre-seeded to enable the JSON web
server on port 8085, so it needs no GUI fiddling on a 7" touchscreen once launched.

Sensor names have **not** been verified against this device yet, because LHM could not be started
from an unelevated session. The mapping in `allytune/telemetry/sensors.py` is a best guess by
substring match and is explicitly marked as unverified. **This is the one place in phase 1 where
a documented value is still an assumption.**

### The battery as a power sensor

`BatteryStatus.DischargeRate` reports whole-device draw in milliwatts through WMI, with no driver
and no elevation. Measured 7.2–9.2 W at idle. This is genuinely better than APU package power for
battery-life questions, because it includes the display, fans and SSD.

The catch, and it matters given the two-configuration goal: **it only works while discharging.**
Plugged in — which is every docked run — it reads zero. So handheld telemetry works today with no
elevation at all, and docked power telemetry depends on LibreHardwareMonitor and therefore on
Administrator.

---

## Uncharted 4

Installed: `Uncharted Legacy of Thieves Collection`, Steam app id **1659420**, 124.1 GB.

```
Executable   C:\Program Files (x86)\Steam\steamapps\common\
             Uncharted Legacy of Thieves Collection\u4.exe
Saves        C:\Users\gordo\Saved Games\Uncharted Legacy of Thieves Collection\
```

`u4.exe` is A Thief's End; `tll.exe` is The Lost Legacy. The `-l` variants beside them are
launcher shims.

### There is no patchable settings file

This is the finding that changes the plan.

The save directory contains exactly one human-readable file, `sharedsettings.cfg`, and it holds
three keys, none of them graphics:

```
DataCollection=1
SplashVolume=1.000000
PSNAuthLink=1
```

Everything else is Naughty Dog's binary save format — `P.save` (53 KB), `*.USR-DATA`. A string
scan of `P.save` finds no `render`, `shadow`, `fsr`, `resolution`, `texture` or `quality` tokens.
The graphics settings are in there, but not as anything a text patch can reach.

**Consequence for phase 2.** `00-plan.md` says patching the settings file rather than driving the
in-game menu "is what makes unattended sweeps possible." For this title that route is closed. The
options are to reverse the binary format, or to drive the menu with synthetic input — which the
plan already considered and rejected for route-walking, on the grounds that it drifts. Driving a
*menu* is a much easier target than walking a route, so it may still be viable, but it is a real
cost that was not in the estimate and phase D's shape depends on it.

Also present: `u4.exe_dumps/`, a crash-dump directory last written 2026-08-26. Not investigated;
noted because a title that has crashed recently is worth watching during long soak runs.

### Still open

The plan's other Uncharted 4 questions — whether FSR2 is present, whether render scale is a
separate slider, and where the route should be — all require launching the game and are not
answerable from the filesystem. They are the natural companion to the acceptance test.

---

## The measurement rig

```
allytune/
  capture/schema.py     three PresentMon schemas -> one canonical Frame
  capture/runner.py     drives the binary, reads back the CSV
  analysis/metrics.py   frametime statistics, GPU-busy ratio, classification
  analysis/noise.py     the acceptance test
  telemetry/sensors.py  LibreHardwareMonitor + battery, sampled during capture
  inventory/device.py   device facts, and which configuration we are in
  web/server.py         phone-readable dashboard
  store.py              append-only JSONL of every run
```

`capture/schema.py` and `analysis/` have no Windows dependency and carry **50 unit tests**, so the
arithmetic every conclusion rests on can be checked without the hardware. Windows-specific code is
confined to `winbridge.py`, `inventory/` and `capture/runner.py`.

### Decisions worth knowing about

**Configuration is recorded on every capture.** Handheld (battery, internal panel) and docked
(AC, external monitor) are different measurement regimes — different power ceilings, different
thermals, different pixel counts — so results are never pooled across them and each needs its own
noise floor. The two mixed states, `handheld-charging` and `undocked-external`, get their own
labels rather than being forced into one of the targets, because quietly filing a charging run
under "handheld" is how a data set rots.

**The noise-floor headline is the worst pacing metric, not the average of them.** If the rig
cannot hold the 1% low steady, it cannot resolve a change in the 1% low, however steady mean
frametime looks. Average fps is excluded from the verdict entirely — it is the least sensitive of
the four and would flatter the result.

**Cap detection runs before bottleneck classification.** At a 40 fps cap the GPU can be nearly
100% busy inside each frame while the chip has headroom to spare; calling that "GPU-bound" would
send a session hunting for watts it does not need. A capture whose frame times cluster tightly is
labelled `cap-bound` and says so.

**1% low is the mean of the worst 1% of frames**, not a single 99th-percentile point. A single
point is jumpy across repeat runs, and this number's entire job is to be compared across repeat
runs.

**Warm-up is trimmed by duration, not frame count.** A slow warm-up produces fewer frames per
second, so trimming a fixed frame count would remove a different amount of *time* on every run —
variance injected by the analysis itself.

### Validated end to end

Analysing a real 258 KB capture from this machine:

```
frames             1197 analysed, 0 dropped
1% low frametime   597.89 ms
frametime stdev    76.91 ms
mean frametime     14.23 ms
average fps        70.3
GPU-busy ratio     0.027
classification     cap-bound
note: frame times cluster tightly at 8.34 ms (~120 fps): looks frame-limited
```

That capture was of a terminal window, not a game, and the result is exactly right: 8.34 ms is
120 fps, the panel runs at 120 Hz, and a vsynced desktop application is precisely cap-bound with
almost no GPU work. The classifier found the truth about a case whose answer was known in
advance, which is the only kind of validation available before the real run.

---

## The dashboard

`allytune dashboard` serves a phone-readable page over WiFi:

```
On this device : http://localhost:8777
On your phone  : http://10.0.0.121:8777
```

A web page rather than a native app, deliberately. A phone app would need a store listing or
sideloading, a signing identity, and a rebuild every time the metrics change — for something that
shows a table. This works on any phone, on the Ally's own touchscreen and on the docked monitor,
with nothing installed. Built on Python's `http.server` rather than FastAPI so it adds no
dependency to maintain on a handheld.

It shows the noise floor per configuration, the latest run's full metrics, a table of every run,
and any active warnings. Read-only by construction: there is no route that writes anything.

The IP will change if the network hands out a different lease; the command prints the current one
each time it starts.

---

## The acceptance test — not yet run

Everything above is scaffolding. **This is the only result that matters in phase 1**, and it needs
a person to play the game.

### Why it cannot be skipped

An ordinary tuning change — a shadow-quality step, an FSR level — is worth 5–15%. If three
identical runs disagree by 5%, then every one of those changes is indistinguishable from the rig
breathing, and a session will still produce confident-sounding conclusions that are uncorrelated
with reality. That is what "way less good results" felt like on Uncharted 4 the first time.

### Blockers as of this session

1. **Not running as Administrator.** Not fatal for PresentMon, but it blocks LibreHardwareMonitor
   entirely, so power, clocks and temperature would be missing from all three runs.
2. **Battery at 24–30% and falling.** As the pack drains the platform trims power limits. Three
   runs spanning a 30%→15% drop are not three identical runs, and the drift would land straight
   in the noise floor.

Both are Gordon's to clear; neither is a code problem.

### What to expect

- **Under ~3%** — the rig works. Proceed to the wattage and settings sweeps.
- **3–5%** — marginal. Only large effects are trustworthy. Reduce variance first.
- **At or above 5%** — phase 1 is not done. The usual suspects, in order: a route that is not
  actually repeatable, thermal state differing between runs, shader compilation on the first run
  after any change, and background processes. Fix the variance before building anything else.

Whatever it says, it goes in this document unedited. A rig that cannot resolve 5% makes every
downstream conclusion worthless, and knowing that is far more valuable than a green tick.
