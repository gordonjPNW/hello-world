# Phase 9 — Storage and library management

**Time:** ~30 minutes
**Risk:** none
**You'll need:** a UHS-II microSD card (optional but recommended)

You have the full 1 TB internal drive available — no partition split, no second OS taking a share.
That's a comfortable amount of space, right up until two modern AAA installs and a shader cache
disagree.

---

## The good news about microSD on the Ally X

The original ROG Ally had a notorious problem: its microSD reader sat directly beside the exhaust
vent, and sustained heat killed cards.

**The Ally X relocated the reader.** Your device does not have this problem. microSD is a legitimate
storage tier here, and most advice you'll find warning against it predates your hardware.

## Choosing a card

Get a **UHS-II** card. The Ally X's reader supports it, and the difference over UHS-I is substantial
for game loading — roughly double the sequential read in practice.

- **Capacity:** 512 GB or 1 TB. Below 256 GB isn't worth the slot
- **Look for:** UHS-II, V60 or V90 video speed class
- **Brands:** stick to Samsung, SanDisk, Lexar, or Kingston. Counterfeit cards are rampant on
  marketplace listings — buy from a retailer you trust
- **Verify it** when it arrives with **H2testw** or **F3**. A fake card reports the right capacity and
  corrupts data past its real size, and you'd rather find out before installing 200 GB of games

## What goes where

| Tier | Put here |
|---|---|
| **Internal NVMe** | Current main game, anything with heavy streaming or open-world texture loading, competitive titles where load times matter |
| **microSD** | Backlog, indie games, emulation, 2D titles, older games, anything you play occasionally |

**Games that genuinely suffer on microSD:** large open-world titles that stream assets continuously
(traversal stutter becomes noticeable), and anything with long unskippable load screens you hit
often.

**Games that never notice:** indie, 2D, turn-based, older titles, emulation, and most things that
load once into a level and stay there.

Rule of thumb: if it stutters when you move fast through a big world, it belongs on the NVMe.

## Setting up the Steam library

1. Insert the card, let Windows initialize it
2. **Steam → Settings → Storage → +** and add the microSD as a library folder
3. New installs now offer a drive choice

**Moving games without re-downloading:** from that same Storage screen, select a game and use
**Move**. This relocates the install properly, keeping Steam's records intact. Never move game
folders manually in Explorer — Steam loses track and forces a full re-download.

## Non-Steam launchers

If you use Epic, GOG, or Xbox/Game Pass alongside Steam, point each at its own folder on the microSD
during install. Most support a custom install location; the Xbox app is the fussiest — set its
install location under **Settings → General → Change where new games install**.

## Keeping space free

- **Storage Sense** (enabled in Phase 3) handles temp files and old update caches
- **Shader caches** grow steadily. AMD's cache lives under `%LOCALAPPDATA%\AMD\DxCache` and similar —
  safe to clear if you're tight on space; it rebuilds automatically
- **`hiberfil.sys`** is sizeable on a 24 GB machine. That's the cost of the Phase 4 hibernate setup
  and it's worth paying, but `powercfg /h /size 40` shrinks it if needed
- Keep **at least 10 % of the internal drive free**. NVMe drives slow measurably when nearly full,
  and Windows needs headroom for updates

## Backups

Steam Cloud covers saves for games that support it (verified in Phase 6). It does not cover
everything.

Worth manually backing up to the microSD or cloud storage:

- Emulator save states and memory cards
- Non-Steam game saves (usually under `Documents\My Games` or `%APPDATA%`)
- Your Armoury Crate profiles, if the version you're on supports export
- Steam Input configurations you spent real time on

---

## Done when

- [ ] microSD installed and verified genuine
- [ ] Added as a Steam library folder
- [ ] Games distributed sensibly between tiers
- [ ] Non-Steam launchers pointed at their own folders
- [ ] At least 10 % free on the internal drive
- [ ] Non-cloud saves backed up somewhere

→ Next: [Phase 10 — Accessories](10-accessories.md)
