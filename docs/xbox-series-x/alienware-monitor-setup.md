# Xbox Series X on the Alienware AW3225DM

**Time:** ~30 minutes
**Risk:** none
**You'll need:** the Ultra High Speed HDMI cable from the Xbox box

Companion to the [ROG Ally X TDP reference](../../ally-x-tdp-reference.md), which documented the same
monitor from the handheld's side — and **misidentified it**. See
[Monitor identification](#monitor-identification) before trusting anything that document says about
the display.

---

## Your hardware

Read from the monitor's OSD (*Others → Display Info*), not inferred:

| | |
|---|---|
| **Model** | Alienware **AW3225DM** — firmware `M2C102` |
| **Panel** | 31.5" curved **VA**, 1500R |
| **Native resolution** | **2560 × 1440** (QHD) — *not* 4K |
| **Refresh** | 180 Hz over DisplayPort 1.4 · **144 Hz max over HDMI** |
| **HDMI** | 2 × **HDMI 2.1 TMDS** with VRR — ~18 Gbps, **not** 48 Gbps FRL |
| **HDR** | DisplayHDR 400, no local dimming, 95 % DCI-P3 |
| **Audio** | **None.** No speakers, no 3.5 mm jack, no eARC |
| **Other ports** | 1 × DP 1.4 (HBR3), USB-B upstream, 2 × USB-A downstream |

### Monitor identification

The Ally reference records this display as an *"Alienware 32" curved, 3840×2160 — most likely the
AW3225QF"*. **Both halves of that are wrong.** The OSD reports AW3225DM, and the panel is 1440p.

The 4K desktop that observation was based on is better explained by the dock: a DisplayLink-class
dock **synthesises its own EDID**, commonly advertising a 4K60 mode the real panel does not have,
capping every resolution at 60 Hz, and presenting its own audio device. That single cause accounts
for the fake 3840×2160, the `59, 60` list at *every* resolution including 1080p, and the audio
routing — all three pieces of evidence at once. The prior session's dock diagnosis was right; this
strengthens it.

---

## The constraint that drives everything: TMDS, not FRL

Display Info reports `HDMI 2.1 TMDS (VRR)`. That wording matters more than the "2.1" does.

HDMI 2.1 permits two signalling schemes. **FRL** is the 48 Gbps one people mean when they say
"HDMI 2.1". **TMDS** is the older ~18 Gbps scheme — HDMI 2.0 bandwidth, carrying some 2.1 features
like VRR. Your ports are TMDS.

Approximate cost of each mode over an 18 Gbps ceiling:

| Mode | Bandwidth | Fits? |
|---|---|---|
| 1440p120, 8-bit RGB | ~14.1 Gbps | Comfortably |
| 1440p120, 10-bit RGB | ~17.6 Gbps | **Barely** |
| 4K60, 8-bit RGB | ~16.7 Gbps | Yes, but see below |
| 4K120 anything | far over | **No** |

Two consequences: 4K120 is physically impossible on this link, and 10-bit at 1440p120 sits right on
the edge. Everything below follows from that.

---

## What carries over from the Ally work

| From the Ally reference | Applies here? | Why |
|---|---|---|
| Monitor capped at 59/60 Hz | **No** | That was the dock. Direct HDMI gives you 120 Hz |
| VRR unavailable | **No** | Same cause. VRR works direct |
| Protect refresh rate over resolution | **Yes** | The core lesson, and it decides §1 |
| Cable quality is not a detail | **Yes** | Still true |
| Render 1080p, integer-scale to 4K | **No — the panel isn't 4K** | Irrelevant on a 1440p display |
| TDP profiles, FSR, render targets | **No** | No console equivalent |

---

## 1. Resolution — take 1440p, refuse 4K

The Xbox offers 4K. **Selecting it drops you to 60 Hz.** Don't.

- Your panel is 2560 × 1440. A 4K signal is downscaled by the monitor's scaler to 1440p regardless —
  you pay full 4K rendering cost for detail the panel physically cannot display.
- You halve your refresh rate, losing every 120 fps Performance mode and any 40 fps mode.
- The console renders 2.25× the pixels to get there.

There is a theoretical supersampling argument for 4K → 1440p downscaling. A budget VA monitor's
scaler is not the place to cash it in, and it costs half your refresh rate to find out.

> **Note the symmetry.** On the AW3225QF this guide originally targeted, *1440p* was the setting that
> silently cost you 120 Hz. On the AW3225DM it's *4K*. Same rule underneath: match the panel's native
> resolution, and protect refresh rate.

### Untick `Allow 4K` — the resolution setting alone does not hold

**Verified on this setup.** With the dashboard set to 1440p / 120 Hz and `Allow 4K` ticked, launching
a game switched the output to `2160p 36-BIT`. The console overrode the dashboard resolution on its
own, the monitor downscaled 4K back to its native 1440p, and the 120 Hz the dashboard had been
running was gone.

The `36-BIT` is the tell. 12 bits per channel at 4K cannot fit an 18 Gbps TMDS link as RGB, so the
console reached for `Allow YCC 4:2:2` to make it fit. The result is four costs and no benefit:
2.25× the rendering work, subsampled chroma, every extra pixel discarded in the scaler, and the
refresh rate halved.

**Video modes → untick `Allow 4K`.** The resolution picker sets a preference; the capability flag is
what games actually negotiate against. Nothing is lost — the panel cannot display 4K, and streaming
apps will serve 1440p or lower to a display that doesn't claim it.

Re-check Display Info **inside a game**, not on the dashboard. The dashboard will happily report a
mode that games then override.

## 2. Refresh rate — 120 Hz

**Settings → General → TV & display options → Refresh rate: 120 Hz**

The Xbox offers only 60 and 120. The monitor's 144 Hz is reachable from a PC over DisplayPort and
never from a console — nothing is being left on the table.

120 Hz is what unlocks games' 120 fps Performance modes, any 40 fps modes, and gives VRR a usable
window. This is the one setting from the Ally work that transfers without modification.

## 3. Color depth and color space

**TV & display options → Video fidelity & overscan**

| Setting | Value |
|---|---|
| Color depth | **30 bits per pixel (10-bit)** |
| Color space | **Standard (Recommended)** |

Set 30-bit as a ceiling, not a promise. **In SDR the console outputs 8-bit regardless**, so Display
Info will read `24-BIT` on the dashboard even with 30-bit selected. That is expected and not a
fallback. The setting only takes effect when an HDR signal is actually running — which, per the
table above, is where the link gets tight.

Keep color space on **Standard**. `PC RGB` is full-range and requires the display to be set to match;
Standard is what the monitor expects from a console over HDMI.

### `Allow YCC 4:2:2` — leave it ticked here

The opposite of the advice for a full-bandwidth panel, and for a specific reason: 4:2:2 halves chroma
bandwidth, which is the difference between 10-bit HDR at 1440p120 fitting and not fitting. On an
18 Gbps link it is a genuine safety valve, not waste.

The cost is softened fine detail and coloured text. If you settle on SDR (§5), untick it — 8-bit RGB
has bandwidth to spare and you'd be paying the chroma penalty for nothing.

**Untick `Allow 4K` first, though.** While 4K is permitted, 4:2:2 is what lets the console negotiate
a 4K mode that would otherwise be impossible on this link — the safety valve becomes the enabler of
the exact mode you don't want.

## 4. VRR and ALLM

**Variable refresh rate: on.** The Xbox dropdown offers *Off*, *Gaming only*, *Always On*.

**Prefer `Gaming only`.** VA panels are prone to VRR flicker — brightness wobble when frame rate
swings, worst in dark scenes. `Always On` extends VRR to the dashboard, menus, and video apps, where
frame rates are fixed and VRR buys nothing but the flicker risk remains. If you see no flicker at
all, `Always On` costs nothing to go back to.

**There is no FreeSync or Adaptive-Sync toggle in this monitor's OSD.** It is always enabled and
negotiated automatically. Two confirmations that it is live:

- Display Info reads `MONITOR CAPABILITY: HDMI 2.1 TMDS (VRR)`
- The Xbox's VRR dropdown is selectable rather than greyed out — the console greys it when the
  display doesn't advertise VRR

To verify end to end: run a game with a variable frame rate and open Display Info. `STREAM INFO`
reads `-` on the SDR dashboard; it should populate under an active VRR game.

### ALLM is greyed out, and that's fine

`Allow auto low-latency mode` is unavailable — the monitor doesn't advertise ALLM.

**Ignore it.** ALLM exists to make a *TV* bypass its picture-processing pipeline. A 1 ms gaming
monitor has no such pipeline to escape; it is already in its low-latency state. The practical cost of
not having ALLM here is close to zero. Don't spend time on it, and don't buy anything to fix it.

## 5. HDR — set expectations first

`Allow HDR10` and `Auto HDR` are available. Before switching them on, know what the panel can do.

**DisplayHDR 400 is the entry tier**: ~400 nits peak and **no local dimming requirement**. HDR
highlights cannot meaningfully exceed SDR brightness because there is no brightness headroom to
give them. VA's strong native contrast (far better than IPS) helps more than the certification
suggests, but this is not an HDR display in the sense the marketing implies.

**Treat HDR as a test, not a default.** Enable `Allow HDR10`, then judge honestly against SDR:
raised blacks, dim highlights, or a flat washed look mean SDR is winning — which is a common and
legitimate outcome on this panel tier.

`Auto HDR` synthesises HDR for SDR-only games. It inherits every limitation above and adds
inference. Evaluate it separately from HDR10, and be willing to leave it off.

**Dolby Vision: leave both entries unticked.** This panel does not support it.

### If you keep HDR on

Run the **Xbox HDR Calibration** app (free, in the Store), in the exact monitor preset you'll play
in, and re-run it if you change presets. Then re-check Display Info: you want `30-BIT` at `120Hz`.
If refresh dropped to 60, the link couldn't carry it — keep `Allow YCC 4:2:2` ticked, or drop HDR.

## 6. Monitor OSD

Defaults as shipped are not what you want.

| Setting | Found at | Set to | Why |
|---|---|---|---|
| **Preset modes** | `MOBA/RTS` | **Standard** | Genre presets push saturation and edge enhancement, clipping highlight and shadow detail |
| **Response time** | `SUPER FAST` | **Fast** | On VA, max overdrive overshoots — bright halos and inverse ghosting behind moving objects |
| **Sharpness** | `30` | **50** | Native-resolution signal wants neutral: no edge enhancement, no softening |
| **Console mode** | `OFF` | **Try On** | Adjusts colour handling for console sources. A/B it; a wash means leave it off |
| **Input color format** | `RGB` | **RGB** | Already correct |
| **Smart HDR** | `GAME HDR` | leave | Only matters if §5 lands on HDR |
| **Dark stabilizer** | `0` | **0** | Raising it lifts blacks and throws away VA's best trait |
| **Game enhance mode** | `OFF` | **OFF** | Crosshair and timer overlays |

Response time is worth A/B-ing yourself: find fast horizontal motion and watch the trailing edge of
high-contrast objects. Bright trails mean the overdrive is overshooting; step it down.

## 7. Audio — there is none, by design

**The AW3225DM has no speakers, no 3.5 mm jack, and no eARC.** No cable or setting produces sound
from this monitor. Silence after connecting the Xbox is correct behaviour, not a fault.

The Series X also has no 3.5 mm or optical output of its own, so audio must come off the console
directly:

| Option | How | Notes |
|---|---|---|
| **Controller headset** | 3.5 mm jack on the Xbox controller | Zero extra hardware. The default answer |
| **USB / Xbox Wireless headset** | Straight to the console | Wireless without Bluetooth, which the Xbox doesn't do for audio |
| **HDMI audio extractor** | Between Xbox and monitor | Works, but it is a box in the video path — it must pass 1440p120 with VRR intact, or you have recreated the dock problem |

Prefer the first two. The whole reason the Ally's display chain went wrong was a device sitting in
the middle of the HDMI link.

## 8. Panel care — nothing to do

This is a **VA** panel. There is no burn-in risk, no image retention, no pixel-refresh cycle, and no
power-strip rule. The OLED maintenance advice that applies to the AW3225QF does not apply to you.

Set a sensible display-sleep timer under *Settings → General → Power options* for the electricity,
and otherwise ignore this topic entirely.

---

## Quick reference

| Setting | Where | Value |
|---|---|---|
| Resolution | Xbox → TV & display | **1440p** |
| Refresh rate | Xbox → TV & display | **120 Hz** |
| Allow 4K | Video modes | **Untick** — games override the resolution picker otherwise |
| Color depth | Video fidelity & overscan | 30-bit (10-bit) |
| Color space | Video fidelity & overscan | Standard |
| Allow YCC 4:2:2 | Video modes | **On** if HDR, off if SDR |
| Variable refresh rate | Video modes | Gaming only |
| Allow auto low-latency mode | Video modes | Unavailable — ignore |
| Allow Dolby Vision / DV for Gaming | Video modes | **Off** — unsupported |
| Allow HDR10 / Auto HDR | Video modes | Test, then decide |
| Preset modes | Monitor OSD | Standard |
| Response time | Monitor OSD | Fast |
| Sharpness | Monitor OSD | 50 |
| Audio | — | Off the console, not the monitor |

---

## Troubleshooting

| Symptom | Check first |
|---|---|
| Drops to 4K when a game launches | `Allow 4K` still ticked. The resolution picker alone won't stop it |
| Stuck at 60 Hz | Resolution set to 4K, or `Allow 4K` still ticked |
| No 120 Hz option | Cable — use the Xbox's own; then confirm nothing sits in the HDMI path |
| Display Info says `24-BIT` with 30-bit selected | Expected in SDR. Only HDR content drives 10-bit |
| Refresh drops to 60 when HDR turns on | Link is over-subscribed. Keep `Allow YCC 4:2:2` ticked |
| Text and edges look soft | 4:2:2 is active. Untick it if you're running SDR |
| Brightness wobbles in dark scenes | VA VRR flicker. Try `Gaming only`, or VRR off |
| Bright trails behind moving objects | Response time overdrive overshooting. Step down from Super Fast |
| HDR looks washed out or flat | DisplayHDR 400 with no local dimming. SDR may genuinely be better |
| ALLM greyed out | Expected, and near-irrelevant on a gaming monitor. Ignore |
| No sound | The monitor has no audio output of any kind. See §7 |

---

## Done when

- [x] Model confirmed from the OSD — AW3225DM, not inferred
- [x] Xbox direct to HDMI 1, nothing in the path
- [x] 1440p at 120 Hz confirmed in Display Info
- [x] Color depth 30-bit, color space Standard
- [x] VRR confirmed available (monitor advertises it, Xbox offers it)
- [x] ALLM understood as unavailable and not worth chasing
- [x] Dolby Vision left off
- [ ] `Allow 4K` unticked, and a game re-checked in Display Info for 1440p at 120 Hz
- [ ] VRR confirmed end-to-end via `STREAM INFO` under a running game
- [ ] VRR set to `Gaming only` and flicker assessed
- [ ] Monitor preset, response time and sharpness corrected
- [ ] HDR10 and Auto HDR tested against SDR, and a decision made
- [ ] `Allow YCC 4:2:2` settled once the HDR decision is made
- [ ] Audio path chosen

The unchecked items are live work, not omissions — they need judgement calls made in front of the
panel rather than values that can be looked up.
