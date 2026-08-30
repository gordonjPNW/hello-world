"""Canonical frame schema, and the mapping from PresentMon's CSV columns onto it.

PresentMon changed its column names between 1.x and 2.x. Both are still emitted by
the 2.x binary (`--v1_metrics` / `--v2_metrics`), so we cannot assume either. The
names below were read off PresentMon 2.5.1 running on the Ally X rather than taken
from documentation -- see docs/allytune/04-phase1-results.md.

This module is pure Python and imports nothing platform-specific, so the parsing
rules can be unit-tested off the device.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Iterator, Sequence

# Values PresentMon writes when a quantity does not apply to a frame.
_NULL_TOKENS = {"NA", "N/A", "", "-"}


@dataclass(frozen=True)
class Frame:
    """One present, normalised across PresentMon schema versions.

    Times are milliseconds; `time_s` is seconds since capture start.
    `gpu_busy_ms` is None when GPU tracking was unavailable for the frame, which
    is different from zero and must not be averaged as zero.
    """

    time_s: float
    frame_time_ms: float
    gpu_busy_ms: float | None
    cpu_busy_ms: float | None
    displayed: bool
    app: str
    pid: int
    present_mode: str


class SchemaError(ValueError):
    """Raised when a CSV header matches neither known PresentMon schema."""


# Canonical name -> the column that carries it, per schema version.
# Only the columns allytune actually consumes are listed.
_V1 = {
    "time": "TimeInSeconds",
    "frame_time": "msBetweenPresents",
    "gpu_busy": "msGPUActive",
    "cpu_busy": None,  # v1 has no CPU-busy column
    "displayed": "msUntilDisplayed",
    "dropped": "Dropped",
}

_V2 = {
    "time": "TimeInMs",
    "frame_time": "MsBetweenPresents",
    "gpu_busy": "MsGPUBusy",
    "cpu_busy": "MsCPUBusy",
    "displayed": "MsUntilDisplayed",
    "dropped": None,  # v2 has no Dropped column; inferred from MsUntilDisplayed
}


def detect_schema(header: Sequence[str]) -> str:
    """Return 'v1' or 'v2' for a PresentMon CSV header.

    Detection keys off the frame-time column, which is the one column guaranteed
    present in every PresentMon CSV and which differs in case between versions.
    Matching is case-sensitive on purpose: the versions differ *only* by case
    ('msBetweenPresents' vs 'MsBetweenPresents'), so a case-insensitive match
    would silently conflate them and pick the wrong time unit.
    """
    cols = set(header)
    if _V2["frame_time"] in cols:
        return "v2"
    if _V1["frame_time"] in cols:
        return "v1"
    raise SchemaError(
        "CSV header matches neither PresentMon 1.x nor 2.x. "
        f"Expected one of {_V1['frame_time']!r} or {_V2['frame_time']!r}; "
        f"got columns: {sorted(cols)}"
    )


def _num(value: str | None) -> float | None:
    """Parse a PresentMon numeric cell, mapping its null tokens to None."""
    if value is None:
        return None
    v = value.strip()
    if v in _NULL_TOKENS:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _was_displayed(row: dict, schema: str) -> bool:
    """Whether the frame reached the screen.

    v1 carries an explicit `Dropped` flag. v2 dropped it, so a frame counts as
    displayed only when `MsUntilDisplayed` holds a real number -- PresentMon
    writes NA there for a present that never made it to the display.
    """
    if schema == "v1":
        dropped = row.get(_V1["dropped"])
        if dropped is not None and dropped.strip() not in _NULL_TOKENS:
            try:
                return int(float(dropped)) == 0
            except ValueError:
                pass
    return _num(row.get(_V2["displayed"] if schema == "v2" else _V1["displayed"])) is not None


def parse_rows(rows: Iterable[dict], schema: str | None = None) -> Iterator[Frame]:
    """Convert PresentMon CSV rows (as dicts) into canonical Frames.

    Rows whose frame time is missing or non-positive are skipped: they carry no
    pacing information and a zero would poison every downstream statistic.
    """
    rows = iter(rows)
    first = next(rows, None)
    if first is None:
        return
    if schema is None:
        schema = detect_schema(list(first.keys()))
    m = _V2 if schema == "v2" else _V1
    time_divisor = 1000.0 if schema == "v2" else 1.0  # v2 reports ms, v1 seconds

    for row in _chain(first, rows):
        frame_time = _num(row.get(m["frame_time"]))
        if frame_time is None or frame_time <= 0:
            continue
        t = _num(row.get(m["time"]))
        try:
            pid = int(float(row.get("ProcessID") or 0))
        except ValueError:
            pid = 0
        yield Frame(
            time_s=(t / time_divisor) if t is not None else 0.0,
            frame_time_ms=frame_time,
            gpu_busy_ms=_num(row.get(m["gpu_busy"])) if m["gpu_busy"] else None,
            cpu_busy_ms=_num(row.get(m["cpu_busy"])) if m["cpu_busy"] else None,
            displayed=_was_displayed(row, schema),
            app=(row.get("Application") or "").strip(),
            pid=pid,
            present_mode=(row.get("PresentMode") or "").strip(),
        )


def _chain(first, rest):
    yield first
    yield from rest
