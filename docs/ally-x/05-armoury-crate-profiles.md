# Phase 5 — Armoury Crate SE profiles

**Time:** ~45 minutes
**Risk:** low — profiles are just settings, and Turbo is already the stock ceiling
**You'll need:** Armoury Crate SE current (Phase 2)

The core of the setup. Stock Armoury Crate gives you Silent / Performance / Turbo, which is three
answers to a question that has four. Specifically, it has no idea whether you're on a couch with an
outlet or on a train with 40 % battery, and it has no concept of "docked, fan noise is irrelevant."

You'll build four named Manual profiles instead.

> **Note:** Armoury Crate SE is GUI-only — there's no config file or command-line interface. This
> phase is click-work. Do it once and it persists.

---

## The four profiles

Set these in **Armoury Crate SE → Operating Mode → Manual**. The Ally X's stock ceiling is 25 W on
battery and 30 W plugged in, so nothing here is overclocking.

| Profile | TDP | Fan | When to use it |
|---|---|---|---|
| **Battery Sipper** | 10–13 W | Quiet | 2D, indie, emulation, older titles. Maximum runtime |
| **Handheld Default** | 15–17 W | Balanced | Your everyday driver — best perf-per-watt on the Z1 Extreme |
| **Handheld Max** | 25 W | Performance | Plugged in on the couch, demanding titles |
| **Docked** | 30 W | Aggressive | On the dock, external display, noise doesn't matter |

### Why 15–17 W is the sweet spot

The Z1 Extreme's efficiency curve flattens noticeably past roughly 17 W. Going from 15 W to 25 W
costs you around 60 % more power for something in the range of 15–20 % more frame rate in
GPU-limited titles — and that's the *good* case. Below about 13 W the GPU starts starving and frame
pacing gets choppy even when the average FPS looks acceptable.

**Handheld Default is where you should live on battery.** Reach for Handheld Max when you're plugged
in, not as a habit.

### Setting TDP correctly

Manual mode exposes three values, and they differ in **how long each limit applies**, not just how
high:

| Value | Full name | Applies for | Slider range |
|---|---|---|---|
| **SPL** | Sustained Power Limit | Indefinitely — the real ceiling | **7–30 W** |
| **sPPT** | Slow Package Power Tracking | ~30 s to a couple of minutes | **15–43 W** |
| **fPPT** | Fast Package Power Tracking | ~5–10 s bursts | **15–53 W** |

SPL is the number in the profile table above — it's what determines your sustained frame rate and
your battery drain. The other two govern how freely the APU can spike above it during level loads,
shader compilation, and menu transitions.

> **Note the floors.** sPPT and fPPT cannot go below **15 W**, regardless of SPL. This matters for
> the low-power profiles: at SPL 10 W you simply cannot set a boost limit "2 W above," so leave both
> at 15 W and let the floor do its job.

Suggested values:

| Profile | SPL | sPPT | fPPT |
|---|---|---|---|
| Battery Sipper | 10–13 | 15 | 15 |
| Handheld Default | 17 | 20 | 22 |
| Handheld Max | 25 | 28 | 30 |
| Docked | 30 | 33 | 35 |

Setting all three equal where you *can* flattens boost response and makes the device feel sluggish
in menus and during loading. Leaving a gap lets it spike briefly without raising sustained draw — you
get responsiveness without paying for it in battery.

> **30 W is plugged-in only.** On battery the ceiling is 25 W, so the Docked profile will silently
> behave as Handheld Max if you undock without switching profiles.

## Fan curves

The stock curve is conservative until it abruptly isn't — it stays quiet, lets temperature climb,
then ramps hard. The audible *change* is more annoying than steady noise, so build curves that ramp
earlier and more gradually.

Rough shape per profile (**Manual → Fan Curve**):

- **Battery Sipper:** minimal until ~60 °C, gentle ramp after. Prioritize silence; you're not
  generating much heat at 13 W anyway.
- **Handheld Default:** start ramping around 50 °C, reaching moderate speed by 70 °C. Steady and
  unobtrusive.
- **Handheld Max:** ramp from ~45 °C, aggressive past 75 °C. You're plugged in; keep it cool.
- **Docked:** ramp early and hard. The device is across the room and the TV is louder than the fan.

The Z1 Extreme will thermal-throttle rather than damage itself, so you can't hurt anything here. If
a profile ever feels slower than it should, check temperatures first — a too-quiet curve is a common
self-inflicted performance problem.

## VRAM allocation

**Auto is correct for the large majority of titles.** With 24 GB of LPDDR5X the driver has plenty of
room and manages the split dynamically.

Force a fixed allocation only when you hit a specific symptom — a game that stutters as textures
load, or one that outright refuses to launch citing insufficient video memory. Then set **6 GB** and
retest; **8 GB** if that didn't do it.

Don't set it high "just in case." Fixed VRAM is carved out of system memory permanently, and
over-allocating starves the game of the RAM it also needs. The 24 GB is an advantage precisely
because it's flexible.

## Per-game auto-switching

Armoury Crate can bind a profile to a game so it switches on launch. Worth setting up for your
regulars — it removes the "why is this running badly… oh, I'm still on Battery Sipper" moment.

**Armoury Crate SE → Game Library →** select a title **→** assign an operating mode.

If a game isn't detected automatically, add it manually. Non-Steam and emulator executables usually
need this.

## Command Center bindings

Command Center (the left-hand button) is your in-game control panel. Set it to the things you
actually change mid-session:

- **Operating Mode** — cycle profiles without leaving the game
- **Real-time monitor** — the performance overlay (needed for Phase 11)
- **Resolution / refresh rate**
- **FPS limiter**

Skip the RGB and keyboard shortcuts unless you use them. Four useful slots beat six with filler.

## Rear buttons (M1 / M2)

Underused and genuinely valuable — you can reach them without moving your thumbs off the sticks.
Armoury Crate can bind them globally, but **leave them unmapped here** and set them per-game in
Steam Input instead (Phase 6). Steam's per-game context is more useful than one global mapping.

---

## Done when

- [ ] Four Manual profiles created with SPL/sPPT/fPPT set
- [ ] Fan curve set per profile
- [ ] VRAM on Auto (unless you hit a specific symptom)
- [ ] Per-game profiles assigned for your regulars
- [ ] Command Center bindings configured

→ Next: [Phase 6 — Steam setup](06-steam-setup.md)
