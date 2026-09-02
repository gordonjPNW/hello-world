"""Free RAM before a gaming session, by closing known-safe background apps.

Exists because of a measured finding, not a hunch: the docked Uncharted 4 noise
floor passed at 1.53% (see docs/allytune/04-phase1-results.md, attempt 5) while
the game itself was held to 25.5 fps against its own 30 fps cap, because only
1.2 GB of RAM was free during capture. An earlier isolated probe with ~3.5 GB
free hit a clean, locked 30.0 fps on identical settings. Free RAM is not
cosmetic here -- it is the difference between a game hitting its cap and not.

**Safety model: allowlist only, never a blocklist or a heuristic.** Every
process this module can touch is named explicitly in CATEGORIES below, after
being identified by hand from a live process dump. Nothing here ever reasons
"close everything except X" -- that shape of logic is what accidentally kills
a game, a save process, or this very session. `PROTECTED_NAMES` is enforced as
a second, independent guard against the game library and this project's own
process name, so a mistake in CATEGORIES cannot become a mistake in what
actually gets closed.

Never touched, and deliberately absent from every category below:

  - MsMpEng (Windows Defender) -- security software
  - ArmouryCrateSE*, RadeonSoftware, AMDRSServ, AMDRSSrcExt, cncmd -- these
    enforce the TDP profile and drive the GPU; this whole project depends on
    them behaving normally
  - TextInputHost, TabTip -- the on-screen keyboard. This is a handheld with
    no physical keyboard guaranteed; breaking these breaks text input itself
  - explorer, dwm, sihost, and the rest of the Windows shell -- dwm in
    particular is the compositor whose behaviour this whole project is built
    around measuring
  - steam.exe itself -- only its steamwebhelper children are touched. Steam's
    own close-to-tray setting is not something to gamble a running game's DRM
    or cloud-save state on
  - claude* -- this agent's own session. It cannot close itself and should not
    try. Its overhead is real (see the finding above) and is reported, not
    hidden, but it is not this module's to touch.
"""

from __future__ import annotations

import subprocess
import time
from dataclasses import dataclass, field, asdict

from allytune import winbridge as wb

# Grace period between a polite close attempt and forcing the stragglers, for
# categories marked `graceful`. Long enough for a well-behaved app to actually
# exit; short enough that pressing the button doesn't feel like it hung.
GRACE_SWEEP_DELAY_S = 1.2

# Thresholds are the ones this project actually measured, not round numbers
# picked for looking tidy. See docs/allytune/04-phase1-results.md, attempt 5.
READY_ABOVE_GB = 4.0     # comfortably above the ~3.5 GB that held a clean 30 fps
TIGHT_ABOVE_GB = 2.0     # below this, frame drops were measured directly

PS_PROCESS_QUERY = "Get-Process | Select-Object Name,@{n='MB';e={$_.WorkingSet64/1MB}}"


@dataclass(frozen=True)
class Category:
    key: str
    label: str
    processes: tuple          # exact process names, no extension, no wildcards
    graceful: bool             # True: ask nicely (taskkill without /F). False: force.
    default_on: bool           # pre-checked in the UI
    note: str = ""


