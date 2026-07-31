# Phase 4 — Sleep, standby, and battery longevity

**Time:** ~30 minutes, plus an overnight test to confirm
**Risk:** low, fully reversible
**You'll need:** your Phase 1 overnight standby number

This is the phase that matters most on a Windows-only handheld, and the one almost every guide
skips. A SteamOS-style handheld suspends and resumes like a Switch. Windows uses **Modern Standby**
(S0 Low Power Idle), where the machine never truly sleeps — it keeps the network alive and lets
background tasks wake it. Leave the Ally X "asleep" in a bag overnight and you can find it
significantly drained, or hot, or flat.

The fix is straightforward: **use hibernate for long sleeps, keep standby for short ones.**

---

## 1. Confirm hibernate is available

Open Terminal **as Administrator**:

```powershell
powercfg /a
```

You want **Hibernate** in the available list. If it's under "not available," enable it:

```powershell
powercfg /h on
```

Hibernate writes memory to `hiberfil.sys` on disk and fully powers down — **zero drain**, and your
session comes back exactly as you left it. The cost is a slower resume (roughly 10–20 seconds versus
near-instant) and disk space equal to a fraction of your RAM.

On a 24 GB machine that file is large. If you want the space back later, `powercfg /h /size 40`
reduces it, or `powercfg /h off` disables hibernate entirely.

## 2. Make the power button hibernate

The single highest-value change in this phase. One press of the power button should put the device
away properly, not leave it idling.

**GUI route:** Control Panel → Hardware and Sound → Power Options → *Choose what the power buttons
do* → set **When I press the power button** to **Hibernate** for both On battery and Plugged in.

**Command line** (Administrator), which is faster and verifiable:

```powershell
# 0=nothing 1=sleep 2=hibernate 3=shutdown 4=display off
powercfg /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS PBUTTONACTION 2
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS PBUTTONACTION 2
powercfg /setactive SCHEME_CURRENT
```

> The power button is also your fingerprint reader. Hibernate resume still prompts for it normally —
> this change doesn't affect unlocking.

## 3. Hibernate automatically after a short sleep

The best of both: quick standby for a bathroom break, automatic hibernate for anything longer.

```powershell
# Hibernate after 30 min of standby on battery, 60 min plugged in (seconds)
powercfg /setdcvalueindex SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE 1800
powercfg /setacvalueindex SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE 3600
powercfg /setactive SCHEME_CURRENT
```

Tune `1800` to taste. Thirty minutes is a good default — long enough that normal interruptions
resume instantly, short enough that the device is properly off before it goes in a bag.

If this setting is hidden in the GUI, that's expected; the command sets it regardless.

## 4. Stop things waking the device

Find out what's been waking it:

```powershell
powercfg /lastwake
powercfg /devicequery wake_armed
```

Most commonly it's the network adapter. Unless you use Wake-on-LAN, disarm it:

**Device Manager → Network adapters →** your Wi-Fi adapter **→ Properties → Power Management →**
uncheck *Allow this device to wake the computer*.

Then stop scheduled maintenance from waking it:

**Control Panel → Power Options → Change plan settings → Change advanced power settings → Sleep →
Allow wake timers → Disable** (both battery and plugged in).

## 5. Cap the charge at 80 %

You dock regularly, which means the Ally X spends real time sitting at 100 % on AC. That is the main
long-term degradation path for a lithium cell, and it's the thing most likely to make the device
feel worse in two years.

**MyASUS → Customization → Battery Care Mode**, or **Armoury Crate SE → Settings → Battery**. Set
the limit to **80 %**.

- **Cost:** roughly 20 % less runtime per charge.
- **Benefit:** meaningfully slower capacity loss over the device's life.

On an 80 Wh battery you can afford it, and you can lift the cap temporarily before a trip. If you're
mostly handheld and away from power, the "maximum lifespan" setting is the wrong trade — use the
full charge and accept the wear.

## 6. Verify it worked

Repeat the Phase 1 overnight test, unchanged:

1. Charge up, then press the power button once.
2. Leave it 8+ hours untouched.
3. Check the percentage in the morning.

Compare against your Phase 1 figure. With hibernate on the power button the drop should be
essentially **zero**, versus whatever you measured before.

Then check the report:

```powershell
powercfg /sleepstudy /output "$HOME\Desktop\sleepstudy-after.html"
```

Open it and compare against `sleepstudy-baseline.html`. The report shows each standby session, how
long it lasted, drain rate, and — most usefully — which components kept the system awake.

---

## Reference: expected runtime

Rough figures for the 80 Wh battery at 100 % charge, **under actual game load**. Real numbers vary a
lot by title; treat these as planning guides, not promises.

> **Why these look lower than figures you'll see elsewhere.** TDP is the *APU's* power budget, not
> the system's. The display, fans, SSD, and radios add roughly 5–8 W on top. So a "15 W" profile
> pulls something closer to 21–23 W at the wall — which is why 80 Wh ÷ 15 W = 5.3 hours on paper but
> ~3.5 in practice. Sources quoting 5–6 hours at 15 W are usually measuring light load, not gaming.

| Profile | TDP | Realistic runtime | Typical use |
|---|---|---|---|
| Battery Sipper | ~10–13 W | 4–6 hr | 2D, indie, emulation, older titles |
| Handheld Default | ~15–17 W | 3–3.5 hr | Most AAA at 900p + FSR |
| Handheld Max | ~25 W | 2–2.5 hr | Demanding titles, short sessions |

At an 80 % charge cap, subtract roughly a fifth from each.

The biggest runtime lever isn't the TDP profile — it's **capping frame rate** (Phase 7). A 40 fps cap
with VRR enabled can extend a session substantially over letting the game run uncapped at 55.

---

## Done when

- [ ] Hibernate available (`powercfg /a`)
- [ ] Power button set to hibernate
- [ ] `HIBERNATEIDLE` configured
- [ ] Wake timers disabled, network wake disarmed
- [ ] Battery Care at 80 % (or a deliberate decision against it)
- [ ] Overnight test repeated and compared to baseline

→ Next: [Phase 5 — Armoury Crate profiles](05-armoury-crate-profiles.md)
