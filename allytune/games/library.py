"""The installed game library, and what is known about each title.

Every path and every `settings` value here was verified against this Ally X on
2026-08-31 by walking the filesystem, not looked up. The `bound` field is the
opposite: it is a **hypothesis to be measured**, and is labelled as such in the
dataclass. That distinction is the whole discipline of this project.

Two facts already disproved the alternative on this very hardware:

  - The documented perf-per-watt curve predicted +35% for Miles Morales; the
    measurement was +148%, because the curve came from GPU-bound work and that
    game is CPU-bound.
  - Uncharted 4 was then measured GPU-bound, inverting it again.

So nothing in `bound` may be reported as a finding until a capture says so.
`measured` records whether that has happened.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field, asdict
from pathlib import Path

STEAM_COMMON = Path(r"C:\Program Files (x86)\Steam\steamapps\common")
HOME = Path(os.path.expanduser("~"))

# How a game's graphics settings are stored, which decides whether an unattended
# settings sweep is possible at all.
PATCHABLE_XML = "plaintext-xml"      # fully scriptable
PATCHABLE_INI = "plaintext-ini"      # fully scriptable
PATCHABLE_REGISTRY = "registry"      # fully scriptable -- named values under HKCU
BINARY_SAVE = "binary-save"          # menu only; no text to patch
UNKNOWN_FORMAT = "unknown"


@dataclass
class Game:
    name: str
    appid: int
    exe: str                      # path relative to STEAM_COMMON
    settings: str                 # one of the constants above
    settings_path: str = ""       # relative to HOME, "" if none found
    benchmark: str = "unknown"    # "yes" / "no" / "likely" -- verify before relying
    bound: str = "unmeasured"     # HYPOTHESIS until a capture says otherwise
    measured: bool = False
    notes: str = ""

    @property
    def full_exe(self) -> Path:
        return STEAM_COMMON / self.exe

    @property
    def process_name(self) -> str:
        return Path(self.exe).name

    def installed(self) -> bool:
        return self.full_exe.is_file()

    def as_dict(self) -> dict:
        d = asdict(self)
        d["process_name"] = self.process_name
        d["installed"] = self.installed()
        return d


# Ordered by expected payoff from the display recipe, highest first. The
# reasoning is in docs/allytune/06-game-library.md.
GAMES = [
    Game(
        name="Red Dead Redemption 2",
        appid=1174180,
        exe=r"Red Dead Redemption 2\RDR2.exe",
        settings=PATCHABLE_XML,
        settings_path=r"Documents\Rockstar Games\Red Dead Redemption 2\Settings\system.xml",
        benchmark="yes",
        bound="unmeasured",
        notes=(
            "The best automation target in the library by a distance. system.xml "
            "exposes every graphics setting as plain XML -- tessellation, "
            "shadowQuality, reflectionQuality, volumetricsQuality, textureQuality "
            "and the rest -- so a sweep can patch settings directly, which the "
            "plan assumed was possible for Uncharted 4 and it is not. It also "
            "ships a built-in benchmark, which removes the human from the route "
            "entirely. Currently set almost all Low with textures Ultra."
        ),
    ),
    Game(
        name="Ghost of Tsushima: Director's Cut",
        appid=2215430,
        exe=r"Ghost of Tsushima DIRECTOR'S CUT\GhostOfTsushima.exe",
        settings=PATCHABLE_REGISTRY,
        benchmark="no",
        bound="unmeasured",
        notes=(
            "Nixxes PC port. Graphics settings live in the REGISTRY, not a "
            r"file: HKCU\Software\Sucker Punch Productions\Ghost of Tsushima "
            r"DIRECTOR'S CUT\Graphics -- every knob a named DWORD. Quality "
            "scale 0=Low 1=Med 2=High 3=VeryHigh (TextureQuality, "
            "ShadowQuality, LevelOfDetail, VolumetricFogQuality, "
            "ScreenSpaceReflections, ...); UpscaleMethod 2=FSR 3.1.4, "
            "UpscaleQuality 3=Quality 2=Balanced; Fullscreen / "
            "ExclusiveFullscreen / VSync / FrameGen are 0/1 flags; "
            "FullscreenWidth/Height in px. Fully scriptable for a sweep, no "
            "file parsing -- but the game rewrites the whole key on exit, so "
            "patch only while it is closed. "
            "DISPLAY PATH IS SOLVED (2026-09-06, docked 1440p, two probes): "
            "100% Hardware Independent Flip, 0 dropped presents -- the "
            "borderless recipe transferred cleanly on the first try (plain "
            "'Fullscreen' + 2560x1440 matching the desktop + VSync off + the "
            "pre-set SwapEffectUpgradeEnable). "
            "BOTTLENECK NOT YET RESOLVED. At High preset: FSR Quality ~26 fps "
            "avg, FSR Balanced ~30 fps avg. Probe 1's GPU-busy ratio (0.965) "
            "read as GPU-bound but was misleading -- CPUBusy (37.5 ms) about "
            "equalled GPUBusy (36.8 ms), i.e. co-limited. At Balanced the GPU "
            "eased (29 ms) but CPUBusy (31 ms) did not, and the CPU was the "
            "longer path on 67% of frames -- so this behaves more like Miles "
            "Morales than Uncharted 4, and dropping FSR below Balanced will "
            "do little. BUT both probes ran at 0.5-1.0 GB RAM free, which "
            "inflates CPU frame time, so the CPU-vs-GPU call is not "
            "trustworthy yet. Next: a clean-RAM, elevated run to settle the "
            "bound, then sweep CPU-side settings (LevelOfDetail, TerrainDetail, "
            "foliage/crowd, shadow distance) for a locked 30 -- not resolution. "
            "No benchmark in the Display menu on build v1053.9.0623.1807. "
            "Use plain 'Fullscreen' (borderless); 'Exclusive Fullscreen' "
            "crashed the game doing a 1440p mode-switch through the dock."
        ),
    ),
    Game(
        name="Horizon Zero Dawn: Complete Edition",
        appid=1151640,
        exe=r"Horizon Zero Dawn\HorizonZeroDawn.exe",
        settings=BINARY_SAVE,
        benchmark="yes",
        bound="unmeasured",
        notes=(
            "Has a built-in benchmark, so it can be measured with far less human "
            "input than a walked route. Decima engine. Older port with a history "
            "of long shader-compilation passes on first launch -- warm it up "
            "thoroughly before any capture or the first run will be garbage."
        ),
    ),
    Game(
        name="God of War Ragnarok",
        appid=2322010,
        exe=r"God of War Ragnarok\GoWR.exe",
        settings=BINARY_SAVE,
        benchmark="unknown",
        bound="unmeasured",
        notes=(
            "Largest install at 176 GB and the newest engine here, so likely the "
            "heaviest. Expect to need FSR Performance rather than Quality to hold "
            "30 fps docked."
        ),
    ),
    Game(
        name="Days Gone",
        appid=1259420,
        exe=r"Days Gone\BendGame\Binaries\Win64\DaysGone.exe",
        settings=PATCHABLE_INI,
        settings_path=r"AppData\Local\BendGame\Saved\Config\WindowsNoEditor\GameUserSettings.ini",
        benchmark="no",
        bound="unmeasured",
        notes=(
            "Unreal Engine 4. GameUserSettings.ini appeared after first launch "
            "(2026-09-06) -- plain INI, patchable. The live quality keys are "
            "Days Gone's own (LightingQuality, ShadowQuality, CloudAndFogQuality, "
            "GeometryQuality, FoliageDrawDistance, TextureFilterQuality, "
            "RenderScale), which VisualPreset=4 (custom) overrides the sg.* "
            "groups with. No FSR/DLSS -- RenderScale is the only upscaler lever. "
            "No benchmark. Horde sequences are heavily CPU-bound, so this may "
            "behave like Miles Morales rather than like Uncharted -- confirm "
            "with the GPU-busy ratio before touching resolution or RenderScale. "
            "Recipe applied 2026-09-06: borderless 2560x1440, V-Sync off, "
            "30 fps cap; measurement still outstanding."
        ),
    ),
    Game(
        name="Palworld",
        appid=1623730,
        exe=r"Palworld\Pal\Binaries\Win64\Palworld-Win64-Shipping.exe",
        settings=PATCHABLE_INI,
        settings_path=r"AppData\Local\Pal\Saved\Config\Windows\GameUserSettings.ini",
        benchmark="no",
        bound="unmeasured",
        notes=(
            "Unreal Engine 5, patchable ini, so a sweep is scriptable. "
            "ally-x-tdp-reference.md already assigns it Handheld AAA (17 W) but "
            "records no measurement behind that. Base-building areas load the CPU "
            "hard; a route needs to be picked carefully to be repeatable, since "
            "pals wander."
        ),
    ),
    Game(
        name="Planet Zoo",
        appid=703080,
        exe=r"Planet Zoo\PlanetZoo.exe",
        settings=BINARY_SAVE,
        benchmark="yes",
        bound="unmeasured",
        notes=(
            "Has a built-in benchmark. ally-x-tdp-reference.md calls it CPU-bound "
            "and expects it to benefit from Memory Integrity being off -- both "
            "plausible for a simulation title, both unmeasured. If it is "
            "CPU-bound then upscaling will do nothing for it, which is the single "
            "most useful thing the GPU-busy ratio can tell us."
        ),
    ),
    Game(
        name="Coral Island",
        appid=1158160,
        exe=r"Coral Island\ProjectCoral\Binaries\Win64\ProjectCoral-Win64-Shipping.exe",
        settings=PATCHABLE_INI,
        settings_path=r"AppData\Local\ProjectCoral\Saved\Config\WindowsNoEditor\GameUserSettings.ini",
        benchmark="no",
        bound="unmeasured",
        notes=(
            "Lightest title here. Likely to hold 60 fps rather than 30, which "
            "would make it the one game where the 60 Hz panel is not the "
            "constraint -- and therefore where a 60 fps cap, not 30, is correct."
        ),
    ),
    Game(
        name="Uncharted 4: A Thief's End",
        appid=1659420,
        exe=r"Uncharted Legacy of Thieves Collection\u4.exe",
        settings=BINARY_SAVE,
        settings_path=r"Saved Games\Uncharted Legacy of Thieves Collection",
        benchmark="no",
        bound="GPU-bound",
        measured=True,
        notes=(
            "MEASURED 2026-08-31, docked at 1440p: GPU-busy ratio 0.95, so "
            "GPU-bound. Settled configuration is borderless 2560x1440 matching "
            "the desktop, FSR 2 Balanced (renders 1505x847), V-Sync off, in-game "
            "'Lock Frames to 30' on. That delivers a locked 30 fps with 0% of "
            "presents dropped. No plaintext settings file, so no unattended sweep."
        ),
    ),
    Game(
        name="Uncharted: The Lost Legacy",
        appid=1659420,
        exe=r"Uncharted Legacy of Thieves Collection\tll.exe",
        settings=BINARY_SAVE,
        benchmark="no",
        bound="unmeasured",
        notes=(
            "Same engine and same collection as u4.exe, so the display recipe "
            "should transfer directly. The settings almost certainly will too, "
            "but that is an assumption until measured."
        ),
    ),
]


def all_games(installed_only: bool = True) -> list:
    return [g for g in GAMES if g.installed()] if installed_only else list(GAMES)


def by_process(name: str):
    want = name.lower()
    for g in GAMES:
        if g.process_name.lower() == want:
            return g
    return None


def find(text: str):
    """Loose lookup by name or executable, for CLI convenience."""
    t = text.lower()
    for g in GAMES:
        if t in g.name.lower() or t in g.process_name.lower():
            return g
    return None