CATEGORIES = (
    Category(
        key="alienware",
        label="Alienware / Dell monitor software",
        processes=(
            "CommandCenter", "CommandCenterOsd",
            "AWCC.UCSubAgent", "AWCC.SCSubAgent",
            "Dell.TechHub", "Dell.TechHub.Instrumentation.SubAgent",
            "Dell.TechHub.Instrumentation.UserProcess",
            "Dell.TechHub.Analytics.SubAgent", "Dell.TechHub.DataManager.SubAgent",
            "Dell.CoreServices.Client", "Dell.UCA.Manager", "Dell.Update.SubAgent",
            "AacAmbientLighting",
        ),
        graceful=False,
        default_on=True,
        note=(
            "Monitor RGB and management software for the AW3225DM -- separate "
            "from Armoury Crate, and previously unflagged as a RAM consumer in "
            "this project. Not needed while a game is running. Roughly a "
            "quarter of these run under a different account and need this "
            "dashboard started from an Administrator terminal to fully close; "
            "the rest close either way."
        ),
    ),
    Category(
        key="browsers",
        label="Browsers",
        # Deliberately NOT msedgewebview2 -- see the note below the table.
        processes=("msedge", "chrome", "firefox"),
        graceful=True,
        default_on=True,
        note=(
            "Asked to close politely first; anything still running after "
            f"{GRACE_SWEEP_DELAY_S:.0f}s is closed firmly. Modern browsers run "
            "many windowless helper processes -- verified on this device, every "
            "remaining msedge process had no window at all -- so a polite-only "
            "close leaves most of the memory behind. Save anything open before "
            "pressing the button."
        ),
    ),
    Category(
        key="gamebar",
        label="Xbox Game Bar / cross-device",
        processes=(
            "GameBar", "GameBarFTServer", "GameBarPresenceWriter",
            "XboxGameBarWidgets", "XboxPcAppFT", "EdgeGameAssist",
            "CrossDeviceService", "CrossDeviceResume", "PhoneExperienceHost",
        ),
        graceful=False,
        default_on=True,
        note="Background helpers. Game DVR is already off; these are just overhead.",
    ),
    Category(
        key="onedrive",
        label="OneDrive sync",
        processes=("OneDrive", "OneDrive.Sync.Service"),
        graceful=False,
        default_on=False,
        note="Not destructive -- sync resumes next time it's opened -- but off by default so an active sync isn't interrupted without asking.",
    ),
)

_CATEGORY_BY_KEY = {c.key: c for c in CATEGORIES}

# Tried and reverted, 2026-09-01: a "Steam's UI overhead" category that
# force-closed steamwebhelper. Directly measured through this tool's own
# browser test: killing it makes steam.exe's own watchdog immediately relaunch
# the whole helper tree, and the fresh tree used MORE memory afterward (538 MB
# before -> 826 MB after, all seven processes carrying a fresh start time
# matching the moment of the click). A category whose measured effect is
# negative does not belong here even unchecked -- omitted outright rather than
# left as a tempting, mislabelled checkbox.
#
# Tried and narrowed, same day: msedgewebview2 was in `browsers` originally,
# on the assumption it was leftover Edge browser content. Traced directly: on
# this device every msedgewebview2 process is owned by SearchHost.exe --
# Windows Search's own embedded web content, not a browser tab at all
# (cmdline carries `--webview-exe-name=SearchHost.exe`). Force-closing it
# just makes the OS shell relaunch the whole tree within seconds, the same
# shape of problem as steamwebhelper. Dropped from `browsers`.

# Second, independent guard. Even a mistaken entry in CATEGORIES cannot result
# in one of these being targeted -- checked before every taskkill.
def _protected_names() -> set:
    names = {
        "claude", "steam",                              # never the core processes
        "explorer", "dwm", "sihost", "svchost", "system",
        "shellexperiencehost", "runtimebroker", "backgroundtaskhost",
        "applicationframehost", "searchhost", "textinputhost", "tabtip",
        "msmpeng", "securityhealthsystray",
        "armourycratese", "armourycrateservice",
        "radeonsoftware", "amdrsserv", "amdrssrcext", "cncmd",
        "presentmon-2.5.1-x64", "librehardwaremonitor",
    }
    try:
        from allytune.games import library
        names |= {g.process_name.lower().removesuffix(".exe") for g in library.GAMES}
    except Exception:
        pass  # the guard degrades to the hardcoded set; it never disappears
    return names


@dataclass
class ProcessHit:
    name: str
    mb: float

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class CategoryStatus:
    category: Category
    running: list = field(default_factory=list)   # list[ProcessHit]
    total_mb: float = 0.0

    def as_dict(self) -> dict:
        return {
            "key": self.category.key,
            "label": self.category.label,
            "note": self.category.note,
            "default_on": self.category.default_on,
            "running": [p.as_dict() for p in self.running],
            "total_mb": round(self.total_mb, 0),
        }


