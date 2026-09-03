"""allytune command line.

Every command takes --json so an agent can drive it without parsing prose, and
prints human output otherwise because a person reads this on a 7" screen.

Phase 1 is read-only. Nothing here writes power limits, display modes or game
configuration. The only files written are allytune's own results.
"""

from __future__ import annotations

import argparse
import json
import sys
import time

from allytune import __version__, store
from allytune.analysis import metrics as M
from allytune.analysis import noise as N
from allytune.capture import runner
from allytune.inventory import device
from allytune.telemetry import sensors


def _out(obj, as_json: bool, human):
    if as_json:
        print(json.dumps(obj, indent=2, default=str))
    else:
        human()


# --------------------------------------------------------------------------- #
# inventory


def cmd_inventory(args) -> int:
    inv = device.collect()

    def human():
        print("Device")
        print("=" * 74)
        print("  Model            " + inv.model + "  (" + inv.manufacturer + ")")
        print("  BIOS             " + inv.bios)
        print("  OS               " + inv.os_caption + " " + inv.os_version)
        print("  CPU              " + inv.cpu + "  (" + str(inv.cpu_cores) + " cores)")
        print("  GPU              " + inv.gpu)
        print("  GPU driver       " + inv.gpu_driver + "   " + inv.gpu_driver_date)
        print(
            "  RAM              " + str(inv.ram_installed_gb) + " GB installed, "
            + str(inv.ram_visible_gb) + " GB visible to Windows, "
            + str(inv.ram_free_gb) + " GB free"
        )
        print(
            "  VRAM             " + str(inv.vram_dedicated_gb)
            + " GB carved out of system RAM for the iGPU"
        )
        print(
            "  Battery          " + str(inv.battery_charge_pct) + "% charge, health "
            + str(inv.battery_health_pct) + "% ("
            + str(inv.battery_full_mwh) + " of " + str(inv.battery_design_mwh) + " mWh)"
        )
        print(
            "  Power            " + ("AC" if inv.on_ac else "battery")
            + ("" if inv.on_ac else ", drawing " + str(inv.discharge_mw) + " mW")
        )
        print("  Elevated         " + ("yes" if inv.elevated else "NO"))
        print("  Configuration    " + inv.configuration)
        print()
        print("Displays")
        print("=" * 74)
        for d in inv.displays:
            kind = "internal panel" if d.internal else "external"
            mode = (
                str(d.width) + "x" + str(d.height) + " @ " + str(d.refresh_hz) + " Hz"
                if d.width else "mode not resolvable with multiple displays attached"
            )
            print("  " + (d.manufacturer + " " + d.name).strip() + "  [" + kind + "]")
            print("      " + mode)
        print()
        print("Relevant processes running")
        print("=" * 74)
        print("  " + (", ".join(inv.processes_running) or "none"))
        if inv.warnings:
            print()
            print("Warnings")
            print("=" * 74)
            for w in inv.warnings:
                print("  ! " + w)

    _out(inv.as_dict(), args.json, human)
    return 0


# --------------------------------------------------------------------------- #
# measure


def _print_metrics(m, prefix="  "):
    print(prefix + "frames             " + str(m.frames) + " analysed, " + str(m.dropped) + " dropped")
    print(prefix + "duration           " + format(m.duration_s, ".1f") + " s (after warm-up trim)")
    print(prefix + "1% low frametime   " + format(m.low_1pct_ms, ".2f") + " ms   <- primary")
    print(prefix + "frametime stdev    " + format(m.frame_time_stdev_ms, ".2f") + " ms   <- primary")
    print(prefix + "0.1% low frametime " + format(m.low_0p1pct_ms, ".2f") + " ms")
    print(prefix + "mean frametime     " + format(m.frame_time_mean_ms, ".2f") + " ms")
    print(prefix + "average fps        " + format(m.avg_fps, ".1f"))
    ratio = "n/a" if m.gpu_busy_ratio is None else format(m.gpu_busy_ratio, ".3f")
    print(prefix + "GPU-busy ratio     " + ratio)
    print(prefix + "classification     " + m.classification)
    for n in m.notes:
        print(prefix + "note: " + n)


