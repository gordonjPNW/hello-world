# Phase 8 — Docked mode

**Time:** ~1 hour including setup
**Risk:** none
**You'll need:** a dock, an Ultra High Speed HDMI cable, ideally a 100 W GaN charger

Docked is where the Ally X stops being a handheld and becomes a small console. Getting it right is
mostly about three unglamorous choices — **which port, which cable, which charger** — and those are
exactly the three most people get wrong.

---

## 1. Use the USB4 port

The Ally X has two USB-C ports and they are **not** equivalent:

- **USB4 Type-C** — full DisplayPort alt mode, highest bandwidth, best Power Delivery negotiation.
  **Use this one for your dock.**
- **USB 3.2 Gen 2 Type-C** — works, but more limited when driving display, power, and peripherals at
  the same time.

This is also the port that replaced the original Ally's proprietary XG Mobile connector, which is
why it's the capable one. If your dock is dropping to a lower refresh rate or the display flickers
under load, check you're in the right port before troubleshooting anything else.

## 2. The cable is not a detail

**Use a certified Ultra High Speed HDMI cable** (HDMI 2.1, 48 Gbps).

The cheap cable in your drawer is the most common reason a dock "won't do 120 Hz." A Standard or
High Speed cable will happily negotiate 4K60 or 1080p60 and silently refuse anything more, with no
error message explaining why. If your refresh rate options are missing, replace the cable before
suspecting the dock.

## 3. Power: the stock 65 W brick is marginal

This is the most commonly missed docked-mode problem.

Docked, the Ally X is simultaneously running a ~30 W profile, charging an 80 Wh battery, and
powering whatever's plugged into the dock — storage, Ethernet, controllers. The included **65 W**
charger can't always cover all of that. The symptoms are confusing rather than obvious: the battery
slowly *drains* while docked and "charging," or performance quietly drops as the system throttles to
fit the available power.

**Fix: a 100 W USB-C PD GaN charger.** Inexpensive, and it removes an entire category of
hard-to-diagnose docked problems.

Check your dock's PD passthrough rating too — some docks reserve 15–20 W for themselves, so a 100 W
charger may deliver only 80 W to the handheld. That's still fine; 65 W into a dock that takes a cut
is not.

## 4. Choosing a dock

Requirements, in priority order:

1. **HDMI 2.1** — for 4K120 or 1080p120 output
2. **USB-C PD passthrough at 100 W** — see above
3. **Gigabit Ethernet** — kills wireless latency and makes 100 GB installs dramatically faster.
   Genuinely worth having if the dock sits near a router
4. **USB-A ports** — controllers, external drives, a keyboard
5. **Stand or cradle** that doesn't block the top exhaust vent

Handheld-specific docks (JSAUX and similar make several aimed at the Ally) tend to get the cradle
geometry and vent clearance right, and some include a fan aligned with the intake. A generic USB-C
hub works electrically but may sit the device badly.

**What you don't need:** SD card slots on the dock (you have a better one built in), VGA/DVI, or
anything advertising "8K."

## 5. Windows-side setup

### Display

Once connected: **Settings → System → Display**.

- Set **Display 2 as the main display** when docked, or use *Show only on 2* — running both panels
  costs power and GPU time for a screen you're not looking at
- Set the resolution to **1920×1080** and the refresh rate as high as the chain supports
- **Verify the refresh rate actually negotiated.** Don't assume — check Advanced display settings. If
  you're not getting 120 Hz, work backward: cable, then port, then dock

`Win + P` cycles display modes and is the fastest way to switch. Worth binding if your keyboard has
a media key for it.

### Audio

Audio doesn't always follow the display. **Settings → System → Sound** and select your TV or
receiver as output. Windows usually remembers per-device once set.

### Power profile

Switch to the **Docked** profile from Phase 5 (30 W, aggressive fan). If you assigned per-game
profiles, check they don't override it — per-game settings win, which is usually right but
occasionally surprising.

## 6. Controllers

Docked, you'll want a separate controller — reaching for the handheld across the room defeats the
purpose.

- Xbox controllers pair over Bluetooth and Just Work
- DualSense works over Bluetooth; Steam Input handles it well including gyro and the touchpad
- 8BitDo and similar third-party pads are fine if Steam Input recognizes them

In Steam, load the **docked** controller configuration you built in Phase 6. Different controller,
different ergonomics, different config — this is why you made two.

## 7. Make docking one motion

The goal is: set it in the cradle, pick up a controller, play. Get there by making these persistent:

- Display mode remembered per-connection (Windows generally handles this once set)
- Audio output remembered per-device
- Docked power profile assigned, ideally auto-switching on AC
- Controller paired and set to reconnect automatically
- Your shell (FSE or Big Picture) already running

If something needs manual intervention every time, that's the thing to fix.

---

## Troubleshooting

| Symptom | Check first |
|---|---|
| No 120 Hz option | Cable, then USB4 port, then dock's HDMI version |
| Battery draining while docked | Charger wattage — this is the 65 W problem |
| Display flickers under load | Cable quality, then try the other USB-C port |
| No audio on TV | Sound output device — it doesn't always follow the display |
| Performance worse than handheld | Confirm the Docked profile is active and not overridden per-game |
| Dock works, Ethernet doesn't | Dock drivers, and confirm Wi-Fi isn't still being preferred |

---

## Done when

- [ ] Dock on the USB4 port
- [ ] Ultra High Speed HDMI cable in use
- [ ] 100 W charger (or confirmed no throttling on 65 W)
- [ ] Refresh rate verified, not assumed
- [x] Audio routes to the TV
- [ ] Docked power profile active
- [ ] Controller paired with its own Steam config
- [ ] Docking requires no manual setup steps

→ Next: [Phase 9 — Storage & library](09-storage-and-library.md)