@dataclass
class NoiseReport:
    free_gb: float
    total_gb: float
    verdict: str          # "ready" | "tight" | "noisy"
    verdict_text: str
    categories: list = field(default_factory=list)   # list[CategoryStatus]
    reclaimable_mb: float = 0.0

    def as_dict(self) -> dict:
        return {
            "free_gb": self.free_gb, "total_gb": self.total_gb,
            "verdict": self.verdict, "verdict_text": self.verdict_text,
            "reclaimable_mb": round(self.reclaimable_mb, 0),
            "categories": [c.as_dict() for c in self.categories],
        }


def _verdict(free_gb: float) -> tuple:
    if free_gb >= READY_ABOVE_GB:
        return "ready", (
            f"{free_gb:.1f} GB free -- comfortably above the level that has held "
            "a clean 30 fps in this project's own measurements."
        )
    if free_gb >= TIGHT_ABOVE_GB:
        return "tight", (
            f"{free_gb:.1f} GB free -- probably fine, but this project has measured "
            "a game falling short of its own frame cap in this range."
        )
    return "noisy", (
        f"{free_gb:.1f} GB free -- this project measured real frame drops at "
        "this level (1.2 GB free held Uncharted 4 to 25.5 fps against a 30 fps cap)."
    )


def _live_processes() -> dict:
    """name (lowercase, no .exe) -> total MB across all instances of that name."""
    rows = wb.as_list(wb.ps_json(PS_PROCESS_QUERY))
    out: dict = {}
    for r in rows:
        name = (r.get("Name") or "").strip().lower()
        if not name:
            continue
        out[name] = out.get(name, 0.0) + float(r.get("MB") or 0.0)
    return out


def free_ram_gb() -> tuple:
    """(free_gb, total_gb) for the whole machine."""
    rows = wb.as_list(wb.ps_json(
        "Get-CimInstance Win32_OperatingSystem | "
        "Select-Object FreePhysicalMemory,TotalVisibleMemorySize"
    ))
    if not rows:
        return 0.0, 0.0
    r = rows[0]
    return (
        round((r.get("FreePhysicalMemory") or 0) / 1048576, 2),
        round((r.get("TotalVisibleMemorySize") or 0) / 1048576, 2),
    )


def scan(live: dict | None = None, free_total: tuple | None = None) -> NoiseReport:
    """What's running right now, categorised, against the measured thresholds.

    `live` and `free_total` are injectable so the categorisation logic --
    the part actually worth testing -- can be tested with a fake process list,
    with no PowerShell call and no dependency on the machine it runs on.
    """
    if live is None:
        live = _live_processes()
    free_gb, total_gb = free_total if free_total is not None else free_ram_gb()
    verdict, text = _verdict(free_gb)

    statuses = []
    reclaimable = 0.0
    for cat in CATEGORIES:
        hits = []
        for proc in cat.processes:
            mb = live.get(proc.lower())
            if mb:
                hits.append(ProcessHit(name=proc, mb=round(mb, 0)))
        total = sum(h.mb for h in hits)
        statuses.append(CategoryStatus(category=cat, running=hits, total_mb=total))
        reclaimable += total

    return NoiseReport(
        free_gb=free_gb, total_gb=total_gb, verdict=verdict, verdict_text=text,
        categories=statuses, reclaimable_mb=reclaimable,
    )


