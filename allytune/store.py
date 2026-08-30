"""Where run results live.

Phase 1 uses newline-delimited JSON rather than the SQLite store the plan calls
for in phase 3. The reason is that phase 1's job is to be *auditable*: a plain
text file that can be opened, diffed and eyeballed makes it much easier to catch
the rig lying to us, which is the entire risk this phase exists to retire.
Migrating to SQLite later is a read-and-insert loop.

One line per run. Append-only. Nothing is ever rewritten in place, so a crashed
session loses at most the run in flight.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

DEFAULT_DIR = Path.home() / ".allytune"
RUNS_FILE = "runs.jsonl"


def results_dir(explicit: str | os.PathLike | None = None) -> Path:
    d = Path(explicit) if explicit else DEFAULT_DIR
    d.mkdir(parents=True, exist_ok=True)
    return d


def record(
    metrics,
    capture,
    inventory=None,
    game: str = "",
    notes: str = "",
    base_dir: str | os.PathLike | None = None,
) -> dict:
    """Append one run and return the record that was written."""
    d = results_dir(base_dir)
    inv = inventory.as_dict() if inventory is not None and hasattr(inventory, "as_dict") else {}
    entry = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "epoch": time.time(),
        "game": game,
        "label": getattr(capture, "label", ""),
        "configuration": getattr(capture, "configuration", "unknown"),
        "notes": notes,
        "capture": {
            "csv": getattr(capture, "csv_path", ""),
            "seconds": getattr(capture, "seconds", 0),
            "schema": getattr(capture, "schema", ""),
            "metrics_version": getattr(capture, "metrics_version", ""),
            "process_name": getattr(capture, "process_name", None),
            "applications": getattr(capture, "applications", {}),
        },
        "metrics": metrics.as_dict(),
        "device": {
            "configuration": inv.get("configuration", ""),
            "on_ac": inv.get("on_ac"),
            "battery_charge_pct": inv.get("battery_charge_pct"),
            "gpu_driver": inv.get("gpu_driver", ""),
            "bios": inv.get("bios", ""),
            "elevated": inv.get("elevated"),
            "warnings": inv.get("warnings", []),
        },
    }
    with open(d / RUNS_FILE, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry) + "\n")
    return entry


def load_runs(base_dir: str | os.PathLike | None = None) -> list:
    """Read every recorded run, newest last.

    Malformed lines are skipped rather than raising: a half-written final line
    from an interrupted session should not make the whole history unreadable.
    """
    path = results_dir(base_dir) / RUNS_FILE
    if not path.is_file():
        return []
    runs = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                runs.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return runs
