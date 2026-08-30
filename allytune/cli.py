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


def _capture_once(args, inv, label):
    cap = runner.capture(
        seconds=args.seconds,
        process_name=args.process,
        output_dir=args.output_dir,
        metrics_version=args.metrics_version,
        label=label,
        configuration=inv.configuration,
    )
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

    runs = []
    captures = []
    for i in range(1, args.runs + 1):
        if not args.no_prompt:
            input("Run " + str(i) + "/" + str(args.runs)
                  + " -- get into position, then press Enter to start capture. ")
        print("  capturing " + str(args.seconds) + " s ...")
        cap, m = _capture_once(args, inv, "noisefloor-" + str(i))
        captures.append(cap)
        runs.append(m)
        print("  run " + str(i) + ": 1% low " + format(m.low_1pct_ms, ".2f")
              + " ms, stdev " + format(m.frame_time_stdev_ms, ".2f")
              + " ms, avg " + format(m.avg_fps, ".1f") + " fps, "
              + m.classification)
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
        sp.add_argument("--metrics-version", default="v2", choices=["v1", "v2"],
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
    args = build_parser().parse_args(argv)
    if getattr(args, "process", None) == "":
        args.process = None
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
