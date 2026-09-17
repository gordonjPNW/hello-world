# Xbox Series X on the Alienware 32" 4K QD-OLED

**Time:** ~45 minutes, most of it the HDR calibration app
**Risk:** none
**You'll need:** the Ultra High Speed HDMI cable in the Xbox box, and the Xbox HDR Calibration app

This picks up from the [ROG Ally X TDP reference](../../ally-x-tdp-reference.md), which documented
the same monitor from the handheld's side. Much of what was learned there applies. One thing —
the single most important thing — must be **inverted**.

---

## What carries over, and what doesn't

| From the Ally work | Applies to Xbox? | Why |
|---|---|---|
| Monitor is capped at 59/60 Hz | **No** | That was the dock. Xbox connects direct — the panel does 4K 120 Hz |
| VRR unavailable | **No** | Same cause. VRR works over a direct HDMI 2.1 link |
| High refresh + low frame cap | **Yes** | Exactly the same logic, see [Frame rate](#4-frame-rate-and-the-40-fps-principle) |
| Cable quality is not a detail | **Yes** | Still the most common cause of a missing 120 Hz option |
| Set 60 Hz, never 59 | **Yes, but moot** | You'll be at 120 |
| **Render games at 1080p** | **NO — invert this** | See below. This is the big one |

### The 1080p rule does not transfer

The Ally reference is emphatic that games should run at 1080p and integer-scale to 4K. That advice
was correct **for a 12-CU iGPU on a 30 W budget**. 4K is 4× the pixels of 1080p, and a Z1 Extreme
cannot pay for them.

The Series X is a ~12 TFLOP, ~150 W console built specifically to drive this resolution. It has its
own per-title render targets and reconstruction, tuned by the developer, and it is far better at
that decision than you are from a settings menu.

**Set the Xbox to 4K UHD and never think about resolution again.** There is no TDP profile, no FSR
choice, and no render-resolution decision to make on this platform. That entire layer of the Ally
guide has no Xbox equivalent.

---

## 1. The physical link

The monitor has **two full-bandwidth HDMI 2.1 FRL ports (48 Gbps)**. That is enough for
4K / 120 Hz / 10-bit / RGB 4:4:4 with room to spare, which is the ceiling the Xbox can actually hit.

- **Use the HDMI cable that came with the Xbox.** It is a certified Ultra High Speed (48 Gbps)
  cable. The drawer cable is how you end up without a 120 Hz option and no error message saying why
  — the same failure mode documented in Ally Phase 8.
- **Do not put anything in the middle.** No dock, no hub, no HDMI switch, no capture card unless it
  is explicitly 4K120 HDMI 2.1 passthrough. Everything that went wrong on the Ally side of this
  monitor went wrong in exactly that position in the chain.
- **One of the two HDMI ports is the eARC port.** If you plan to run audio to a soundbar or receiver
  (see §6), put the *audio device* on the eARC port and the Xbox on the other one.

## 2. Xbox video output settings

**Settings → General → TV & display options**

| Setting | Value | Why |
|---|---|---|
| Resolution | **4K UHD** | Native panel resolution. See the inversion above |
| Refresh rate | **120 Hz** | Unlocks Performance modes, 40 fps modes, and the VRR window |
| Color depth | **30-bit (10-bit)** | Required for proper HDR. You have the bandwidth |
| Color space | **Standard (Recommended)** | Limited range, which is what the monitor expects over HDMI |

### Do not select 1440p

The Xbox offers 1440p, and on this monitor it is a trap: **the AW3225QF does not accept 1440p at
120 Hz from a console.** Selecting it drops you to 60 Hz. There is no firmware fix — it is a
hardware limitation of the scaler.

So the choice is 4K at 120 Hz, or a mistake. Pick 4K.

## 3. Video modes

**TV & display options → Video modes.** Enable:

- [x] **Allow 4K**
- [x] **Allow HDR10**
- [x] **Allow Dolby Vision** — see §5
- [x] **Allow Auto Low-Latency Mode (ALLM)** — the monitor supports it; it switches to low-latency
      automatically on game launch
- [x] **Allow Variable Refresh Rate** — the thing the dock stole from the Ally. You get it here
- [ ] **Allow YCC 4:2:2** — **turn this OFF**

That last one is counterintuitive and is on by default. YCC 4:2:2 is a *chroma-subsampled* fallback
for displays without the bandwidth for full 4:4:4 at 4K120. You have 48 Gbps. Leaving it enabled
lets the console negotiate down to 4:2:2, which softens fine detail and coloured text for no gain.
Turn it off and you stay on RGB / 4:4:4.

## 4. Frame rate, and the 40 fps principle

This is where the Ally reasoning transfers cleanly.

The Ally doc explains why a 40 fps cap needs a 120 Hz panel: at 60 Hz, 40 fps means 1.5 refreshes
per frame — a visible 1-2-1-2 judder — so the only cleanly paced caps at 60 Hz are 30 and 60. At
120 Hz, 40 fps is exactly 3 refreshes per frame and paces perfectly.

**The same maths is why you set the Xbox to 120 Hz even for 30 and 60 fps games.** Console games
increasingly ship a 40 fps mode, and the Xbox only exposes those modes when the display is running
at 120 Hz. You are not committing to rendering 120 fps — you are buying the refresh window that
makes every other cap land cleanly.

With VRR on, the pacing question mostly disappears anyway. VRR over HDMI on this panel runs roughly
**48–120 Hz**, with low framerate compensation doubling frames below that. A 30 fps title is driven
at 60 Hz; a 40 fps title at 80 Hz. This is the same LFC behaviour the Ally doc describes on the
internal panel — it just actually works here.

In-game, prefer the developer's **Performance / 120 Hz mode** for anything twitchy and **Quality**
for slower single-player titles. On back-compat titles, check **FPS Boost** in the game's
Compatibility Options.

## 5. HDR, Dolby Vision, and calibration

### Monitor OSD

Using the joystick under the bottom bezel:

- Set the Xbox's input to **Console Mode**. This is the AW3225QF's source-based tone mapping path —
  it hands tone mapping to the console rather than doing it in the monitor, which is what you want
  when the console has been calibrated to the panel.
- Enable **VRR / Adaptive-Sync** for that input.
- Leave response time on the default. OLED pixel transitions are ~0.03 ms; there is no overdrive
  setting worth tuning.

### Dolby Vision

This monitor was the first gaming monitor to ship Dolby Vision, and the Series X supports Dolby
Vision for gaming. On paper it is an ideal pairing, and for DV-enabled titles it is a genuine
upgrade over HDR10's static metadata.

**Test it rather than assuming it.** DV gaming implementations have historically been the place
where 120 Hz or VRR quietly drops out. Turn it on, then go back and confirm the Xbox still reports
**4K, 120 Hz, VRR active**.

If enabling Dolby Vision costs you 120 Hz or VRR, **turn it back off**. HDR10 at 120 Hz with VRR
beats Dolby Vision at 60 Hz without it, every time. Non-DV titles are unaffected either way — they
run HDR10 regardless.

### Run the calibration app

Install **Xbox HDR Calibration** (free, in the Store) and run it. It is not optional — without it
the console is guessing at the panel's peak brightness and will either clip highlights or leave the
image flat.

Two rules:

1. Run it **in the exact mode you will play in** — HDR on, Console Mode selected, Dolby Vision in
   whatever state you settled on above.
2. **Re-run it** if you change the monitor's preset or input afterwards. The calibration is tied to
   the panel behaviour it measured.

### A known QD-OLED trait

This panel has well-documented **VRR flicker in dark scenes and on loading screens** — brightness
wobble during rapid framerate swings. It is characteristic of QD-OLED and not a fault with your
unit. If it bothers you more than tearing does, the fix is to turn VRR off; there is no setting that
gives you both.

## 6. Audio — plan this before you set it up

**The AW3225QF has no built-in speakers and no 3.5 mm headphone jack.** Its only audio output is
**HDMI eARC**. Plugging the Xbox in and expecting sound will not work.

Three options, in order of effort:

| Option | How | Notes |
|---|---|---|
| **Controller headset** | 3.5 mm jack on the Xbox controller, or a USB/wireless headset | Zero extra hardware. Fine for solo play |
| **eARC soundbar / receiver** | Audio device on the monitor's **eARC** HDMI port, Xbox on the other | Proper solution. Set Xbox audio output to bitstream |
| **Xbox → AVR → monitor** | Receiver in the middle | Only if the AVR is genuinely HDMI 2.1 4K120 passthrough. Otherwise this recreates the dock problem |

> **Open question from the Ally work.** `ally-x-tdp-reference.md` records that *"audio does route to
> the TV through the dock"* and uses that as weak evidence about EDID survival. If this display is
> an AW3225QF, it has no speakers, so that audio was going somewhere else — a headset, an eARC
> device, or a different display entirely. Worth resolving, because that observation was doing work
> in the dock diagnosis.

## 7. OLED panel care

This matters far more than it did on the Ally's IPS panel, and the Xbox is a worse offender than a
handheld: a console sits on a static dashboard, and game HUDs are fixed bright elements held in the
same pixels for hundreds of hours.

**On the monitor** — *OSD → Others → OLED Panel Maintenance*:

- **Pixel Refresh** — runs automatically every 4 hours of use, takes 6–8 minutes. The power LED
  blinks green while it runs.
- **Panel Refresh** — the long cycle, at 7000 hours.

**The rule that protects these:** let the refresh cycles finish. Do not cut power at the wall or a
switched power strip while the LED is blinking — put the monitor to sleep instead. An interrupted
refresh cycle is the most common way people undermine the protection they already have.

**On the Xbox** — *Settings → General → Power options*:

- Set **Turn off display after** to 10 or 15 minutes. The dashboard is static, bright, and
  permanently visible otherwise.
- Consider putting the console to sleep rather than leaving the dashboard up between sessions.

Also worth doing: run HDR games at the calibrated level rather than pushing brightness to maximum,
and do not leave a paused game with a full-screen HUD on for hours.

---

## Quick reference

| Setting | Where | Value |
|---|---|---|
| Resolution | Xbox → TV & display | 4K UHD |
| Refresh rate | Xbox → TV & display | 120 Hz |
| Color depth | Xbox → TV & display | 30-bit (10-bit) |
| Color space | Xbox → TV & display | Standard |
| Allow 4K / HDR10 / DV / ALLM / VRR | Xbox → Video modes | On |
| Allow YCC 4:2:2 | Xbox → Video modes | **Off** |
| 1440p | anywhere | **Never** — costs you 120 Hz |
| Preset | Monitor OSD | Console Mode |
| VRR / Adaptive-Sync | Monitor OSD | On |
| HDR calibration | Xbox HDR Calibration app | Run once, in final display mode |
| Turn off display after | Xbox → Power options | 10–15 min |

---

## Troubleshooting

| Symptom | Check first |
|---|---|
| No 120 Hz option | Cable (use the Xbox's own), then confirm nothing is in the middle of the link |
| Stuck at 60 Hz | Resolution set to 1440p — this monitor won't do 1440p120 from a console |
| Text and edges look soft | "Allow YCC 4:2:2" is on; turn it off to get RGB 4:4:4 |
| HDR looks washed out or flat | Calibration app not run, or run in a different monitor preset |
| 120 Hz or VRR disappeared | Dolby Vision. Disable it and re-check |
| Brightness wobbles in dark scenes | QD-OLED VRR flicker. Expected. Disable VRR if intolerable |
| No sound at all | The monitor has no speakers. See §6 |
| Black levels crushed or grey | Color space mismatch — try the other of Standard / PC RGB |

---

## Done when

- [ ] Xbox connected direct to HDMI with the Ultra High Speed cable, nothing in between
- [ ] 4K / 120 Hz / 10-bit confirmed in TV & display options
- [ ] VRR and ALLM confirmed active, not just enabled
- [ ] YCC 4:2:2 disabled
- [ ] Dolby Vision tested, and a deliberate keep-or-drop decision made
- [ ] HDR calibration app run in the final display mode
- [ ] Monitor set to Console Mode
- [ ] Audio path chosen and working
- [ ] Display sleep timer set, and the power-strip rule understood
- [ ] Monitor model confirmed from the OSD, not inferred
