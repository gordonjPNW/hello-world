# ROG Ally X — TDP Profile Reference

Validated against the hardware on 2026-07-29. Numbers below are what the sliders
actually accept, not what the original plan assumed.

## Where the controls are

**Armoury Crate SE → Performance → Operating Mode → `Manual`**

`Manual` is what unlocks the power sliders and the fan curve. Every preset mode hides
both.

Once in Manual you get:

- A **profile dropdown** — named profiles, so all four below coexist. No third-party
  tooling needed.
- A **power-source selector** next to it (`On battery` / plugged in). Build Docked in the
  plugged-in context.
- An **Apply** button. Values do not commit on slider release. Always hit Apply.
- A **⋮** menu beside Apply for creating and renaming profiles.

The UI enforces **`SPL ≤ sPPT ≤ fPPT`**. Set them left to right or your entries get
clamped.

Sliders read as **`value/max`** — `16/25W` means 16W set, 25W ceiling.

**Ceilings depend on power source.** Measured:

| Field | Full name | On battery | Plugged in | What it controls |
|-------|-----------|-----------|-----------|------------------|
| SPL   | Sustained Power Limit | 7–**25** W | 7–**30** W | Long-run wattage. The one that matters most. |
| sPPT  | Slow Package Power Tracking | 15–**30** W | 15–**43** W | Medium bursts, ~seconds. |
| fPPT  | Fast Package Power Tracking | 15–**35** W | 15–**53** W | Short spikes, ~milliseconds. |

The 15 W floor on sPPT/fPPT is the main correction to the original plan — it applies in
both contexts and makes the planned Cloud and Efficient burst values unreachable.

Docked is editable only while actually plugged in.

## The four profiles

| Profile          | SPL | sPPT | fPPT | Use for |
|------------------|-----|------|------|---------|
| **Docked**       | 30  | 40   | 50   | Plugged in, TV or monitor |
| **Handheld AAA** | 17  | 20   | 25   | Modern games on battery |
| **Efficient**    | 10  | 15   | 15   | Indies, 2D, emulation up to PS2/GameCube |
| **Cloud**        | 7   | 15   | 15   | Game Pass streaming, Moonlight |

### Why Docked runs 30 / 40 / 50

SPL 30 is the AC ceiling and the only number that sets sustained performance, so it is not
a choice.

sPPT and fPPT are set above the original plan's 33/38 but below the available 43/53. The
extra headroom smooths frame times through load transients — traversal, district
streaming, shader compilation — in the seconds-and-below window. It does not raise average
framerate, which is SPL-bound. The cost is heat spikes and fan noise, which is cheap while
plugged in with a corrected fan curve.

Going all the way to 43/53 is not worth it; the return flattens well before the ceiling
and you pay full noise for nothing measurable. If the fan is intrusive while docked, drop
to 30/33/38 — the framerate loss is negligible. These two values are a smoothness dial,
not a performance one.

## Why these numbers

The Z1 Extreme's performance-per-watt curve is steeply nonlinear:

- **10W → 17W** buys roughly **35%** more performance
- **17W → 25W** buys roughly **12%**

Watts convert into framerate at the *bottom* of the range. That makes **Efficient the
highest-value profile here**, not the compromise one. On the measured 66.5 Wh pack it is
roughly 4–5 hours versus about 2 at 17 W.

### What Docked is actually for

30 W on AC against stock Turbo's 25 W, so Docked is a genuine sustained-power gain rather
than a placebo — plus the raised fan curve and the wider burst limits on top.

Per the curve above, 25 W → 30 W is the flattest stretch of the whole range: maybe 5–8%
for 20% more power and a much louder fan. Worth taking while plugged in, where neither
cost matters. Never worth chasing on battery.

### Why the sPPT/fPPT floor costs nothing

Efficient and Cloud are forced to 15 W burst limits. This does not affect their runtime.
sPPT and fPPT govern bursts of milliseconds to seconds; under sustained load the chip
settles to SPL, which is what sets battery life. The forced headroom is mildly helpful —
menus, shader compilation and level loads spike to 15 W and finish sooner.

Efficient and Cloud therefore differ only in SPL, 10 versus 7. Both are worth keeping,
but expect little separation. The real gap is Efficient versus Handheld AAA.

