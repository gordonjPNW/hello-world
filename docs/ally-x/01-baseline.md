# Phase 1 — Baseline

**Time:** ~30 minutes (plus one overnight test)
**Risk:** none
**You'll need:** a USB drive (16 GB+) for recovery media

Skipping this phase doesn't break anything. It just means that when you finish the guide, you won't
be able to tell whether any of it worked — and you won't know which change to undo when something
regresses. Do it.

---

## 1. Record your starting state

Write these down (a note on your phone is fine — you're about to change some of them):

| What | Where to find it |
|---|---|
| BIOS / firmware version | Armoury Crate SE → Settings → Update Center, or MyASUS |
| MCU firmware version | Same screen |
| Armoury Crate SE version | Armoury Crate SE → Settings → About |
| AMD graphics driver version | AMD Software → Home → gear icon → System |
| Windows build | Settings → System → About, or run `winver` |

Quick way to capture most of it at once — open Terminal and run:

```powershell
Get-ComputerInfo -Property OsName,OsVersion,OsBuildNumber,BiosSMBIOSBIOSVersion
Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,DriverDate
```

## 2. Capture a performance baseline

Pick a benchmark you can repeat *identically* later. Consistency matters far more than which one.

**Recommended:** the built-in benchmark in **Cyberpunk 2077** or **Shadow of the Tomb Raider** —
both are fixed camera paths, so run-to-run variance is low.

**No built-in benchmark handy?** Pick one game you actually play, find a repeatable spot (a specific
standing position in a hub area works), and record 60 seconds there.

Set it up like this and **do not change these settings** between the before and after run:

- Armoury Crate operating mode: **Turbo**, plugged in
- Resolution: **1920×1080**, your usual quality preset
- Upscaling: **off** for the baseline (you want to measure the hardware, not FSR)

Record: **average FPS**, **1 % low FPS**, CPU and GPU temperature, and package power draw. The
Armoury Crate overlay shows most of this; HWiNFO64 with an on-screen display gives you more detail
if you want it.

## 3. Capture a battery baseline

Two numbers, both important:

**Active drain.** Charge to 100 %, unplug, and play at **Performance mode** for 30 minutes. Note the
percentage lost. Multiply by 2 for a rough hours-per-charge figure. Also note the **watts** the
Armoury Crate overlay reports during play — this is the more precise number and the one to compare
later.

**Standby drain.** This is the one people skip and then complain about:

1. Charge to 100 %.
2. Press the power button once to sleep it. Don't shut down.
3. Leave it overnight, 8+ hours, untouched.
4. Check the battery percentage in the morning. **Write down the number.**

Phase 4 exists to fix this figure. You need the "before" to know it worked.

## 4. Generate the built-in Windows reports

```powershell
powercfg /batteryreport /output "$HOME\Desktop\battery-baseline.html"
powercfg /sleepstudy /output "$HOME\Desktop\sleepstudy-baseline.html"
powercfg /a
```

- **`batteryreport`** shows design capacity vs current full-charge capacity — your battery's actual
  health, and worth having on record.
- **`sleepstudy`** shows what woke the device and what drained it during standby. Come back to this
  in Phase 4.
- **`powercfg /a`** lists which sleep states are available. On the Ally X you'll typically see
  *Standby (S0 Low Power Idle)* — Modern Standby — and you want **Hibernate** listed too. If
  hibernate is missing, Phase 4 covers enabling it.

Keep both HTML files. They're your reference point.

## 5. Insurance

**Save your BitLocker recovery key.** Settings → Privacy & security → Device encryption → BitLocker
recovery key backup. Save it to your Microsoft account *and* write it down somewhere physical. You
almost certainly won't need it. The cost of not having it when you do is your entire drive.

**Create ASUS recovery media.** Use MyASUS → Customer Service → System Diagnosis, or ASUS Cloud
Recovery (hold **Volume Down + Power** at boot to reach the BIOS, then Cloud Recovery). This is your
fallback if a driver or registry change goes badly in a later phase. A 16 GB USB drive is enough.

---

## Done when

- [ ] Versions recorded
- [ ] Benchmark run and numbers written down
- [ ] 30-minute active battery drain recorded
- [ ] Overnight standby drain recorded
- [ ] `battery-baseline.html` and `sleepstudy-baseline.html` saved
- [ ] BitLocker key saved somewhere you'd actually find it
- [ ] Recovery USB created

→ Next: [Phase 2 — Firmware & drivers](02-firmware-and-drivers.md)
