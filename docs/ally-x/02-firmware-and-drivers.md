# Phase 2 — Firmware and drivers

**Time:** ~45 minutes, mostly waiting
**Risk:** low, but keep it plugged in
**You'll need:** AC power, a stable Wi-Fi connection

Stale firmware is the single most common cause of "my fan is always loud and my battery life is
bad." ASUS shipped real power-management and thermal fixes across the Ally X's life. Get current
before you tune anything, or you'll be tuning around bugs that were already fixed.

> **Keep the device plugged in for this entire phase.** A BIOS or MCU update interrupted by a flat
> battery is the one way to genuinely brick the handheld.

---

## 1. BIOS and MCU firmware

Both live in **Armoury Crate SE → Settings → Update Center**. Check **MyASUS** too — the two apps
occasionally surface different packages.

Install in this order, rebooting when asked:

1. **MCU firmware** — the microcontroller managing power delivery, fan behavior, and the Command
   Center buttons. Updates here have the most direct effect on fan noise and idle drain.
2. **BIOS** — reboots into a flash screen. Don't touch anything until it returns to Windows.
3. Any **ASUS System Control Interface** / chipset packages offered.

Re-check Update Center after rebooting. Updates sometimes chain, and one round often isn't enough.

## 2. Armoury Crate SE itself

Armoury Crate SE updates **separately from firmware** and people miss this constantly. Its own
update lives in **Armoury Crate SE → Settings → Update Center → Armoury Crate SE**.

If yours is badly out of date or behaving strangely, the clean fix is the **Armoury Crate Uninstall
Tool** from the ASUS ROG Ally X support page, followed by a fresh install — a plain uninstall leaves
services behind.

## 3. Graphics driver — pick a lane

This is a real decision, not a formality.

### Option A — ASUS-validated driver (start here)

From the **ASUS ROG Ally X support page → Driver & Utility → VGA**, or offered through MyASUS.

- Tuned for this specific power envelope and validated against the Ally X's firmware
- Fewer weird power-state and display-mode bugs
- Lags AMD's public releases, sometimes by months

**Use this as your baseline.** Do Phases 3–11 on it. It is the more reliable foundation.

### Option B — generic AMD Adrenalin

From **amd.com**, choosing the Ryzen Z1 Extreme / integrated Radeon graphics package.

- Newer **FSR** runtime and access to **AFMF 2** (driver-level frame generation, see Phase 7)
- Day-one fixes for new releases
- Occasionally regresses handheld-specific power behavior; ASUS doesn't validate it

Worth trying **after** you have a baseline, so you can measure whether it actually helped you.

### Switching cleanly

Never install one over the other. Use **DDU (Display Driver Uninstaller)**:

1. Download DDU and the driver you're switching to *before* starting.
2. Disconnect from Wi-Fi (stops Windows racing you to install its own driver).
3. Run DDU → *Clean and restart*.
4. Install your chosen driver.
5. Reconnect Wi-Fi.

Rolling back is the same process in reverse. This is why Phase 1's baseline matters — it's how you
tell whether the switch was an improvement or just a change.

## 4. Windows Update

Run it and let it finish, including optional driver updates. Reboot and run it again until it comes
back clean.

One thing to watch: Windows Update sometimes replaces your graphics driver with its own older
version. If your frame rate mysteriously drops a week from now, check the driver version first —
this is usually the culprit. You can prevent it under **Advanced options → Delivery optimization**,
or more reliably by pausing driver updates once you've settled on a version.

---

## Done when

- [ ] MCU firmware current
- [ ] BIOS current
- [ ] Armoury Crate SE current
- [ ] Graphics driver deliberately chosen (ASUS build recommended to start)
- [ ] Windows Update returns clean after a reboot
- [ ] Update Center re-checked and showing nothing new

→ Next: [Phase 3 — Windows tuning](03-windows-tuning.md)