## Fan curve

Same Manual screen, scroll down. Eight draggable points, 30–110 °C against fan speed %.
There is an **Undo** button.

The stock curve's real defect is not the 60–80 °C band — it is that the curve **goes flat
at roughly 63–65% from 80 °C all the way to 100 °C**. It never ramps. That is the cooler
sitting idle while the chip throttles, and it is the mechanism behind clock sag in hour
two.

| Temp | Stock | Set to |
|------|-------|--------|
| 30 °C | ~10% | leave |
| 40 °C | ~20% | leave |
| 50 °C | ~30% | leave |
| 60 °C | ~45% | **55%** |
| 70 °C | ~55% | **65%** |
| 80 °C | ~62% | **72%** |
| 90 °C | ~65% | **80%** |
| 100 °C | ~63% | **95%** |

Leave the bottom three alone — that is idle and menu behavior, and raising it just makes
the device loud while browsing. Fix the top two; at 100 °C you are already throttling and
there is no quiet worth preserving.

**Work left to right.** The curve must stay non-decreasing, so raising 80 °C before 90 and
100 °C will cause the UI to clamp or snap the later points.

**Check for a Fan 2 curve.** The editor is labelled `Fan 1` and the Ally X has two fans.
If a second curve exists, give it the same shape.

Handheld AAA at 17 W may never reach 80 °C, so the edit being inaudible is the correct
outcome, not a failure. The 90–100 °C changes are insurance for Docked and for long
sessions.

## Bind them per-game (do not skip this)

**Game Library → select a title → Settings → Operating Mode**

Switches automatically on launch, reverts on exit. Set it once per game and you stop
thinking about TDP entirely.

| Game | Profile |
|------|---------|
| Palworld | Handheld AAA (17W) |
| Marvel's Spider-Man: Miles Morales | Handheld AAA (17W) |
| Planet Zoo | Handheld AAA (17W) — CPU-bound, benefits from the Memory Integrity fix |
| Anything 2D / indie | Efficient (10W) |
| Cloud / streamed | Cloud (7W) |

## Display and frame rate caps

There are **two display configurations**, and they take different caps. Conflating them
was the single biggest source of confusion during setup.

| | Handheld | Docked |
|---|---|---|
| Display | Internal panel, 1920×1080 | TV over dock, 60 Hz |
| Refresh | **120 Hz** (confirmed) | 59/60 Hz only — set **60**, not 59 |
| Game resolution | 1080p native | **1080p**, let the TV upscale |
| Frame cap | **40 fps** | **30 or 60** unless the TV has VRR |

### Handheld: 120 Hz, cap 40

Refresh rate and framerate are separate settings. Running the panel at 120 Hz does not
mean rendering 120 fps — it gives VRR a window to work in. At a 40 fps cap, LFC doubles to
80 Hz, which lands inside the 60–120 Hz VRR window and paces cleanly.

120 Hz costs roughly 0.5–1 W of display power, about 5% of the 17 W budget. The GPU cost
is zero, since the frame count is unchanged. That is the whole trade: ~1 W buys clean
pacing at the cap you actually want to run.

### Docked: run games at 1080p

**The desktop was found at 3840×2160.** At 30 W a Z1 Extreme is not a 4K device, and games
default to the desktop resolution — Spider-Man at native 4K would be unplayable no matter
how well the TDP profile is tuned. 4K is 4× the pixels of 1080p on a handheld APU, so this
matters more than every wattage decision in this document combined.

Set games to 1080p docked and let the TV upscale. Try 1440p only for lighter titles, and
only with headroom to spare.

### Why 40 fps needs 120 Hz

At 60 Hz output the VRR window has no room, and a 40 fps cap means 1.5 refreshes per
frame — a 1-2-1-2 alternating pattern, which is visible judder. **The only cleanly paced
caps at 60 Hz are 30 and 60.** That is why the docked row above reads 30 or 60, and why a
panel that silently reverts to 60 Hz means dropping the cap to 30 rather than running 40
badly paced.

Docked at 30 fps, also make sure the TV is at **60 Hz and not 59** — 59.94 does not divide
cleanly into 30 and produces a slow pacing drift.