def _print_telemetry(cap, prefix="  "):
    t = getattr(cap, "telemetry_summary", None)
    if t is None:
        return
    print()
    print("Telemetry")
    print("=" * 74)
    print(prefix + "sources            " + (", ".join(t.sources) or "none"))
    print(prefix + "samples            " + str(t.samples) + " over "
          + format(t.duration_s, ".0f") + " s")
    if t.system_power_w_mean is not None:
        print(prefix + "system power       " + format(t.system_power_w_mean, ".2f")
              + " W mean (whole device, from the battery)")
    if t.package_power_w_mean is not None:
        print(prefix + "APU package power  " + format(t.package_power_w_mean, ".2f")
              + " W mean, " + format(t.package_power_w_max or 0, ".2f") + " W peak")
    if t.cpu_temp_c_mean is not None:
        print(prefix + "CPU temperature    " + format(t.cpu_temp_c_mean, ".1f")
              + " C mean, " + format(t.cpu_temp_c_max or 0, ".1f") + " C peak")
    if t.gpu_clock_mhz_mean is not None:
        print(prefix + "GPU clock          " + format(t.gpu_clock_mhz_mean, ".0f") + " MHz mean")
    if t.battery_pct_start is not None:
        print(prefix + "battery            " + str(t.battery_pct_start) + "% -> "
              + str(t.battery_pct_end) + "%")
    for n in t.notes:
        print(prefix + "note: " + n)


def _present_summary(cap):
    """Present mode and drop rate for a capture.

    Surfaced per run because losing 'Hardware Composed: Independent Flip' is the
    single failure that wrecked the first acceptance test: in the composited
    path the desktop compositor discarded ~half the game's frames, which showed
    up as pacing variance rather than as the plumbing problem it was. A run that
    fell out of independent flip is not comparable to one that did not, and that
    has to be visible at the moment of capture rather than found later.
    """
    frames = cap.frames
    if not frames:
        return "no frames", 0.0, False
    dropped = sum(1 for f in frames if not f.displayed)
    drop_pct = 100.0 * dropped / len(frames)
    counts = {}
    for f in frames:
        counts[f.present_mode] = counts.get(f.present_mode, 0) + 1
    mode, n = max(counts.items(), key=lambda kv: kv[1])
    share = 100.0 * n / len(frames)
    clean = mode.startswith("Hardware") and share > 99.0 and drop_pct < 1.0
    return mode + " " + format(share, ".0f") + "%", drop_pct, clean


def _capture_once(args, inv, label):
    # Telemetry runs alongside the capture rather than around it, so power and
    # temperature are attributable to the same window as the frametimes.
    sampler = sensors.Sampler(interval=args.telemetry_interval).start()
    try:
        cap = runner.capture(
            seconds=args.seconds,
            process_name=args.process,
            output_dir=args.output_dir,
            metrics_version=args.metrics_version,
            label=label,
            configuration=inv.configuration,
        )
    except runner.NoFramesCaptured as e:
        # An expected condition, not a bug in the rig: report it as advice
        # rather than as a traceback. The `finally` below stops the sampler.
        raise SystemExit(str(e))
    finally:
        sampler.stop()
    cap.telemetry = [s.as_dict() for s in sampler.samples]
    cap.telemetry_summary = sampler.summary()
    if not cap.frames:
        raise SystemExit(
            "No frames captured for process " + repr(args.process) + ".\n"
            "PresentMon wrote " + cap.csv_path + " but nothing matched.\n"
            "Check the game is actually running and rendering, and that the process\n"
            "name is right -- run 'allytune measure --process \"\"' to see every\n"
            "application PresentMon attributed frames to."
        )
    m = M.compute(cap.frames, warmup_s=args.warmup)
    return cap, m


def cmd_measure(args) -> int:
    inv = device.collect()
    for w in inv.warnings:
        print("! " + w, file=sys.stderr)

    cap, m = _capture_once(args, inv, args.label or "measure")
    entry = store.record(m, cap, inv, game=args.game, base_dir=args.results_dir)

    def human():
        print()
        print("Capture  " + cap.csv_path)
        print("  configuration    " + cap.configuration)
        print("  schema           PresentMon " + cap.schema + " metrics")
        print("  applications     " + ", ".join(
            k + "=" + str(v) for k, v in sorted(cap.applications.items())
        ))
        print()
        print("Metrics")
        print("=" * 74)
        _print_metrics(m)
        _print_telemetry(cap)

    _out(entry, args.json, human)
    return 0


