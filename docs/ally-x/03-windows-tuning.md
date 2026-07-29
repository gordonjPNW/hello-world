# Phase 3 — Windows tuning

**Time:** ~1 hour
**Risk:** low — everything here is reversible, and each step says how
**You'll need:** nothing extra

Since you're running Windows only, this is where your frame rate and your idle battery drain
actually come from. This phase is deliberately **not** a "debloat script." Those scripts break
things in ways that surface three weeks later with no obvious cause. Every item below states what it
buys you, so you can skip the ones you don't want.

---

## 1. Choose your shell

The stock Windows desktop is the wrong front end for a 7" touchscreen you're holding with two hands.
You have two good options.

### Xbox Full Screen Experience — recommended

Microsoft's controller-first shell. It launched on the Xbox Ally and has since been made available
to **all Windows 11 gaming handhelds**, including your Ally X.

- Boots straight into a controller-navigable library
- Aggregates Steam, Game Pass, and other launchers in one place
- **Suspends much of the desktop shell**, freeing memory and background cycles for the game

Enable it in **Settings → Gaming → Full screen experience**, then choose it as the default at
startup. If you don't see the option, you're on an older Windows build — finish Phase 2 first.

To get to the desktop when you need it, use the Command Center or the Task View button; the shell
provides an explicit "Desktop" exit.

### Steam Big Picture at startup — the simpler alternative

If effectively everything you play is on Steam, just set Steam to launch into Big Picture at boot
and skip FSE entirely. Fewer moving parts, one less layer.

**Recommendation:** FSE as the shell with Steam living inside it. You get the overhead reduction
either way, and FSE handles the non-Steam launchers you'll inevitably end up with.

## 2. Disable VBS / Memory Integrity

Consistently the largest single frame-rate recovery available on Z1 Extreme handhelds.
Virtualization-Based Security adds a hypervisor layer between the OS and hardware, and on a
low-power APU that overhead is measurable.

**Settings → Privacy & security → Windows Security → Device security → Core isolation** → turn
**Memory integrity** off, then reboot.

Verify with `msinfo32` — look for *Virtualization-based security* showing **Not enabled**.

> **The trade-off, stated plainly:** Memory Integrity is a genuine security feature that blocks a
> class of driver-based attacks. Turning it off measurably lowers your defenses. On a
> gaming-only handheld that's a reasonable trade; on a device where you handle work email and
> banking, less so. Your call — it's a two-click reversal either way.

## 3. Power settings

**Settings → System → Power & battery → Power mode → Balanced.**

Do **not** use "Best power efficiency." It throttles the CPU even while plugged in, and it's a
common reason people think their handheld is defective. Armoury Crate's TDP profiles (Phase 5) are
your real power control — this setting just needs to stay out of the way.

Leave "Best performance" alone too; it mostly raises idle draw without helping a TDP-limited APU.

## 4. Prune startup

**Task Manager → Startup apps.** This is where handheld idle drain genuinely originates — every
launcher you've ever installed wants to start with Windows and phone home.

Disable auto-start for: Epic Games Launcher, EA app, Ubisoft Connect, Battle.net, GOG Galaxy,
Discord (unless you actually want it), Spotify, OneDrive if you don't use it, and any RGB or
peripheral utility.

Keep: Armoury Crate SE and its services, ASUS System Control Interface, your audio driver utility.

Steam is your call — leaving it on start is convenient given it's your primary launcher, and its
idle cost is modest.

Check the **Services** tab afterward for leftovers from launchers you removed.

## 5. Graphics and game settings

**Settings → System → Display → Graphics → Change default graphics settings:**

- **Hardware-accelerated GPU scheduling (HAGS): On.** Reduces scheduling latency; generally a small
  win on RDNA 3.
- **Variable refresh rate: On.** Required for the 120 Hz VRR panel to do its job (Phase 7 depends on
  this).
- **Optimizations for windowed games: On.**

**Settings → Gaming → Game Mode: On.** Prioritizes the foreground game and, importantly, suppresses
Windows Update restarts and driver installs mid-session.

**Settings → Gaming → Captures:** turn off background recording unless you use it. It costs frames
continuously for a feature most people never touch.

## 6. Quiet the background

- **Settings → System → Notifications:** turn on **Do not disturb**, or at minimum enable
  notification suppression while playing a game. Nothing worse than a toast popup stealing focus
  mid-fight.
- **Settings → System → Storage → Storage Sense: On.** Keeps temp files and old Windows update
  caches from quietly eating the drive.
- **Search indexing:** leave it enabled, but under **Settings → Privacy & security → Searching
  Windows** set it to **Classic** rather than Enhanced. Enhanced indexes your whole drive
  continuously — real cost, no benefit on a games machine.
- **Settings → Privacy & security → General:** turn off the advertising ID and personalized content
  toggles. Small, but they're pure background chatter.

## 7. What not to do

Worth stating explicitly, because these circulate widely and range from useless to harmful:

- **Don't run third-party "debloat" or "optimizer" scripts.** They strip components Windows Update
  later expects to find, and the breakage surfaces weeks afterward with no obvious cause.
- **Don't disable Windows Defender.** The performance cost is small on Zen 4, and you've already
  reduced your security posture in step 2.
- **Don't disable Superfetch/SysMain or the page file.** Both are widely-recommended and both make
  things worse on a 24 GB machine that stutters when a game wants memory you told Windows not to
  reserve.
- **Don't set CPU affinity or priority manually per game.** The scheduler handles this better than
  you will, and it silently resets on reboot anyway.

---

## Done when

- [ ] Controller-first shell chosen and set to launch at boot
- [ ] Memory integrity off (or a deliberate decision to keep it)
- [ ] Power mode on Balanced
- [ ] Startup apps pruned
- [ ] HAGS, VRR, and Game Mode on
- [ ] Background capture off
- [ ] Do not disturb configured

→ Next: [Phase 4 — Sleep & battery](04-sleep-and-battery.md)
