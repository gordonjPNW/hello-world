# Phase 11 — Validation

**Time:** ~1 hour, plus an overnight test
**Risk:** none
**You'll need:** your Phase 1 baseline numbers

Everything above is a claim until you measure it. This phase turns the guide from "things I read on
the internet" into "things I verified on my device." It also tells you which changes actually did
something for *your* library, so you know what to keep.

---

## 1. Repeat the performance benchmark

Same benchmark, same scene, same settings as Phase 1. **Identical conditions or the comparison is
meaningless:**

- Armoury Crate: **Turbo / Handheld Max**, plugged in
- Resolution **1920×1080**, same quality preset
- **Upscaling off** — you're measuring the hardware, not FSR
- Device at room temperature, not straight off a long session

Record: average FPS, 1 % low FPS, CPU and GPU temperature, package power.

### What to expect

Be realistic about this. The Windows-side changes in Phase 3 are worth a modest but real
improvement — the VBS/Memory Integrity change is the largest single contributor. If firmware in
Phase 2 was badly out of date, you may see more.

**If you see a dramatic jump, be suspicious of your methodology** before you celebrate. Check that
both runs used the same preset and that the first wasn't thermally throttled.

**1 % lows are the number that matters most.** Average FPS is what marketing quotes; 1 % lows are
what you feel. Frame pacing improvements from fan curves and driver changes often show up here while
barely moving the average.

## 2. Repeat the battery test

Charge to 100 % (temporarily lift the 80 % cap so it's comparable to your baseline), unplug, play
the same game for 30 minutes on **Handheld Default**. Record percentage lost and the average wattage
from the overlay.

Then measure what the Phase 7 work bought you — same game, same 30 minutes, but **capped at 40 fps
with FSR Quality at 900p**. This comparison is usually the most striking result in the whole guide,
and it's the one that changes how you play.

Re-enable the 80 % cap when you're done.

## 3. Repeat the standby test — the important one

This is the measurement that proves Phase 4 worked, and the one nobody does.

1. Charge up
2. Press the power button once — it should now **hibernate**, not sleep
3. Leave it 8+ hours untouched
4. Check the percentage

Compare against your Phase 1 overnight figure. With hibernate configured, the drop should be
essentially **zero**.

Then generate the report and compare:

```powershell
powercfg /sleepstudy /output "$HOME\Desktop\sleepstudy-after.html"
powercfg /batteryreport /output "$HOME\Desktop\battery-after.html"
```

Open `sleepstudy-after.html` alongside `sleepstudy-baseline.html`. Look at drain rate per session and
what kept the system awake. If something is still waking the device, this report names it.

## 4. Verify the docked chain

Don't assume any of this — check it:

- **Settings → System → Display → Advanced display** — confirm the refresh rate actually negotiated.
  If you expected 120 Hz and see 60, work backward: cable, USB4 port, dock
- Play docked for 20 minutes and **confirm the battery is charging, not draining.** Draining while
  plugged in is the 65 W charger problem from Phase 8
- Confirm audio routes to the TV
- Confirm the Docked power profile is active and not overridden by a per-game assignment

## 5. Confirm nothing regressed

- Reboot and confirm your shell still launches correctly
- Confirm `powercfg /a` still lists Hibernate
- Check the graphics driver version — Windows Update sometimes silently replaces it, and this is the
  usual cause of a mysterious performance drop a week later
- Launch one game from each launcher you use

---

## Results table

Fill this in. Keep it — when something feels off in three months, this is what you compare against.

| Metric | Baseline (Phase 1) | After | Change |
|---|---|---|---|
| Avg FPS (benchmark, 1080p native, Turbo) | | | |
| 1 % low FPS | | | |
| CPU temp (peak) | | | |
| GPU temp (peak) | | | |
| Package power (avg) | | | |
| Battery % lost, 30 min @ Handheld Default | | | |
| Battery % lost, 30 min @ 900p/FSR/40 fps cap | — | | — |
| **Overnight standby drain %** | | | |
| Battery full-charge capacity (from batteryreport) | | | |

**Setup recorded:**

| | |
|---|---|
| BIOS / MCU version | |
| Graphics driver (ASUS or AMD, version) | |
| Memory integrity | on / off |
| Shell | FSE / Big Picture |
| Benchmark used | |
| Date | |

---

## If something got worse

Work backward through the phases — the changes most likely to cause a regression, in order:

1. **Graphics driver swap** (Phase 2). Roll back with DDU and re-measure
2. **Fan curve too quiet** (Phase 5). A too-conservative curve causes thermal throttling that reads
   as a performance loss. Check temperatures first
3. **TDP profile mismatch** — a per-game assignment overriding the profile you think is active
4. **VRAM forced to a fixed value** when Auto was fine (Phase 5)
5. **Frame generation enabled** where it doesn't belong (Phase 7). It raises apparent smoothness
   while making input feel worse — easy to misread as "something is wrong"

Change **one thing at a time** and re-measure. This is exactly why Phase 1 exists.

---

## Done when

- [ ] Benchmark re-run and compared
- [ ] Battery test re-run and compared
- [ ] Capped/upscaled battery comparison recorded
- [ ] Overnight standby re-tested — the important one
- [ ] Docked chain verified end to end
- [ ] Results table filled in
- [ ] Nothing regressed after a reboot

← Back to [Overview](00-overview.md)