@dataclass
class CleanupResult:
    """What actually happened, verified rather than assumed.

    `closed` is populated by re-checking the live process list after every
    attempt, not by trusting taskkill's exit code -- a real gap found while
    building this: an Access Denied failure (exit 1) was previously still
    appended to `closed` unconditionally, so the tool reported success on
    processes it had not touched. `failed_permission` is exactly that case,
    named so the UI can say the one thing that actually fixes it: run this
    dashboard from an Administrator terminal.
    """

    closed: list = field(default_factory=list)
    failed_permission: list = field(default_factory=list)
    failed_other: list = field(default_factory=list)
    skipped_protected: list = field(default_factory=list)
    free_gb_before: float = 0.0
    free_gb_after: float = 0.0

    def as_dict(self) -> dict:
        return asdict(self)


def _default_executor(args):
    proc = subprocess.run(args, capture_output=True, text=True, timeout=10)
    return proc.returncode, (proc.stderr or proc.stdout or "")


def cleanup(
    category_keys,
    live: dict | None = None,
    executor=None,
    free_before_gb: float | None = None,
    free_after_gb: float | None = None,
    live_mid: dict | None = None,
    live_after: dict | None = None,
    sleep_fn=None,
) -> CleanupResult:
    """Close every running process in the given categories, then verify.

    Categories not present in CATEGORIES are silently ignored rather than
    raising -- a stale key from an old page load must not become an error the
    button-presser has to make sense of.

    A `graceful` category is asked nicely first (taskkill without /F). The
    decision to escalate to /F is made by checking who is ACTUALLY STILL
    RUNNING after `GRACE_SWEEP_DELAY_S`, never by trusting taskkill's exit
    code. This was found to be load-bearing, not defensive paranoia: a single
    `taskkill /IM msedge.exe` (no /F) against 18 same-named processes exited 0
    overall because 4 of them happened to have a message loop to signal --
    the other 14, all windowless renderer/GPU/utility processes, individually
    reported "can only be terminated forcefully" and were left running, with
    the command's overall exit code giving no hint of that. Gating escalation
    on exit code alone would silently have left most of a browser's memory
    behind exactly as it did here before this was found and fixed.

    `live`, `executor`, `live_mid`, `live_after` and the two `free_*_gb`
    values are injectable for testing, standing in for the real process
    query, the real `taskkill` call, the real mid-point process query used to
    decide escalation, the real post-cleanup process query, and the real
    before/after RAM measurement respectively.
    """
    free_before = free_before_gb if free_before_gb is not None else free_ram_gb()[0]
    protected = _protected_names()
    result = CleanupResult(free_gb_before=free_before)

    if live is None:
        live = _live_processes()
    run = executor or _default_executor
    sleep = sleep_fn or time.sleep

    targets: list = []              # (process name, graceful)
    last_attempt: dict = {}         # process name -> (returncode, stderr)

    for key in category_keys:
        cat = _CATEGORY_BY_KEY.get(key)
        if cat is None:
            continue
        for proc in cat.processes:
            if proc.lower() not in live:
                continue
            if proc.lower() in protected:
                # Should be unreachable given CATEGORIES is hand-reviewed, but
                # this is the line that makes it unreachable rather than trusted.
                result.skipped_protected.append(proc)
                continue
            args = ["taskkill", "/IM", proc + ".exe"] + ([] if cat.graceful else ["/F"])
            last_attempt[proc] = run(args)
            targets.append((proc, cat.graceful))

    graceful_names = [p for p, g in targets if g]
    if graceful_names:
        sleep(GRACE_SWEEP_DELAY_S)
        mid = live_mid if live_mid is not None else _live_processes()
        for proc in graceful_names:
            if proc.lower() in mid:
                last_attempt[proc] = run(["taskkill", "/IM", proc + ".exe", "/F"])

    live_now = live_after if live_after is not None else _live_processes()
    for proc, _graceful in targets:
        rc, err = last_attempt[proc]
        if proc.lower() not in live_now:
            result.closed.append(proc)
        elif "access is denied" in (err or "").lower():
            result.failed_permission.append(proc)
        else:
            result.failed_other.append(proc)

    result.free_gb_after = (
        free_after_gb if free_after_gb is not None else free_ram_gb()[0]
    )
    return result
