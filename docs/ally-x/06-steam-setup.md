# Phase 6 — Steam setup

**Time:** ~45 minutes
**Risk:** none
**You'll need:** Steam installed and signed in

Steam is your primary launcher, so it's worth configuring properly rather than just installing and
hoping. Most of the value here is in **Steam Input** — the controller layer — which is the single
most underused feature on Windows handhelds.

---

## 1. Big Picture and the shell

If you went with the **Xbox Full Screen Experience** in Phase 3, your Steam games appear in the FSE
library automatically and launch from there. You don't need Big Picture as your shell, but it's
still worth having for store browsing and settings with a controller.

If you skipped FSE, set Steam to do the job:

**Steam → Settings → Interface →** enable *Start Steam in Big Picture Mode*, and add Steam to
startup.

Either way: **Steam → Settings → Interface → Start Steam minimized** when using FSE as your shell,
so you don't get two competing full-screen UIs fighting on boot.

## 2. Steam Input — controller profiles

Steam Input sits between the Ally X's controller and the game, letting you remap anything per-title.
The Ally X reports as an Xbox controller by default, which works but wastes the hardware.

**Steam → Settings → Controller →** enable Steam Input for the controller types you use.

### Rear buttons (M1 / M2)

You left these unmapped in Phase 5 so Steam could handle them per-game. This is where they earn
their place — they're reachable without lifting your thumbs off the sticks.

Good defaults by genre:

- **Shooters:** M1 → crouch/slide, M2 → melee or grenade
- **Action/soulslike:** M1 → dodge/roll, M2 → item use
- **Racing:** M1 → look behind, M2 → handbrake
- **Anything with menus:** M1 → map, M2 → quick save

### Gyro aiming

The Ally X has a gyroscope and most people never turn it on. Used as **fine aim on top of the right
stick** — not as a replacement for it — it meaningfully improves precision in shooters.

Recommended starting configuration:

- **Gyro Behavior:** *As Mouse*
- **Gyro Activation:** *On Right Stick Touch* — gyro only engages when your thumb is on the stick,
  so the device doesn't fight you when you shift grip
- **Sensitivity:** start low and raise it. Too high is unusable and puts people off the feature
  permanently

Give it a couple of hours before judging. It feels wrong for about twenty minutes and then feels
obvious.

### Two profiles per game

Since you play both handheld and docked, set up **two configurations** for anything you play in both
contexts — Steam lets you switch between saved configs from the in-game overlay. Docked with a
proper controller you may not want gyro at all, and stick response often wants different curves on a
big screen.

## 3. Per-game launch options

Right-click a game **→ Properties → General → Launch Options**. Most games need nothing. The ones
worth knowing:

| Option | What it does |
|---|---|
| `-dx11` / `-dx12` / `-vulkan` | Force a renderer. On RDNA 3, **Vulkan or DX12 is usually faster** where a game offers both — worth testing per title |
| `-fullscreen` | Forces exclusive fullscreen, which avoids compositor overhead |
| `-novid` | Skips intro videos (Source games and others) |
| `-high` | Higher process priority. Occasionally helps, occasionally hurts — measure |

Don't paste launch options you found online without knowing what they do. Many are cargo-culted from
other hardware and several are actively counterproductive on an APU.

## 4. Shader pre-caching

**Steam → Settings → Downloads → Shader Pre-Caching: On**, with *Allow background processing of
Vulkan shaders* enabled.

Pre-compiled shaders reduce the first-run stutter that plagues DX12 and Vulkan titles. It costs some
disk space and background CPU time while downloading — well worth it.

Do the background processing **plugged in**. It's a genuine power draw and there's no reason to
spend battery on it.

## 5. Downloads

**Steam → Settings → Downloads:**

- **Download region:** verify it matches where you actually are. A wrong region is a common cause of
  slow downloads.
- **Limit bandwidth while streaming:** on.
- **Throttle downloads while running games:** on. Downloads compete for CPU and I/O, and a
  background update is a real frame-rate cost on a handheld.
- **Auto-update:** consider setting games to *Only update when I launch* rather than always. Stops
  the device waking to download 40 GB you didn't ask for — which also helps the Phase 4 standby
  work.

## 6. Cloud saves

**Steam → Settings → Cloud → Enable Steam Cloud: On.**

Since you switch between handheld and docked on the same device this matters less than for
multi-device users — but verify it per-game for anything you care about. Not every title supports
it, and finding out after losing a save is the wrong time.

## 7. Library folders

You'll set up the microSD as a second library location in Phase 9. Create the folder now so it's
ready:

**Steam → Settings → Storage → +** and add the microSD.

From that same screen you can **move installed games between drives** without re-downloading — select
a game, use the *Move* action. Far better than uninstall-and-reinstall.

## 8. In-game overlay

**Steam → Settings → In Game → Enable the Steam Overlay: On.** You need it for switching controller
configs mid-game and for the performance overlay.

Steam's built-in performance overlay (**Settings → In Game → Performance Overlay**) is lighter than
Armoury Crate's and enough for quick checks. Use Armoury Crate's or HWiNFO for the detailed
measurements in Phase 11.

---

## Done when

- [ ] Steam and your chosen shell coexisting without fighting at boot
- [ ] Steam Input enabled
- [ ] M1/M2 mapped for your main games
- [ ] Gyro configured (give it a real trial)
- [ ] Separate handheld and docked configs for dual-context games
- [ ] Shader pre-caching on
- [ ] Download throttling configured
- [ ] Cloud saves verified for games you care about

→ Next: [Phase 7 — Display & upscaling](07-display-and-upscaling.md)
