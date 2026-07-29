# ROG Ally X — Optimization Guide (Windows 11 + Steam)

A device-specific runbook for turning a stock **ASUS ROG Ally X (2024)** into a tuned handheld and
docked console. Follow the phases in order — later phases assume earlier ones are done.

## Your device

| | |
|---|---|
| **Model** | ROG Ally X (2024), model `RC72LA` — the black one |
| **APU** | AMD Ryzen Z1 Extreme — Zen 4, 8 cores / 16 threads, RDNA 3 iGPU with 12 CUs |
| **Memory** | 24 GB LPDDR5X-7500 (soldered) |
| **Storage** | 1 TB M.2 **2280** NVMe (the original Ally used the smaller 2230) |
| **Display** | 7" 1920×1080 IPS, 120 Hz, VRR / FreeSync Premium, ~500 nits |
| **Battery** | 80 Wh — double the original Ally's 40 Wh |
| **Ports** | USB4 Type-C (DisplayPort alt mode + PD), USB 3.2 Gen 2 Type-C (DP alt mode + PD), microSD UHS-II, 3.5 mm combo |
| **Charger in box** | 65 W |

Two Ally X details worth knowing up front, because they change advice you'll find online:

- **The microSD reader was relocated** away from the exhaust vent. The original Ally's infamous
  card-cooking problem does **not** apply to your device. microSD is a legitimate storage tier here.
- **The proprietary XG Mobile connector is gone**, replaced by a standard **USB4** port. That's why
  Phase 8 tells you to dock through USB4 — it's the fastest and most capable port on the device.

## Scope

- **Windows 11 only.** No dual-boot, no SteamOS/Bazzite. Steam is the primary launcher.
- **Software, settings, and external accessories only.** Nothing here opens the chassis. No repaste,
  no undervolting, no SSD swap. Nothing in this guide voids your warranty.
- Targets **both** use cases: handheld on battery, and docked to a TV/monitor.

## Order of operations

| Phase | File | Time | Why it's here |
|---|---|---|---|
| 1 | [Baseline](01-baseline.md) | 30 min | Measure before you change anything, or you'll never know if this worked |
| 2 | [Firmware & drivers](02-firmware-and-drivers.md) | 45 min | Fixes ASUS already shipped that you may not have |
| 3 | [Windows tuning](03-windows-tuning.md) | 1 hr | Where your frame rate and idle drain actually come from |
| 4 | [Sleep & battery](04-sleep-and-battery.md) | 30 min | The bag-drain problem. Most-skipped, most-felt |
| 5 | [Armoury Crate profiles](05-armoury-crate-profiles.md) | 45 min | The core of the setup — four profiles, not three |
| 6 | [Steam setup](06-steam-setup.md) | 45 min | Controller profiles, launch options, cloud sync |
| 7 | [Display & upscaling](07-display-and-upscaling.md) | 30 min | Getting playable frame rates out of 12 CUs |
| 8 | [Docked mode](08-docked-mode.md) | 1 hr | Dock, cable, and charger choices that actually matter |
| 9 | [Storage & library](09-storage-and-library.md) | 30 min | Where games live |
| 10 | [Accessories](10-accessories.md) | — | What to buy, and what to skip |
| 11 | [Validation](11-validation.md) | 1 hr | Prove it worked |

You can stop after Phase 5 and have captured most of the benefit. Phases 6–10 are refinement.

## A note on expectations

The Z1 Extreme is a 12-CU integrated GPU in a 7" chassis running between 10 and 30 watts. Tuning
gets you meaningful gains — better frame pacing, longer sessions, quieter operation, and a device
that stops feeling like a laptop wearing a controller. It does not turn it into a desktop. The
single largest performance lever available to you is **choosing sensible in-game settings and
resolution** (Phase 7), not any registry tweak.

Treat any guide promising "double your FPS with this one setting" with suspicion, including the
parts of this one that sound too good — which is why Phase 11 has you measure.

## Appendix: running Claude Code on the Ally X

Occasionally useful once you're set up, mainly for **verification rather than trust** — PowerShell
audits of what's actually running at startup, the real registry values behind VBS and HAGS, and
parsing `powercfg /batteryreport` and HWiNFO logs into your Phase 11 results table.

It can't help with BIOS/MCU updates, and **Armoury Crate SE is GUI-only with no scriptable
interface**, so Phase 5 is manual regardless. Realistically only comfortable docked with a keyboard
attached.
