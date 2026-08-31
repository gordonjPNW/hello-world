# The game library — what was applied, and what still needs measuring

Written 2026-08-31, unattended, while Gordon was at work.

**Read this first:** this document contains two very different kinds of claim, and they are kept
rigorously apart.

| | |
|---|---|
| **Applied** | Changes actually made to this machine today, and *why they transfer between games* |
| **Hypothesis** | Suggested starting points. **Not measured. Not findings.** Every one needs a capture before it means anything |

The reason for the split is the project's founding lesson, which this hardware has already taught
twice in opposite directions. The documented perf-per-watt curve predicted +35% for Miles Morales
and the measurement was +148%, because the curve came from GPU-bound work and that game is
CPU-bound. Uncharted 4 then measured *GPU*-bound, inverting it again. **Priors about this chip do
not transfer between games.** A table of confident settings I had not measured would be exactly
the artefact this whole rig exists to prevent.

What *does* transfer is the display path, because it is a property of Windows' compositor rather
than of any game engine. That distinction is what makes today's work possible at all.

---

## Applied today: the display recipe

On Uncharted 4 this took the framerate actually reaching the screen from **12.4 fps to a locked
30**, without touching a single graphics setting or a watt of TDP. None of it required
measurement, because none of it is game-specific.

### 1. `SwapEffectUpgradeEnable=1` — set for all ten executables

This is Windows 11's "Optimizations for windowed games". Without it, a borderless game is
composited by the desktop and Windows discards frames it does not have time for. With it, the game
gets **independent flip** — its frames go straight to the display.

On Uncharted 4 this single registry value took dropped presents from **42.7% to 0.0%**.

Written to `HKCU\Software\Microsoft\DirectX\UserGpuPreferences`, one value per executable path.
It is exactly what the Settings UI writes, and it is read **when the process starts**, so a game
must be restarted after the value is set.

```
RDR2.exe                          Palworld-Win64-Shipping.exe
GhostOfTsushima.exe               PlanetZoo.exe
HorizonZeroDawn.exe               ProjectCoral-Win64-Shipping.exe
GoWR.exe                          u4.exe
DaysGone.exe                      tll.exe
```

To reverse for one game:

```powershell
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences' -Name '<full exe path>'
```

### 2. Already in place from the Uncharted session

- **Desktop at 2560×1440**, the Alienware's native resolution. It was at 3840×2160, which the
  monitor was accepting and downscaling — costing GPU budget on a panel that cannot show it.
- **Overlays off** — Armoury Crate's in-game bar and Steam's overlay. Either one draws over the
  game and forces composition. On Uncharted this was the difference between 92% composited and
  100% independent flip, *after* everything else was already correct.

### 3. The per-game settings recipe — apply to every title

This part is mechanical and does not need measuring:

| Setting | Value | Why |
|---|---|---|
| Display Mode | **Borderless Windowed** | Gets independent flip, and no window borders |
| Resolution | **2560×1440** | Must match the desktop *exactly* or Windows composites |
| V-Sync | **Off** | Borderless cannot tear; the game's own V-Sync just adds queueing |
| Frame cap | **30** (in-game limiter) | See below |
| Upscaler | FSR/DLSS **Quality**, drop to Balanced if 30 is not held | Keeps the swapchain at 1440p |

**Why 30 and not 40 or 60.** The dock delivers 60 Hz at every resolution and no VRR reaches the
Ally. At 60 Hz the only cleanly-paced caps are 30 and 60 — anything else holds each frame for an
uneven number of refreshes and judders visibly. A locked 30 looks *smoother* than a wandering 42.
Coral Island is the likely exception; if it holds 60, cap it at 60.

**Use the in-game limiter, not Adrenalin.** A driver-level cap hooks the present chain.

**Restart the game after any settings change.** Changing a setting recreates the swapchain and
Windows does not re-apply the optimization to it — measured, not assumed. This is a hard rule for
measurement, not just good practice.

---

## Hypotheses — the per-game cards

Everything below this line is **unmeasured**. `allytune games` prints `unmeasured` for all of them
and a unit test enforces that no game may claim a bottleneck it has not earned.

### Red Dead Redemption 2 — measure this one first

**The best automation target in the library, by a distance.**

- **`system.xml` is plaintext XML** and exposes every graphics setting: `tessellation`,
  `shadowQuality`, `farShadowQuality`, `reflectionQuality`, `volumetricsQuality`, `textureQuality`,
  `waterQuality`, `lightingQuality`, `anisotropicFiltering`. Verified by reading the file.
- **It has a built-in benchmark**, which removes the human from the route entirely.

