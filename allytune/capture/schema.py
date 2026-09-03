"""Canonical frame schema, and the mapping from PresentMon's CSV columns onto it.

PresentMon 2.5.1 emits **three** different column sets, not two. This was
established by running the pinned binary three ways on the Ally X on 2026-08-30
and reading the headers back; it is not from documentation, and it contradicts
the project's earlier assumptions in both directions.

  default (no flag)   TimeInMs, MsBetweenPresents, MsGPUBusy, MsCPUBusy, ...
  --v2_metrics        CPUStartTime, FrameTime, GPUBusy, CPUBusy, DisplayedTime
  --v1_metrics        TimeInSeconds, msBetweenPresents, msGPUActive, Dropped

The handoff brief predicted 'FrameTime'/'GPUBusy' for 2.x and
'msBetweenPresents'/'msGPUActive' for 1.x. Both are real, but they belong to
*different invocations of the same binary* -- and the default output, which is
what you get if you pass no metrics flag at all, matches neither. A tool that
detected only two schemas would parse the common case as an error.

Two further traps, both found the same way:

  - Every CSV carries a UTF-8 BOM, so the first column reads as '\\ufeffApplication'
    unless the file is opened as utf-8-sig. This silently breaks Application and
    ProcessID lookups while leaving the numeric columns working.
  - Time units differ. TimeInSeconds is seconds; TimeInMs and CPUStartTime are
    both milliseconds -- verified by checking that the timestamp span of a
    capture matched the summed frame times.

This module is pure Python and imports nothing platform-specific, so the parsing
rules can be unit-tested off the device.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Iterator, Sequence

# Values PresentMon writes when a quantity does not apply to a frame.
_NULL_TOKENS = {"NA", "N/A", "", "-"}

# UTF-8 BOM, as it appears once the file has been decoded as plain utf-8.
BOM = "﻿"


@dataclass(frozen=True)
class Frame:
    """One present, normalised across PresentMon schema variants.

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
    """Raised when a CSV header matches no known PresentMon schema."""


@dataclass(frozen=True)
class _Map:
    name: str
    time: str
    time_scale: float      # multiply the raw timestamp by this to get seconds
    frame_time: str
    gpu_busy: str | None
    cpu_busy: str | None
    displayed: str | None  # column that is null for a frame that never displayed
    dropped: str | None    # explicit dropped flag, v1 only


# Ordered most-specific first. Detection keys off the frame-time column, which
# is the one column present in every variant.
SCHEMAS = (
    _Map(
        name="default",
        time="TimeInMs", time_scale=0.001,
        frame_time="MsBetweenPresents",
        gpu_busy="MsGPUBusy", cpu_busy="MsCPUBusy",
        displayed="MsUntilDisplayed", dropped=None,
    ),
    _Map(
        name="v2",
        time="CPUStartTime", time_scale=0.001,
        frame_time="FrameTime",
        gpu_busy="GPUBusy", cpu_busy="CPUBusy",
        displayed="DisplayedTime", dropped=None,
    ),
    _Map(
        name="v1",
        time="TimeInSeconds", time_scale=1.0,
        frame_time="msBetweenPresents",
        gpu_busy="msGPUActive", cpu_busy=None,
        displayed="msUntilDisplayed", dropped="Dropped",
    ),
)

_BY_NAME = {s.name: s for s in SCHEMAS}


def strip_bom(names: Iterable[str]) -> list[str]:
    """Remove the UTF-8 BOM from a header row.

    Belt and braces: call sites should open the file as utf-8-sig, but a CSV
    handed to us from elsewhere may not have been, and a BOM on the first column
    name is invisible in a printed header and maddening to diagnose.
    """
    return [(n or "").lstrip(BOM) for n in names]


def detect_schema(header: Sequence[str]) -> str:
    """Return the schema name for a PresentMon CSV header.

    Matching is case-sensitive on purpose. 'msBetweenPresents' and
    'MsBetweenPresents' differ only in case and belong to schemas whose
    timestamps are in different units, so a case-insensitive match would pick
    the wrong one and silently scale every duration by 1000.
    """
    cols = set(strip_bom(header))
    for s in SCHEMAS:
        if s.frame_time in cols:
            return s.name
    raise SchemaError(
        "CSV header matches no known PresentMon schema. Expected one of "
        + ", ".join(repr(s.frame_time) for s in SCHEMAS)
        + "; got columns: " + str(sorted(cols))
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


def _was_displayed(row: dict, m: _Map) -> bool:
    """Whether the frame reached the screen.

    v1 carries an explicit `Dropped` flag. The 2.x variants do not, so a frame
    counts as displayed only when its display-time column holds a real number --
    PresentMon writes NA there for a present that never made it to the screen.
    """
    if m.dropped:
        raw = row.get(m.dropped)
        if raw is not None and raw.strip() not in _NULL_TOKENS:
            try:
                return int(float(raw)) == 0
            except ValueError:
                pass
    if not m.displayed:
        return True
    return _num(row.get(m.displayed)) is not None


def parse_rows(rows: Iterable[dict], schema: str | None = None) -> Iterator[Frame]:
    """Convert PresentMon CSV rows (as dicts) into canonical Frames.

    Rows whose frame time is missing or non-positive are skipped: they carry no
    pacing information, and a zero would poison every downstream statistic.
    """
    it = iter(rows)
    first = next(it, None)
    if first is None:
        return

    # Keys may still carry the BOM if the caller opened the file as plain utf-8.
    if any(k and k.startswith(BOM) for k in first.keys()):
        first = {(k or "").lstrip(BOM): v for k, v in first.items()}
        it = ({(k or "").lstrip(BOM): v for k, v in r.items()} for r in it)

    m = _BY_NAME[schema] if schema else _BY_NAME[detect_schema(list(first.keys()))]

    for row in _chain(first, it):
        frame_time = _num(row.get(m.frame_time))
        if frame_time is None or frame_time <= 0:
            continue
        t = _num(row.get(m.time))
        try:
            pid = int(float(row.get("ProcessID") or 0))
        except ValueError:
            pid = 0
        yield Frame(
            time_s=(t * m.time_scale) if t is not None else 0.0,
            frame_time_ms=frame_time,
            gpu_busy_ms=_num(row.get(m.gpu_busy)) if m.gpu_busy else None,
            cpu_busy_ms=_num(row.get(m.cpu_busy)) if m.cpu_busy else None,
            displayed=_was_displayed(row, m),
            app=(row.get("Application") or "").strip(),
            pid=pid,
            present_mode=(row.get("PresentMode") or "").strip(),
        )


def _chain(first, rest):
    yield first
    yield from rest