def cmd_analyze(args) -> int:
    frames, schema = runner.read_csv(args.csv, args.process)
    if not frames:
        raise SystemExit("no frames in " + args.csv + " for process " + repr(args.process))
    m = M.compute(frames, warmup_s=args.warmup)

    def human():
        print(args.csv + "   (PresentMon " + schema + " metrics)")
        print("=" * 74)
        _print_metrics(m)

    _out(m.as_dict(), args.json, human)
    return 0


# --------------------------------------------------------------------------- #
# noise floor -- the acceptance test


def cmd_noisefloor(args) -> int:
    inv = device.collect()
    for w in inv.warnings:
        print("! " + w, file=sys.stderr)

    print()
    print("Noise floor: " + str(args.runs) + " identical runs of " + str(args.seconds) + " s")
    print("=" * 74)
    print("Everything must be identical between runs: same route, same in-game")
    print("settings, same power profile, same display, same charge state.")
    print("The whole point is that the ONLY difference is the rig itself.")
    print()

    delay = getattr(args, "start_delay", 0.0)
    if delay > 0:
        print("Starting in " + str(int(delay)) + " s -- switch into the game and unpause NOW.")
        print("Alt-tabbing drops a game out of independent flip; this is the grace")
        print("period for it to get back in before anything is recorded.")
        for remaining in range(int(delay), 0, -5):
            print("  " + str(remaining) + " s ...", flush=True)
            time.sleep(min(5, remaining))
        print("  capturing now.", flush=True)
        print("", flush=True)

    runs = []
    captures = []
    suspect = []
    for i in range(1, args.runs + 1):
        if not args.no_prompt:
            input("Run " + str(i) + "/" + str(args.runs)
                  + " -- get into position, then press Enter to start capture. ")
        print("  capturing " + str(args.seconds) + " s ...")
        cap, m = _capture_once(args, inv, "noisefloor-" + str(i))
        captures.append(cap)
        runs.append(m)
        mode_desc, drop_pct, clean = _present_summary(cap)
        print("  run " + str(i) + ": 1% low " + format(m.low_1pct_ms, ".2f")
              + " ms, stdev " + format(m.frame_time_stdev_ms, ".2f")
              + " ms, avg " + format(m.avg_fps, ".1f") + " fps, "
              + m.classification)
        print("          present: " + mode_desc + ", "
              + format(drop_pct, ".1f") + "% of presents never displayed")
        if not clean:
            suspect.append(i)
            print("          ** SUSPECT: not cleanly in independent flip. The compositor")
            print("             is discarding frames, so this run measures the display")
            print("             path, not the game.")
        store.record(m, cap, inv, game=args.game,
                     notes="noise floor run " + str(i) + "/" + str(args.runs),
                     base_dir=args.results_dir)
        if i < args.runs and args.cooldown > 0:
            print("  cooling down " + str(args.cooldown) + " s so run "
                  + str(i + 1) + " does not start hotter ...")
            time.sleep(args.cooldown)

    nf = N.compute(runs)
    payload = {
        "runs": [r.as_dict() for r in runs],
        "configuration": inv.configuration,
        "game": args.game,
        "headline_pct": nf.headline_pct,
        "headline_metric": nf.headline_metric,
        "verdict": nf.verdict,
        "suspect_runs": suspect,
        "spreads": [
            {"metric": s.metric, "label": s.label, "values": s.values,
             "mean": s.mean, "range_pct": s.range_pct, "cv_pct": s.cv_pct}
            for s in nf.spreads
        ],
    }
    store.record(runs[-1], captures[-1], inv, game=args.game,
                 notes="NOISE FLOOR " + format(nf.headline_pct, ".2f") + "% ("
                       + nf.headline_metric + ")",
                 base_dir=args.results_dir)

    def human():
        print()
        print(nf.report())
        print()
        print("  Configuration: " + inv.configuration
              + "  -- this floor applies to this configuration only.")
        if suspect:
            print()
            print("  ** " + str(len(suspect)) + " of " + str(args.runs)
                  + " runs (" + ", ".join(str(x) for x in suspect) + ") were not cleanly")
            print("     in independent flip. Treat this floor as measuring the display")
            print("     path rather than the rig. Fix that before trusting the number.")

    _out(payload, args.json, human)
    return 0


# --------------------------------------------------------------------------- #
# runs / doctor / dashboard