Together those two facts mean RDR2 can run a genuinely unattended settings sweep — the thing
`00-plan.md` assumed would be possible for Uncharted 4, where it is not. **The plan picked the
wrong first game.** RDR2 should be the vehicle for building phase 3.

Currently set almost entirely Low with textures Ultra, which looks like an auto-detect result
rather than a considered choice. Expect real headroom.

### Ghost of Tsushima: Director's Cut

Same class of PlayStation port as Uncharted 4, so the display recipe should transfer directly.
Reputationally one of the better-optimised ports in this class, so it may hold 30 fps at higher
settings than Uncharted managed. Binary settings — menu only. Likely has a benchmark; verify.

### Horizon Zero Dawn: Complete Edition

**Has a built-in benchmark**, so it is the second-easiest to measure properly. Decima engine,
older port, with a long shader-compilation pass on first launch — warm it up thoroughly or the
first run will be garbage and drag the noise floor with it. Binary settings.

### God of War Ragnarok

Largest install here at 176 GB and the newest engine, so probably the heaviest. Expect to need FSR
**Performance** rather than Quality to hold 30 docked. Binary settings; benchmark unknown.

### Days Gone

Unreal Engine 4, but **no `GameUserSettings.ini` exists anywhere in the profile** — either it has
never been launched, or it stores settings elsewhere. Re-check after first launch; if that file
appears, it becomes fully patchable.

Its horde sequences are heavily CPU-bound, so this is the title most likely to behave like Miles
Morales rather than like Uncharted — meaning **upscaling would do nothing for it**. The GPU-busy
ratio will settle that in one capture.

### Palworld

Unreal Engine 5 with a patchable `GameUserSettings.ini`, so a scripted sweep is possible.
`ally-x-tdp-reference.md` already assigns it Handheld AAA (17 W) but records no measurement behind
that. Route choice needs care: pals wander, so a base-building vista is more repeatable than
anywhere with creatures in frame.

### Planet Zoo

**Has a built-in benchmark.** The reference doc calls it CPU-bound and expects it to benefit from
Memory Integrity being off — both plausible for a simulation title, both unmeasured. If it really
is CPU-bound, upscaling will do nothing and the whole recipe above changes shape for this title.
That single GPU-busy number is the most valuable thing to learn here.

### Coral Island

The lightest title in the library. Likely to hold **60** rather than 30, which would make it the
one game where the 60 Hz panel is not the binding constraint — and therefore the one where a 60 fps
cap is correct. Patchable UE ini.

### Uncharted: The Lost Legacy

Same engine and same collection as Uncharted 4, so the display recipe should transfer directly.
The graphics settings very probably transfer too — but that is an assumption, and assuming it is
precisely the error this project keeps catching. One capture would confirm it cheaply.

---

## Suggested order when you sit down

Ordered by value-per-minute, not by preference:

1. **RDR2** — built-in benchmark *and* patchable settings. Measure it, then build the automated
   sweep against it. This is the one that unlocks phase 3.
2. **Horizon Zero Dawn** and **Planet Zoo** — built-in benchmarks, so cheap to measure well.
   Planet Zoo additionally tests the CPU-bound hypothesis.
3. **Ghost of Tsushima** — apply the recipe, one probe, likely an easy win.
4. **God of War Ragnarok** — the heaviest; most likely to need real settings work.
5. **Days Gone**, **Palworld**, **Coral Island**, **Lost Legacy** — recipe plus a confirming probe.

Per game, once the recipe is applied: **one 20-second probe** confirms independent flip and gives
the GPU-busy ratio, which tells you which knobs are even worth touching. That is about ten minutes
of your time per title. A full three-run noise floor is only worth it for games you intend to tune
in detail.

## What is genuinely still open

- **The noise floor is not established** for the healthy docked configuration. The last attempt
  read 40.94%, and the failure was a clean monotonic warm-up trend across three runs rather than
  random noise — the system was still settling because we measured immediately after a settings
  change and a restart. Warm up for five minutes, then re-run. Until that number exists, treat
  every comparison as provisional.
- **`gpu_temp_c` is a proxy.** The Z1 Extreme exposes no GPU-die edge sensor; allytune matches
  `GPU VR SoC`, the voltage regulator.
- **The 60 Hz ceiling is a dock limitation, not a monitor one.** The AW3225DM does 1440p at
  144–180 Hz over a direct DisplayPort connection. A USB-C → DisplayPort cable would raise the
  refresh ceiling and bring VRR into play, at which point the 30 fps cap stops being necessary and
  every game in this library gets better at once. That is the single highest-leverage purchase
  available, and it is a cable rather than a dock — the DisplayLink theory in the reference doc was
  disproved on 2026-08-30.
