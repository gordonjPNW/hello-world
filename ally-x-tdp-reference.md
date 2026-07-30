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

| Field | Full name | Range | What it controls |
|-------|-----------|-------|------------------|
| SPL   | Sustained Power Limit | **7–25 W** | Long-run wattage. The one that matters most. |
| sPPT  | Slow Package Power Tracking | **15–30 W** | Medium bursts, ~seconds. |
| fPPT  | Fast Package Power Tracking | **15–35 W** | Short spikes, ~milliseconds. |

Those floors and ceilings are the main correction to the original plan: SPL cannot reach
30 W, and sPPT/fPPT cannot go below 15 W.

## The four profiles

| Profile          | SPL | sPPT | fPPT | Use for |
|------------------|-----|------|------|---------|
| **Docked**       | 25  | 30   | 35   | Plugged in, TV or monitor |
| **Handheld AAA** | 17  | 20   | 25   | Modern games on battery |
| **Efficient**    | 10  | 15   | 15   | Indies, 2D, emulation up to PS2/GameCube |
| **Cloud**        | 7   | 15   | 15   | Game Pass streaming, Moonlight |

### The SPL ceiling on AC

The 7–25 / 15–30 / 15–35 ranges above are the **on-battery** ceilings. Docked appears to
be editable only while actually plugged in, and the ceilings rise in that context.

So Docked at 25/30/35 is a floor, not a target. Read the actual maxima off the sliders
while on AC and take what they give — if SPL reaches 30, run **30 / 33 / 38** as the
original plan intended, and Docked becomes a genuine gain over stock Turbo again rather
than a fan-curve-only profile.

## Why these numbers

The Z1 Extreme's performance-per-watt curve is steeply nonlinear:

- **10W → 17W** buys roughly **35%** more performance
- **17W → 25W** buys roughly **12%**

Watts convert into framerate at the *bottom* of the range. That makes **Efficient the
highest-value profile here**, not the compromise one. On the measured 66.5 Wh pack it is
roughly 4–5 hours versus about 2 at 17 W.

### What Docked is actually for

The original plan justified Docked as a gain over stock Turbo's 25 W on AC. With SPL
capped at 25 W, **Docked matches Turbo on sustained power** — it is not a wattage gain.

Keep it anyway, but for the right reason: it carries the raised fan curve and the wider
burst limits. Per the logic below, a Turbo-wattage profile with better cooling is the
more useful thing regardless.

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

## Frame rate caps

Display is currently at **60 Hz**, VRR window **60–120 Hz**.

Cap at **40 fps or below**. A 40 fps cap sits comfortably inside the VRR window and cuts
GPU power hard. A 50 fps cap does **not** work well at 60 Hz output.

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
- Display is at **60 Hz**; use `set-refresh-rate.ps1 -Rate 120` when docked.

## Open items

- [x] Fan curve is **per-profile**. Curves set on Handheld AAA and Docked. Efficient and
      Cloud left stock — they never reach the 60–80 °C band.
- [ ] Read the real SPL/sPPT/fPPT maxima off the Docked profile while plugged in and
      raise Docked to whatever they allow.
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
