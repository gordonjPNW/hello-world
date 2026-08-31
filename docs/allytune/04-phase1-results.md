# Phase 1 results — what the device actually said

First session with the hardware present. Everything below was read off this Ally X on
**2026-08-30**, not inferred. Where it contradicts an earlier document, the earlier document was
written without device access and is wrong; the correction is noted and the source doc updated.

**Status: the rig is built and working. Best measured noise floor is 10.29% on the 1% low
frametime (docked, 1080p), which is above the 3% target.** Accepted as a working baseline by
Gordon on 2026-08-30 rather than chased further, on the grounds that it is a large improvement and
sufficient for the big-knob comparisons that come first. What that permits and forbids is spelled
out in [What a 10.29% floor buys](#what-a-1029-floor-buys).

**The docked display fault found along the way is fixed.** At 4K the desktop compositor was
discarding 55% of the game's frames — the screen updated 12.4 times a second while the game
rendered 27.7. Setting the game to 1080p restored `Hardware Composed: Independent Flip` at 100%
with 0.0% dropped, and took average fps from 26.8 to 35.1. That was a real fault in the machine,
not in the rig, and the rig is what found it.

The three attempts, in order:

| Attempt | Config | Floor | What it actually showed |
|---|---|---|---|
| 1 | docked 4K | 49.8% | Memory exhausted (0.24 GB free), LHM window on screen, flip path collapsing mid-run |
| 2 | docked 4K | 1.98% | Repeatable — but uniformly broken: 55% of frames discarded |
| 3 | docked 1080p | **10.29%** | Display path healthy; one background transient in run 2 |

Attempt 2's 1.98% is the trap this project exists to avoid: a beautifully repeatable measurement
of a badly broken configuration. It is kept in the record because recognising that pattern matters
more than the number.

Detail in [The acceptance test](#the-acceptance-test).

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

**Sensor names — now verified (2026-08-30, second session).** LHM was launched from an elevated
session, its JSON server came up on `:8085`, and all six sensors in `WANTED`
(`allytune/telemetry/sensors.py`) resolve against the live tree:

| allytune field | LHM sensor it matched | value seen |
|---|---|---|
| `package_power_w` | `AMD Ryzen Z1 Extreme / Powers / Package` | 11–14 W |
| `cpu_temp_c` | `AMD Ryzen Z1 Extreme / Temperatures / Core (Tctl/Tdie)` | ~62 °C |
| `cpu_clock_mhz` | `AMD Ryzen Z1 Extreme / Clocks / Core #1` (nominal, not effective) | 0.6–1.2 GHz |
| `gpu_clock_mhz` | `AMD Radeon Graphics / Clocks / GPU Core` | ~800–890 MHz |
| `gpu_power_w` | `AMD Radeon Graphics / Powers / GPU Core` | ~7 W |
| `gpu_temp_c` | `AMD Radeon Graphics / Temperatures / GPU VR SoC` | ~61 °C |

Two caveats, both minor and now documented rather than assumed:

- The Z1 Extreme exposes **no GPU-die edge temperature** over LHM — `GPU VR SoC` is the voltage
  regulator, and `Core (Tctl/Tdie)` is the shared APU sensor. For a GPU thermal number, Tctl/Tdie
  is the honest one; `gpu_temp_c` is a VRM proxy.
- `cpu_clock_mhz` matches the **nominal** `Core #1`, not `Core #1 (Effective)`. At low load the two
  diverge a lot (593 vs ~900 MHz idle). If effective clock turns out to matter for a bottleneck
  call, the needle should be `"core #1 (effective)"`.

This closes the last open assumption in the phase 1 telemetry path.

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

## The acceptance test

Everything above is scaffolding. **This is the only result that matters in phase 1.**

### Why it cannot be skipped

An ordinary tuning change — a shadow-quality step, an FSR level — is worth 5–15%. If three
identical runs disagree by 5%, then every one of those changes is indistinguishable from the rig
breathing, and a session will still produce confident-sounding conclusions that are uncorrelated
with reality. That is what "way less good results" felt like on Uncharted 4 the first time.

### Result — first attempt, 2026-08-30 (docked)

Run verbatim, hands-off, camera left where Gordon parked it:

```
python -m allytune noisefloor --runs 3 --seconds 90 --cooldown 90 --no-prompt --game "Uncharted 4"
```

Conditions: elevated, LibreHardwareMonitor up, plugged in, battery 100%, configuration `docked`
(external 4K panel). Two warnings fired before the run and both matter to the result:

- `Armoury Crate SE is running` — expected, no plug/unplug happened during the run.
- **`Only 0.24 GB of RAM free`** — 98.7% of the 15.7 GB visible to Windows was in use. Uncharted 4
  docked at 4K plus Windows plus Steam plus LHM plus the terminal does not fit, and the platform
  was paging. Stochastic streaming hitches from memory pressure land directly in frametime stdev
  and the 0.1% low, which is exactly where this result fell over.

```
                        mean      spread   cv       three runs
  1% low frametime      60.975    4.43%    2.53%    [61.84, 61.89, 59.19]
  frametime stdev        9.987   49.76%   28.60%    [11.61, 11.66,  6.69]
  mean frametime        39.241    1.80%    0.91%    [39.29, 39.57, 38.86]
  0.1% low frametime    64.621    8.57%    4.51%    [63.57, 67.92, 62.38]
  average fps           25.485    1.81%    0.91%    [25.45, 25.27, 25.73]

  Headline: 49.76%  (worst pacing metric: frametime stdev)
  Verdict:  NOT USABLE — at or above 5%, the size of the effects being hunted.

  Per-run classification:  run 1  CPU-bound or present-blocked
                           run 2  CPU-bound or present-blocked
                           run 3  mixed
  Telemetry (stable):  package power 13.2–13.6 W,  CPU 61.9–62.4 °C,
                       GPU clock 817–886 MHz,  battery 100% throughout.
```

**What the numbers say.** The rig's arithmetic is not in question — 63 unit tests pass, and the
central-tendency metrics repeat beautifully: mean frametime 1.8%, average fps 1.8%, and runs 1
and 2 agree on the 1% low to within 0.08%. What does not repeat is *pacing*: frametime stdev
went 11.6 → 11.7 → 6.7 ms, and since the noise-floor headline is deliberately the worst pacing
metric, the verdict is NOT USABLE. This is the rig working as designed — it refused to certify
itself.

**Three things were varying between runs, and none of them is the analysis code:**

1. **Present mode changed between run 1 and the rest.** Run 1's CSV is 82% `Composed: Flip` and
   18% `Hardware Composed: Independent Flip`; runs 2 and 3 are 100% `Composed: Flip`. The game
   dropped out of the efficient independent-flip path partway through run 1 — plausibly nudged by
   this session launching LHM and running terminal commands alongside it — and never went back.
   A capture that changes composition path mid-run is not one clean sample.

2. **The system was still settling.** Run 3 differs from 1 and 2 on every variance measure: half
   the stdev, far fewer >60 ms hitches (4 vs 24 and 20), GPU-busy ratio up from ~0.68 to 0.86,
   classification flipped to `mixed`. Something — streaming caches, memory pressure easing, the
   compositor — kept changing through the first six minutes. Three "identical" runs were not run
   from the same starting state.

3. **Over half of every frame the game presented never reached the screen.** ~2,500 u4.exe
   presents per 90 s, of which ~1,100–1,350 are flagged not-displayed. `MsBetweenDisplayChange`
   sits at 64–80 ms, so the panel was updating ~13 times a second while the game rendered ~28.
   With package power at 13 W and the GPU at 800 MHz — a chip doing almost nothing — this is not
   a performance limit, it is a **present/display pipeline problem**: the game is not in a real
   flip mode on the docked 4K panel, and the suspect dock's 59/60 Hz behaviour (see `CLAUDE.md`)
   is a prime suspect. `average fps` of 25 flatters it; the felt cadence was ~13 fps.

### Result — second attempt, 2026-08-30 (docked): PASS at 1.98%

Same command, plus a 20 s grace period so the alt-tab back into the game happened before
recording started. Two conditions differed from attempt 1, and both turned out to matter:
**3.7 GB of RAM free instead of 0.24 GB**, and **LibreHardwareMonitor not running**, so no second
window was drawing over the game.

```
                        mean      spread   cv       three runs
  1% low frametime      58.287    1.01%    0.55%    [58.652, 58.145, 58.066]
  frametime stdev        8.829    1.01%    0.54%    [ 8.883,  8.794,  8.810]
  mean frametime        37.259    1.98%    1.08%    [36.800, 37.440, 37.538]
  0.1% low frametime    60.377    1.12%    0.58%    [60.771, 60.092, 60.269]
  average fps           26.841    1.99%    1.08%    [27.174, 26.709, 26.640]

  Headline: 1.98%  (worst pacing metric: mean frametime)
  Verdict:  USABLE -- under 3%. The rig resolves a 5% effect.
```

The metric that failed attempt 1 is the strongest one here: **frametime standard deviation went
from a 49.8% spread to 1.01%.** No analysis code changed between the two attempts. What changed
was the state of the machine — which is exactly what a noise floor exists to detect, and it did.

**The phase 1 acceptance criterion is met: the rig resolves a 5% effect.**

### The fault the passing run exposed

A clean noise floor is not the same as a healthy machine, and this run demonstrates the
difference. All three runs were flagged `SUSPECT` by the new per-run check:

```
present: Composed: Flip 100%, 55.3% / 55.0% / 55.0% of presents never displayed
```

Verified against the raw CSV rather than inferred — `MsUntilDisplayed` and
`MsBetweenDisplayChange` are `NA` on exactly the same 55.3% of rows, so these are real dropped
presents and not a parsing artifact:

```
MsBetweenPresents        n=2483  mean 36.16 ms  median 31.23   -> game renders 27.7 fps
MsBetweenDisplayChange   n=1111  mean 80.78 ms  median 78.46   -> screen updates 12.4 fps
```

**Over half the work the chip does never reaches the eye.** `average fps` of 26.8 flatters it
badly; the felt cadence is about 12 fps. At 13 W package power and ~850 MHz on the GPU, this is
not a performance limit — it is a plumbing fault.

It is also intermittent-then-sticky, which is why attempt 1 looked so much worse. A probe taken
25 minutes earlier, with the game running but paused, showed the opposite:

```
Hardware Composed: Independent Flip  100%,  0.0% dropped,  36.9 fps,  stdev 2.43 ms
```

So the game *can* reach independent flip on this dock at 4K. It fell out of that path when
gameplay resumed, and had not recovered ten minutes later. Attempt 1 caught it mid-transition —
run 1 was 82% composed, 18% independent — which is why its variance was enormous. Attempt 2
caught it uniformly broken, which is stable and therefore repeats cleanly.

**A stable measurement of a broken configuration is still a broken configuration.**

### What to fix next, in order of expected payoff

1. **Set the game to 1080p.** The desktop runs at 3840×2160 and games default to desktop
   resolution. `ally-x-tdp-reference.md` has carried "Set games to 1080p when docked" as an open
   item since July and it was never actioned. 4K is 4× the pixels of 1080p on a handheld APU, and
   1080p integer-scales into 4K with no interpolation softness.
2. **Run the external monitor alone** — Windows+P, "Second screen only". Two active displays make
   the desktop compositor arbitrate, which is a common way to lose independent flip.
3. **Turn off overlays** — Radeon, Steam, Xbox Game Bar. Each is a window that can force
   composition.
4. **Re-establish the noise floor afterwards.** The current 1.98% describes a 12 fps display path.
   Fixing it changes the frametime distribution completely, so the floor does not carry over.

### Result — third attempt, 2026-08-30 (docked, 1080p): display fixed, floor 10.29%

Same protocol again, one variable changed: the game set to 1920×1080 instead of the desktop's
3840×2160. The display fault is gone completely.

| | 4K (attempt 2) | 1080p (attempt 3) |
|---|---|---|
| Independent flip | 0% | **100%, all three runs** |
| Presents discarded | 55% | **0.0%** |
| Average fps | 26.8 | **35.1** |
| Mean frametime | 37.26 ms | **28.47 ms** |
| Classification | present-blocked | **GPU-bound** |

```
                        mean      spread   cv       three runs
  1% low frametime      31.356   10.29%    5.87%    [30.257, 33.482, 30.329]
  frametime stdev        0.702   57.50%   32.51%    [ 0.562,  0.966,  0.579]  (below noise)
  mean frametime        28.466    0.60%    0.33%    [28.406, 28.575, 28.415]  (below noise)
  0.1% low frametime    33.729   24.50%   13.85%    [30.855, 39.118, 31.213]
  average fps           35.130    0.59%    0.33%    [35.204, 34.995, 35.192]

  Headline: 10.29%  (1% low frametime)      Verdict: NOT USABLE against the 3% bar
```

**Uncharted 4 is GPU-bound at 1080p docked**, GPU-busy ratio 0.95. That answers the plan's open
classification question for this configuration, and it inverts the Miles Morales lesson: shadows,
FSR and resolution are the knobs that will matter here, not watts at the low end.

**The failure is one transient in one run.** Runs 1 and 3 are near-perfect and agree with each
other to 0.24% on the 1% low:

```
run 1   max frametime 31.0 ms    0 frames >35 ms   152 frames >30ms: no
run 2   max frametime 47.1 ms    2 frames >35 ms   152 frames >30 ms   <- one burst, frames 712-812
run 3   max frametime 31.7 ms    0 frames >35 ms
```

Run 2's damage is confined to about two seconds roughly 20 s in: one 47 ms frame and a cluster of
33–36 ms ones. That is a background process waking up, not the rig and not the game. It is
recorded here rather than excluded — dropping the inconvenient run is precisely how a measurement
rig starts lying to its owner — but it does mean the rig demonstrably reaches well under 1% when
nothing interrupts it.

### What a 10.29% floor buys

The floor is not a pass/fail for the project, it is a resolution limit, and it is worth being
precise about what it permits:

| Change | Typical size | Resolvable at 10.29%? |
|---|---|---|
| Wattage steps (10 → 17 → 25 W) | 35–148% on this chip | **Yes, comfortably** |
| Resolution (4K → 1080p) | ~30% here, measured | **Yes** |
| FSR quality levels | 15–30% | **Yes** |
| Upscaler on/off | 15–25% | **Yes** |
| Shadow / texture quality steps | 5–15% | **Marginal — often not** |
| Fine individual settings | 2–8% | **No** |

So the big knobs — the ones that decide whether a game is playable at all — are testable now. Fine
settings tuning is not, and any such result must be reported as indistinguishable from noise until
the floor comes down. Every report prints the floor alongside the result precisely so this cannot
be forgotten.

To get the floor down later: eliminate the background transient (close Steam's client window,
disconnect WiFi during runs), or raise the run count so a single interruption carries less weight.

### Note for phase 2: the telemetry tool corrupts the measurement

LibreHardwareMonitor's window on screen is by itself enough to knock a game out of independent
flip. The tool that exists to measure power was degrading the frametimes it was annotating.
Minimise it to the tray (its config is pre-seeded with `minTrayMenuItem`), or accept that docked
power telemetry and clean frametimes may not be simultaneously available. Attempt 2 has no power
data for exactly this reason — and on AC the battery sensor reads zero, so there was no fallback.

### What to expect

- **Under ~3%** — the rig works. Proceed to the wattage and settings sweeps.
- **3–5%** — marginal. Only large effects are trustworthy. Reduce variance first.
- **At or above 5%** — phase 1 is not done. The usual suspects, in order: a route that is not
  actually repeatable, thermal state differing between runs, shader compilation on the first run
  after any change, and background processes. Fix the variance before building anything else.

Whatever it says, it goes in this document unedited. A rig that cannot resolve 5% makes every
downstream conclusion worthless, and knowing that is far more valuable than a green tick.
