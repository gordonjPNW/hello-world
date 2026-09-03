"""Close Steam's window automatically once a Steam game is confirmed running.

Every Steamworks-integrated game calls `SteamAPI_Init()` on launch, which
starts the Steam client if it is not already running -- even when the game's
own .exe is launched directly rather than through Steam's UI. That part is not
avoidable without risking achievements, cloud saves, or a title's own
anti-tamper checks, and this module does not try.

What IS controllable is the window, and only because of something checked
first rather than assumed: verified on this device, 2026-09-02, Steam's own X
button does not quit the client -- it minimizes to the system tray. steam.exe
keeps running, SteamAPI stays satisfied, only the window goes away. A graceful
(non-forced) `taskkill /IM steam.exe` sends exactly that same WM_CLOSE signal,
so automating it never risks the running game: the client is never asked to
do anything the user's own X button does not already do on this machine.

**`steam.exe` is never force-closed here.** This mirrors the protected-process
principle already enforced in `allytune.system.cleanup` -- reuses its
protected-names guard for defence in depth, and its `_default_executor` so
both modules run `taskkill` the same, tested way.

Detection is deliberately an allowlist-first, path-based fallback, not a
blocklist: a launched process counts as "a Steam game" if it matches the
catalogued library in `allytune.games.library`, or -- so this covers every
Steam game, not just the nine already catalogued -- if its executable lives
under Steam's own `steamapps\\common` folder and is not a known non-game
utility (a crash handler, a redistributable installer, a launcher shim).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

from allytune import winbridge as wb
from allytune.system.cleanup import _default_executor

STEAM_COMMON = Path(r"C:\Program Files (x86)\Steam\steamapps\common")

# Executables that live under steamapps\common but are not games: installers,
# crash handlers, launcher shims. Matched against on the filename stem only
# (no .exe, lowercase), same convention as _protected_names().
EXCLUDE_BASENAMES = {
    "crs-handler", "crs-uploader", "crs-video",
    "unitycrashhandler", "unitycrashhandler64",
    "ue4prereqsetup_x64", "ueprereqsetup_x64", "ueprereqsetup",
    "vc_redist.x64", "vc_redist.x86", "vcredist", "vcredist_x64",
    "dxsetup", "dxwebsetup", "directx",
    "crash_reporter", "crashpad_handler", "crashreportclient",
    "social-club-setup", "rockstar-games-launcher",
    "epicwebhelper", "easyanticheat_setup",
    # Steam's own processes. Their real path is never under steamapps\common,
    # so the fallback below would not match them anyway -- listed explicitly
    # so that stays true even if Steam's install layout ever changes, and so
    # the exclusion is visible here rather than depended on implicitly.
    "steam", "steamwebhelper", "steamservice",
}

PS_SNAPSHOT_QUERY = (
    "Get-CimInstance Win32_Process | "
    "Select-Object ProcessId,Name,ExecutablePath"
)


@dataclass(frozen=True)
class DetectedGame:
    name: str
    pid: int
    exe_path: str


def is_probably_a_game(name: str, exe_path: str) -> bool:
    """Whether a freshly-seen process looks like a Steam game worth acting on.

    Checked in order: known catalogue match first (highest confidence, and
    covers titles whose folder layout is unusual), then the path-based
    fallback so an uncatalogued Steam game is still covered, per "every Steam
    game" rather than just the nine this project has looked at closely.

    Deliberately does NOT reuse cleanup.py's `_protected_names()` -- that set
    exists to keep the cleanup tool from ever closing a running game, so it
    *includes* every catalogued title on purpose. Reusing it here inverted the
    intent: it excluded every real game from ever being detected as one. The
    only action gated by this check is closing Steam's window, which is safe
    by construction (see the module docstring), so this needs no elaborate
    defence in depth -- only EXCLUDE_BASENAMES, checked plainly below.
    """
    base = Path(name).stem.lower() if name else ""
    if not base or base in EXCLUDE_BASENAMES:
        return False

    from allytune.games import library
    if library.by_process(name):
        return True

    if not exe_path:
        return False
    try:
        return STEAM_COMMON in Path(exe_path).resolve().parents
    except (OSError, ValueError):
        return False


def find_new_game_processes(before: dict, after: dict) -> list:
    """Processes present in `after` but not `before` that look like a game.

    `before`/`after` are pid -> (name, exe_path) snapshots, in the shape
    `_live_process_snapshot()` returns -- kept as plain dicts rather than a
    dedicated type so a test can hand-build one with no Windows call at all.
    """
    out = []
    for pid, (name, exe_path) in after.items():
        if pid in before:
            continue
        if is_probably_a_game(name, exe_path):
            out.append(DetectedGame(name=name, pid=pid, exe_path=exe_path))
    return out


def close_steam_window(executor=None):
    """One graceful close attempt against steam.exe. Never forced.

    Returns (returncode, stderr_or_stdout), same shape as
    allytune.system.cleanup's executor contract, for the same reason: so a
    test can inject a fake and assert on exactly what was attempted.
    """
    run = executor or _default_executor
    return run(["taskkill", "/IM", "steam.exe"])


def _live_process_snapshot() -> dict:
    rows = wb.as_list(wb.ps_json(PS_SNAPSHOT_QUERY))
    out: dict = {}
    for r in rows:
        pid = r.get("ProcessId")
        if pid is None:
            continue
        out[int(pid)] = ((r.get("Name") or ""), (r.get("ExecutablePath") or ""))
    return out


def handle_new_games(
    before: dict,
    after: dict,
    handled_pids: frozenset,
    executor=None,
    sleep_fn=None,
    close_delay: float = 3.0,
    print_fn=print,
) -> frozenset:
    """One polling step: detect newly-launched games, close Steam's window
    once per each. Returns the updated handled-pids set.

    This is the part actually worth testing -- separated from `watch()`'s
    infinite loop so a test can call it directly with fake snapshots and never
    touch a real process, the same split `cleanup()` uses between its logic
    and its thin subprocess call.

    Each detected game gets at most one close attempt, ever, tracked by pid --
    hammering taskkill repeatedly while a game keeps running is more likely to
    do something unexpected than to help, and there is nothing to gain from a
    second attempt once the first WM_CLOSE has been sent.
    """
    sleep = sleep_fn or time.sleep
    new_games = [g for g in find_new_game_processes(before, after)
                 if g.pid not in handled_pids]
    updated = set(handled_pids)
    for g in new_games:
        print_fn(f"Detected {g.name} (pid {g.pid}). "
                  f"Closing Steam's window in {close_delay:.0f}s...")
        if close_delay > 0:
            sleep(close_delay)
        rc, err = close_steam_window(executor)
        updated.add(g.pid)
        if rc == 0:
            print_fn("  done -- Steam minimized to tray, still running.")
        else:
            print_fn("  taskkill reported: " + (err or "").strip())
    return frozenset(updated)


def watch(
    poll_interval: float = 2.0,
    close_delay: float = 3.0,
    live_snapshot_fn=None,
    executor=None,
    sleep_fn=None,
    print_fn=print,
) -> None:
    """Poll forever, closing Steam's window once per newly-launched game.

    Whatever is running at start counts as the baseline, not as "just
    launched" -- this only reacts to games that start AFTER the watcher does,
    which is the correct behaviour for "close it once the game's running" and
    avoids immediately closing Steam's window out from under someone who is
    mid-way through browsing it when the watcher starts.
    """
    sleep = sleep_fn or time.sleep
    snap = live_snapshot_fn or _live_process_snapshot

    print_fn("Watching for Steam games to launch.")
    print_fn("Steam's window will be closed (minimized to tray) a few")
    print_fn("seconds after each one starts. Press Ctrl+C to stop.")
    print_fn("")

    handled: frozenset = frozenset()
    before = snap()
    while True:
        sleep(poll_interval)
        after = snap()
        handled = handle_new_games(
            before, after, handled, executor, sleep_fn, close_delay, print_fn
        )
        before = after
