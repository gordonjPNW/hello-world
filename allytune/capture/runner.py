"""Driving the PresentMon binary and reading back what it captured.

Pinned to PresentMon 2.5.1 (SHA-256 recorded in docs/allytune/04-phase1-results.md).
Version matters: the CSV column names differ between 1.x and 2.x, and 2.x can be
asked for either set, so the version and the requested metric set are both
recorded with every capture rather than inferred later.
"""

from __future__ import annotations

import csv
import os
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path

from allytune.capture.schema import Frame, detect_schema, parse_rows

PRESENTMON_VERSION = "2.5.1"
PRESENTMON_EXE = "PresentMon-2.5.1-x64.exe"
PRESENTMON_SHA256 = "9BEC3083069F58F911E6A512F4806DB51A27BD096103087BC1D05EF54C80A191"


class NoFramesCaptured(RuntimeError):
    """PresentMon ran successfully but saw no presents.

    Its own signal for this is the *absence* of the output file, together
    with a zero exit code and a cheerful "Stopped recording." Given its own
    exception type because it is an expected operating condition -- the game
    was not drawing -- and not a fault in the rig.
    """


def find_presentmon(explicit: str | None = None) -> Path:
    """Locate the pinned PresentMon binary.

    Searched rather than configured because the tool lives in the repo, so a
    fresh clone works with no setup step. An explicit path always wins, which is
    what makes it possible to test against another version deliberately.
    """
    if explicit:
        p = Path(explicit)
        if not p.is_file():
            raise FileNotFoundError("PresentMon not found at " + str(p))
        return p
    here = Path(__file__).resolve()
    for parent in here.parents:
        cand = parent / "tools" / PRESENTMON_EXE
        if cand.is_file():
            return cand
    raise FileNotFoundError(
        "Could not find " + PRESENTMON_EXE + " in a 'tools' directory above "
        + str(here) + ". Run scripts/bootstrap-ally.ps1 to download it."
    )


@dataclass
class Capture:
    """One capture: the frames, plus everything needed to trust them later."""

    frames: list
    csv_path: str
    seconds: float
    process_name: str | None
    metrics_version: str
    schema: str
    started_at: float
    configuration: str = "unknown"
    label: str = ""
    telemetry: list = field(default_factory=list)
    telemetry_summary: object = None
    stderr: str = ""

    @property
    def applications(self) -> dict:
        counts: dict = {}
        for f in self.frames:
            counts[f.app] = counts.get(f.app, 0) + 1
        return counts


def read_csv(path: str | os.PathLike, process_name: str | None = None) -> tuple[list, str]:
    """Parse a PresentMon CSV into Frames, optionally keeping one process.

    Filtering here rather than via --process_name matters when running
    unelevated: PresentMon may not resolve every process name at trace level,
    but the rows it does attribute are still correct, and a post-hoc filter on
    the CSV cannot miss frames the way a trace-level filter can.
    """
    # utf-8-sig, not utf-8: every PresentMon CSV carries a BOM, which would
    # otherwise attach to the first column name and break Application lookups
    # while leaving the numeric columns working -- a silent, confusing failure.
    with open(path, "r", newline="", encoding="utf-8-sig", errors="replace") as fh:
        reader = csv.DictReader(fh)
        if reader.fieldnames is None:
            raise ValueError("empty PresentMon CSV: " + str(path))
        schema = detect_schema(reader.fieldnames)
        frames = list(parse_rows(reader, schema))

    if process_name:
        want = process_name.lower()
        frames = [f for f in frames if f.app.lower() == want]
    return frames, schema


def capture(
    seconds: float,
    process_name: str | None = None,
    output_dir: str | os.PathLike = ".",
    metrics_version: str = "default",
    presentmon: str | None = None,
    label: str = "",
    configuration: str = "unknown",
) -> Capture:
    """Record `seconds` of frame data and return it parsed.

    PresentMon is asked to terminate itself after the timed window rather than
    being killed, so the CSV is flushed and complete. A killed PresentMon
    routinely leaves a truncated final row, which then parses as a bogus frame
    time and lands in the 0.1% low -- precisely the statistic we care most about.
    """
    exe = find_presentmon(presentmon)
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    slug = (label or process_name or "capture").replace(" ", "_")
    csv_path = out_dir / (stamp + "-" + slug + ".csv")

    cmd = [
        str(exe),
        "--timed", str(int(seconds)),
        "--terminate_after_timed",
        "--output_file", str(csv_path),
        "--no_console_stats",
        "--stop_existing_session",
    ]
    # 'default' means pass no metrics flag at all, which is its own schema --
    # richer than either explicit set, since it carries MsBetweenDisplayChange
    # and MsUntilDisplayed alongside the GPU and CPU busy times.
    if metrics_version in ("v1", "v2"):
        cmd.append("--" + metrics_version + "_metrics")
    # --process_name is only added when elevated; unelevated it can silently
    # capture nothing. We filter the CSV afterwards instead, which is equivalent
    # for our purposes and cannot fail closed.
    started = time.time()
    proc = subprocess.run(
        cmd, capture_output=True, text=True, timeout=seconds + 120
    )
    if not csv_path.is_file():
        # PresentMon writes no file at all when it saw zero presents, and still
        # exits 0 saying "Started recording / Stopped recording". Verified on
        # device. Almost always this means nothing was rendering: the game was
        # minimised, on a loading screen, or never brought to the foreground.
        raise NoFramesCaptured(
            "PresentMon captured no frames, so it wrote no CSV.\n"
            "\n"
            "This nearly always means nothing was rendering during the capture\n"
            "window. Check that:\n"
            "  - the game is running and in the foreground, not minimised\n"
            "  - it is actually drawing, not sitting on a loading screen\n"
            "  - you are not looking at a blanked screen\n"
            "\n"
            "PresentMon exited " + str(proc.returncode) + " and said:\n"
            + (proc.stdout or "").strip() + "\n"
            + (proc.stderr or "").strip() + "\n"
            "\nCommand: " + " ".join(cmd)
        )

    frames, schema = read_csv(csv_path, process_name)
    return Capture(
        frames=frames,
        csv_path=str(csv_path),
        seconds=seconds,
        process_name=process_name,
        metrics_version=metrics_version,
        schema=schema,
        started_at=started,
        configuration=configuration,
        label=label,
        stderr=(proc.stderr or "").strip(),
    )