If the TV supports VRR or FreeSync over HDMI and it is enabled at both ends, 40 fps works
docked too. Unverified. A HDMI 2.0 dock link would also cap the TV at 4K60 and is worth
ruling out.

Set caps in AMD Adrenalin → Frame Rate Target Control, or in-game where available.

For cloud and streaming, the frame cap and display refresh are where the battery savings
come from — not the TDP floor. The APU decodes video rather than rendering and never
approaches 7 W.

## Validate, don't trust

Run something demanding at 17 W for ~20 minutes and watch whether clocks hold.

- Clocks **hold** → the profile is good.
- Clocks **sag** → fix the fan curve, not the wattage. Adding watts to a thermally
  limited chip just adds heat and noise.

Silicon lottery moves the efficiency sweet spot a watt or two either way, so treat every
number above as a validated starting point rather than a final answer.

## Context from this session

- Battery health measured at roughly **83%** (66.5 Wh full-charge vs 80 Wh nominal), so
  runtime estimates are against that reduced ceiling.
- **Memory Integrity is off** — worth the most in CPU-bound titles like Planet Zoo.
- **Power mode synchronization** is ON, syncing Windows power modes to the Armoury Crate
  Operating Mode.
- Internal panel confirmed at **120 Hz**.

### Setting refresh rate

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\gordo\Documents\Claude\set-refresh-rate.ps1" -Rate 120
```

Two gotchas, both of which cost time during setup:

1. **The script is not on `PATH`.** Calling it by bare name fails with
   `CommandNotFoundException`. It needs the full path.
2. **Execution policy blocks it** as an unsigned local script, so the
   `-ExecutionPolicy Bypass` form above is the one that works. The call operator (`&`)
   with a quoted path does not get past this.

**The script targets whichever display is primary.** While docked that is the TV, so it
will report the TV's modes and refuse 120 Hz — this looked like a failure but was the
script doing the right thing to the wrong display. **Undock before setting the panel
to 120 Hz.**

Read the supported list to tell which display you are on: `59, 60` is the TV, a list
containing 120 is the internal panel.

Refresh rate can also be set from Armoury Crate SE Command Center, or Windows
Settings → System → Display → Advanced display.

Possible improvement: extend the script with `-List` to enumerate displays and `-Display N`
to target one explicitly, so it cannot silently address the TV.

## Open items

- [x] Fan curve is **per-profile**. Curves set on Handheld AAA and Docked. Efficient and
      Cloud left stock — they never reach the 60–80 °C band.
- [x] AC ceilings measured: SPL 30, sPPT 43, fPPT 53. Docked set to 30 / 40 / 50.
- [x] Internal panel set to **120 Hz** and confirmed.
- [ ] Confirm 120 Hz survives a sleep/wake and a dock/undock cycle. Windows renegotiates
      the display mode on both, and Armoury Crate has been known to force 60 Hz on an
      operating mode change. If it does not persist, a scheduled task on unlock or
      display-change is the fix.
- [ ] Set the 40 fps cap in Adrenalin → Frame Rate Target Control.
- [ ] Set games to 1080p when docked. Currently the desktop runs 4K.
- [ ] Determine whether the TV supports VRR/FreeSync over HDMI, and whether the dock link
      is HDMI 2.0 or 2.1. Decides the docked frame cap between 40 and 30/60.
- [ ] Confirm the Docked fan curve survived the power-source context switch.
- [ ] Confirm the battery profiles still read as set — Handheld AAA at 17/20/25.
- [ ] Confirm whether a `Fan 2` curve exists and mirror it.
- [ ] Run the 20-minute validation at 17 W. **Do this before enabling any of the phase 2
      software features below** — frame generation or a second frame cap layered on top
      will make clock behavior unreadable.

## Phase 2 — not yet configured

Radeon Super Chill, frame generation, upscaling, and the remaining Armoury Crate
settings. Note before starting:

- **Super Chill and Frame Rate Target Control both cap framerate.** Running both invites
  them to fight. Pick one as the cap and leave the other off.
- **Frame generation changes what the validation test measures.** Generated frames do not
  load the GPU the way rendered ones do, so a clock-hold result gathered with frame gen on
  says nothing about the 17 W profile itself.