def cmd_runs(args) -> int:
    rows = store.load_runs(args.results_dir)
    if args.game:
        rows = [r for r in rows if r.get("game") == args.game]
    rows = rows[-args.limit:]

    def human():
        if not rows:
            print("No runs recorded yet.")
            return
        print("timestamp            config     game            1%low   stdev   avgfps  class")
        print("=" * 92)
        for r in rows:
            m = r.get("metrics", {})
            print(
                r.get("timestamp", "")[:19].ljust(21)
                + str(r.get("configuration", ""))[:10].ljust(11)
                + str(r.get("game", ""))[:15].ljust(16)
                + format(m.get("low_1pct_ms", 0), ".2f").rjust(6) + "  "
                + format(m.get("frame_time_stdev_ms", 0), ".2f").rjust(6) + "  "
                + format(m.get("avg_fps", 0), ".1f").rjust(6) + "  "
                + str(m.get("classification", ""))
            )

    _out(rows, args.json, human)
    return 0


def cmd_games(args) -> int:
    """List the installed library and what is known about each title."""
    from allytune.games import library

    games = library.all_games(installed_only=not args.all)
    if args.game:
        g = library.find(args.game)
        games = [g] if g else []

    def human():
        if not games:
            print("No matching games found.")
            return
        print("Installed games")
        print("=" * 92)
        print("  %-34s %-14s %-10s %-11s %s" % (
            "game", "settings", "benchmark", "bound", "process"))
        print("  " + "-" * 88)
        for g in games:
            bound = g.bound + (" *" if g.measured else "")
            print("  %-34s %-14s %-10s %-11s %s" % (
                g.name[:34], g.settings, g.benchmark, bound, g.process_name))
        print()
        print("  * = measured. Everything else is a hypothesis, not a finding.")
        print()
        if args.verbose:
            for g in games:
                print(g.name)
                print("  exe      " + str(g.full_exe))
                if g.settings_path:
                    print("  settings ~\\" + g.settings_path)
                print("  " + g.notes)
                print()

    _out([g.as_dict() for g in games], args.json, human)
    return 0


def cmd_steam_watch(args) -> int:
    """Watch for Steam games launching and close Steam's window once each does."""
    from allytune.system import steam_watcher
    try:
        steam_watcher.watch(
            poll_interval=args.poll_interval, close_delay=args.close_delay,
        )
    except KeyboardInterrupt:
        print("")
        print("stopped")
    return 0


def cmd_doctor(args) -> int:
    checks = []

    inv = device.collect()
    checks.append(("Python", sys.version.split()[0], True))
    checks.append(("Elevated", "yes" if inv.elevated else "no", inv.elevated))
    try:
        pm = runner.find_presentmon()
        checks.append(("PresentMon", str(pm), True))
    except FileNotFoundError as e:
        checks.append(("PresentMon", str(e), False))

    from allytune.games import uncharted4
    checks.append(("Uncharted 4", str(uncharted4.executable()), uncharted4.installed()))
    checks.append(("Configuration", inv.configuration,
                   inv.configuration in ("handheld", "docked")))
    checks.append(("Power", "AC" if inv.on_ac else "battery "
                   + str(inv.battery_charge_pct) + "%",
                   inv.on_ac or inv.battery_charge_pct >= 50))

    ok = all(c[2] for c in checks)

    def human():
        print("allytune " + __version__ + " -- installation check")
        print("=" * 74)
        for name, detail, good in checks:
            print(("  OK   " if good else "  WARN ") + name.ljust(16) + detail)
        if inv.warnings:
            print()
            for w in inv.warnings:
                print("  ! " + w)

    _out({"ok": ok, "checks": [
        {"name": n, "detail": d, "ok": g} for n, d, g in checks
    ], "warnings": inv.warnings}, args.json, human)
    return 0


def cmd_dashboard(args) -> int:
    from allytune.web.server import serve
    serve(host=args.host, port=args.port, results_dir=args.results_dir)
    return 0


