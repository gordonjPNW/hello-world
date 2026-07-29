# Phase 7 — Display and upscaling

**Time:** ~30 minutes, plus per-game tuning
**Risk:** none
**You'll need:** VRR enabled from Phase 3

**This phase contains the largest performance lever you have.** No registry tweak, driver swap, or
TDP profile comes close to the effect of choosing a sensible render resolution and frame rate
target. The Z1 Extreme is a 12-CU GPU running at 15–30 W; asking it for native 1080p Ultra is asking
the wrong question.

The strategy: **render low, upscale smart, cap the frame rate.**

---

## Handheld

### Resolution

The panel is 1080p, but you should rarely render at it.

| Game type | Render at | Notes |
|---|---|---|
| Modern AAA | **1280×720** | With FSR Quality this looks far better than it sounds at 7" |
| Mid-weight / older AAA | **1600×900** | The sweet spot for most of your library |
| Indie, 2D, older titles | **1920×1080** | These aren't GPU-bound; use the native panel |

At seven inches, 900p with good upscaling is genuinely hard to distinguish from native. The frame
rate difference is not subtle.

Set this **in-game** where possible rather than changing the Windows display resolution — games
handle their own scaling better, and it avoids leaving the desktop in a weird state.

### Cap your frame rate

The most impactful battery setting on the device, and it's counterintuitive: **a capped 40 fps often
beats an uncapped 55 fps** — smoother frame pacing, lower power draw, longer session, and less fan
noise.

With VRR on the 120 Hz panel, these caps are all clean:

- **30 fps** — heavy AAA, maximum runtime
- **40 fps** — the handheld sweet spot. Noticeably smoother than 30, far cheaper than 60
- **60 fps** — action games and shooters where responsiveness matters
- **90/120 fps** — 2D, indie, competitive titles that can actually reach it

Set the cap in Armoury Crate's FPS limiter (bindable to Command Center from Phase 5), or in-game.
Uncapped is almost always the wrong choice on battery — the GPU burns power producing frames the
panel and your eyes don't benefit from.

### Settings that cost the most

When you need frames, cut these first — they're expensive and least visible on a 7" screen:

1. **Shadows** — usually the single most expensive setting. Medium is nearly always enough
2. **Ray tracing** — off. The Z1 Extreme cannot afford it, whatever the menu implies
3. **Volumetric fog / clouds** — very expensive, barely noticeable handheld
4. **Ambient occlusion** — drop to medium or off
5. **Anti-aliasing** — upscaling handles most of this; don't stack heavy AA on top

Keep **texture quality high** — with 24 GB of shared memory you have VRAM to spare, and textures are
the setting you actually see.

## Upscaling: which one, when

### FSR (FidelityFX Super Resolution) — your default

In-game FSR, where offered. It has access to motion vectors and depth data, so it produces a
noticeably better image than driver-level scaling.

- **Quality** — use this. Best balance
- **Balanced** — when Quality isn't enough
- **Performance** — visible degradation at this screen size; last resort
- **FSR 3** where available — better image and optional frame generation

### RSR (Radeon Super Resolution) — the fallback

Driver-level, in AMD Software. Works with **any** game, including ones with no FSR support — set the
game to a lower resolution and RSR scales it to the panel.

Lower quality than in-game FSR because it's working on the final image without game data. Use it
only where FSR isn't offered.

### AFMF 2 — driver frame generation

AMD Fluid Motion Frames 2, in AMD Software. Inserts generated frames between real ones. It can
roughly double apparent smoothness.

**Worth it for:** single-player, slower-paced titles already running 40+ fps, where visual smoothness
is the goal.

**Not worth it for:** anything competitive, anything twitchy, or anything already below ~40 fps.
Frame generation **adds input latency** and does not make a game more responsive — it makes it *look*
smoother while feeling the same or slightly worse. Below 40 fps the artifacts become obvious and the
latency becomes a real problem.

Requires the generic AMD Adrenalin driver (Phase 2, Option B) if the ASUS build is behind.

### Other AMD Software settings

- **Radeon Image Sharpening (RIS): On.** Nearly free, and counteracts upscaling softness. Around
  70–80 % strength is a good starting point
- **Radeon Anti-Lag: On.** Reduces input latency, most useful in GPU-bound scenarios — which is most
  of them here
- **Radeon Chill:** optional. Dynamically drops frame rate when the on-screen image is static. Real
  battery savings in slower games; can feel inconsistent in fast ones
- **Radeon Boost:** skip it. It lowers resolution dynamically during motion and the flickering is
  distracting at handheld distances

## Docked

Different rules — you have more power budget but a much larger screen that hides less.

**Output 1080p to the TV, not 4K.** The Z1 Extreme has no business rendering 4K, and your TV's
scaler is better at upscaling 1080p than the GPU is at rendering a quarter-rate 4K image. Set the
Windows display output to 1080p at the highest refresh rate the dock and cable support (Phase 8).

Exceptions where 4K output is fine: 2D games, older titles, emulation, and anything running
comfortably above 60 fps at 1080p already.

Docked targets:

- **Render 1080p, output 1080p** at 30 W — most AAA, targeting 60 fps
- **Render 900p + FSR to 1080p** for demanding titles
- **1440p or 4K output** for light games that can genuinely reach it

Frame generation is a better fit docked than handheld — larger screen, usually a couch controller,
usually slower-paced games. Still not for competitive shooters.

---

## Quick reference

| Context | Render | Output | Cap | Upscaling |
|---|---|---|---|---|
| Handheld, heavy AAA | 720p | 1080p | 30–40 | FSR Quality |
| Handheld, standard | 900p | 1080p | 40–60 | FSR Quality |
| Handheld, light/indie | 1080p | 1080p | 60–120 | Off |
| Docked, AAA | 900p–1080p | 1080p | 60 | FSR Quality |
| Docked, light | 1080p+ | 1080p–4K | 60+ | Off |

---

## Done when

- [ ] VRR confirmed working
- [ ] Frame rate cap bound to Command Center
- [ ] Per-game resolution targets set for your regulars
- [ ] RIS and Anti-Lag on in AMD Software
- [ ] Frame generation tested and a deliberate decision made per game

→ Next: [Phase 8 — Docked mode](08-docked-mode.md)