# --------------------------------------------------------------------------- #


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="allytune",
        description="Measure a game properly before tuning it. Phase 1 is read-only.",
    )
    p.add_argument("--version", action="version", version="allytune " + __version__)
    sub = p.add_subparsers(dest="command", required=True)

    def common(sp):
        sp.add_argument("--json", action="store_true", help="machine-readable output")
        sp.add_argument("--results-dir", default=None,
                        help="where runs.jsonl lives (default ~/.allytune)")

    def capture_args(sp):
        sp.add_argument("--seconds", type=float, default=90.0,
                        help="capture length in seconds (default 90)")
        sp.add_argument("--warmup", type=float, default=15.0,
                        help="seconds trimmed off the front (default 15)")
        sp.add_argument("--process", default="u4.exe",
                        help="executable to analyse; empty string means all")
        sp.add_argument("--game", default="Uncharted 4", help="label for the results store")
        sp.add_argument("--output-dir", default="captures", help="where CSVs are written")
        sp.add_argument("--telemetry-interval", type=float, default=2.0,
                        help="seconds between telemetry samples (default 2)")
        sp.add_argument("--start-delay", type=float, default=0.0,
                        help="seconds to wait before the FIRST capture, so you can "
                             "switch into the game and unpause. Alt-tabbing knocks a "
                             "game out of independent flip, and it needs a moment to "
                             "get back into it")
        sp.add_argument("--metrics-version", default="default",
                        choices=["default", "v1", "v2"],
                        help="PresentMon metric set to request")

    sp = sub.add_parser("inventory", help="dump device facts")
    common(sp)
    sp.set_defaults(func=cmd_inventory)

    sp = sub.add_parser("measure", help="capture one run and report its statistics")
    common(sp)
    capture_args(sp)
    sp.add_argument("--label", default="", help="short name for this capture")
    sp.set_defaults(func=cmd_measure)

    sp = sub.add_parser("analyze", help="re-analyse an existing PresentMon CSV")
    common(sp)
    sp.add_argument("csv")
    sp.add_argument("--process", default="u4.exe")
    sp.add_argument("--warmup", type=float, default=15.0)
    sp.set_defaults(func=cmd_analyze)

    sp = sub.add_parser("noisefloor",
                        help="the acceptance test: N identical runs, report the spread")
    common(sp)
    capture_args(sp)
    sp.add_argument("--runs", type=int, default=3, help="how many identical runs (default 3)")
    sp.add_argument("--cooldown", type=float, default=90.0,
                    help="seconds between runs so the chip starts from the same "
                         "thermal state (default 90)")
    sp.add_argument("--no-prompt", action="store_true",
                    help="do not wait for Enter between runs")
    sp.set_defaults(func=cmd_noisefloor)

    sp = sub.add_parser("runs", help="list recorded runs")
    common(sp)
    sp.add_argument("--limit", type=int, default=25)
    sp.add_argument("--game", default=None)
    sp.set_defaults(func=cmd_runs)

    sp = sub.add_parser("games", help="list installed games and what is known about them")
    common(sp)
    sp.add_argument("--all", action="store_true",
                    help="include titles that are not currently installed")
    sp.add_argument("--verbose", action="store_true", help="show paths and notes")
    sp.add_argument("--game", default=None, help="show just one title")
    sp.set_defaults(func=cmd_games)

    sp = sub.add_parser("steam-watch",
                        help="close Steam's window automatically once a game launches")
    sp.add_argument("--poll-interval", type=float, default=2.0,
                    help="seconds between process checks (default 2)")
    sp.add_argument("--close-delay", type=float, default=3.0,
                    help="seconds to wait after detecting a game before "
                         "closing Steam's window (default 3)")
    sp.set_defaults(func=cmd_steam_watch)

    sp = sub.add_parser("doctor", help="check the installation")
    common(sp)
    sp.set_defaults(func=cmd_doctor)

    sp = sub.add_parser("dashboard", help="serve the phone-friendly results page")
    common(sp)
    sp.add_argument("--host", default="0.0.0.0",
                    help="0.0.0.0 makes it reachable from your phone on the same WiFi")
    sp.add_argument("--port", type=int, default=8777)
    sp.set_defaults(func=cmd_dashboard)

    return p


def main(argv=None) -> int:
    # Python line-buffers stdout to a terminal but block-buffers it to a file or
    # pipe. A noisefloor run prints one line every 90 s, so redirected output
    # looked frozen for the whole eight minutes -- indistinguishable from a hung
    # capture, which is the worst possible failure mode for a command you are
    # told to walk away from.
    try:
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except (AttributeError, ValueError):
        pass  # not a real stream (captured in tests); nothing to do

    args = build_parser().parse_args(argv)
    if getattr(args, "process", None) == "":
        args.process = None
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
