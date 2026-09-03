"""Frametime statistics and bottleneck classification.

Pure functions over `Frame` sequences. No I/O, no platform calls -- this is the
part of allytune that has to be trustworthy, so it is the part that is tested.

The metric ranking here is deliberate and comes from docs/allytune/00-plan.md:
the target is a 40 fps cap, and what is *felt* at a cap is pacing, not average
framerate. So the primary number is the 1% low frametime and the frametime
standard deviation; average fps is reported but is the weakest of the four.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import asdict, dataclass, field
from typing import Sequence

from allytune.capture.schema import Frame

# GPU-busy ratio thresholds, from the plan's classification table.
GPU_BOUND_AT = 0.95
CPU_BOUND_BELOW = 0.85

# A capture is treated as cap-bound when this fraction of frames sit within
# CAP_TOLERANCE_MS of the modal frame time -- a frame limiter produces a very
# tight distribution that would otherwise read as a healthy GPU-bound run.
CAP_SHARE = 0.80
CAP_TOLERANCE_MS = 0.7

# Slack on the warm-up boundary comparison; see trim_warmup.
BOUNDARY_TOLERANCE_S = 1e-6


@dataclass
class Metrics:
    """Everything phase 1 measures about one capture."""

    frames: int
    dropped: int
    duration_s: float
    avg_fps: float
    frame_time_mean_ms: float
    frame_time_stdev_ms: float
    frame_time_p99_ms: float          # single 99th-percentile point
    low_1pct_ms: float                # mean of the worst 1% of frames
    low_0p1pct_ms: float              # mean of the worst 0.1% -- streaming hitches
    gpu_busy_ratio: float | None
    classification: str
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return asdict(self)


def trim_warmup(frames: Sequence[Frame], warmup_s: float) -> list[Frame]:
    """Drop the first `warmup_s` seconds of a capture.

    Shader compilation, asset streaming and clock ramp all live in this window
    and none of them are the thing under test. The plan fixes this at 15 s.

    The boundary is compared with a microsecond of slack. Without it, a frame
    sitting exactly on the cutoff is kept or dropped depending on floating-point
    noise in the timestamps, which makes the trim non-deterministic across runs
    -- variance introduced by the analysis is exactly what this project cannot
    afford. A microsecond is far below any real frame time, so the slack cannot
    swallow a frame that genuinely belongs to the warm-up.
    """
    if not frames or warmup_s <= 0:
        return list(frames)
    start = frames[0].time_s + warmup_s - BOUNDARY_TOLERANCE_S
    return [f for f in frames if f.time_s >= start]


def _worst_mean(sorted_desc: Sequence[float], fraction: float) -> float:
    """Mean of the worst `fraction` of frame times.

    Averaged rather than taken as a single percentile point because a single
    point is jumpy across repeat runs, and this number's whole job is to be
    compared across repeat runs.  Always includes at least one frame.
    """
    n = max(1, int(math.ceil(len(sorted_desc) * fraction)))
    return statistics.fmean(sorted_desc[:n])


def _percentile(sorted_asc: Sequence[float], q: float) -> float:
    """Linear-interpolated percentile, q in [0, 1]."""
    if len(sorted_asc) == 1:
        return sorted_asc[0]
    pos = q * (len(sorted_asc) - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(sorted_asc) - 1)
    return sorted_asc[lo] + (sorted_asc[hi] - sorted_asc[lo]) * (pos - lo)


def _classify(gpu_ratio: float | None, times: Sequence[float], notes: list[str]) -> str:
    """Name the bottleneck.

    Cap detection runs first: a frame-limited capture can show any GPU-busy
    ratio, and calling it 'GPU-bound' would send a tuning session off to buy
    headroom it already has.
    """
    if len(times) >= 20:
        mode_ms = statistics.median(times)
        near = sum(1 for t in times if abs(t - mode_ms) <= CAP_TOLERANCE_MS)
        if near / len(times) >= CAP_SHARE:
            fps = 1000.0 / mode_ms if mode_ms else 0.0
            notes.append(
                f"frame times cluster tightly at {mode_ms:.2f} ms (~{fps:.0f} fps): "
                "looks frame-limited, so this capture measures the cap, not the chip"
            )
            return "cap-bound"

    if gpu_ratio is None:
        notes.append("no GPU-busy data in this capture; cannot classify")
        return "unknown"
    if gpu_ratio > GPU_BOUND_AT:
        return "GPU-bound"
    if gpu_ratio < CPU_BOUND_BELOW:
        return "CPU-bound or present-blocked"
    return "mixed"


def compute(frames: Sequence[Frame], warmup_s: float = 15.0) -> Metrics:
    """Reduce a capture to its statistics.

    Dropped frames are excluded from the timing statistics and counted
    separately: they are real, but a present that never reached the screen has
    no pacing to contribute and including it distorts the distribution.
    """
    notes: list[str] = []
    trimmed = trim_warmup(frames, warmup_s)
    if not trimmed:
        raise ValueError(
            f"nothing left after trimming {warmup_s:.0f}s of warm-up "
            f"from {len(frames)} frames -- capture too short"
        )

    dropped = sum(1 for f in trimmed if not f.displayed)
    shown = [f for f in trimmed if f.displayed]
    if not shown:
        raise ValueError("every frame in the capture was dropped; nothing to measure")

    times = [f.frame_time_ms for f in shown]
    asc = sorted(times)
    desc = list(reversed(asc))

    duration = sum(times) / 1000.0
    avg_fps = len(times) / duration if duration > 0 else 0.0

    # GPU-busy ratio: summed rather than averaged per frame, so long frames
    # weight the result correctly. Frames missing GPU data are left out of both
    # sides of the ratio rather than counted as zero busy.
    paired = [(f.gpu_busy_ms, f.frame_time_ms) for f in shown if f.gpu_busy_ms is not None]
    if paired:
        gpu_sum = sum(g for g, _ in paired)
        ft_sum = sum(t for _, t in paired)
        gpu_ratio = gpu_sum / ft_sum if ft_sum > 0 else None
        if len(paired) < len(shown) * 0.9:
            notes.append(
                f"GPU-busy data present on only {len(paired)}/{len(shown)} frames; "
                "ratio computed from the subset"
            )
    else:
        gpu_ratio = None

    if dropped:
        notes.append(f"{dropped} dropped frame(s) excluded from timing statistics")

    return Metrics(
        frames=len(shown),
        dropped=dropped,
        duration_s=duration,
        avg_fps=avg_fps,
        frame_time_mean_ms=statistics.fmean(times),
        frame_time_stdev_ms=statistics.stdev(times) if len(times) > 1 else 0.0,
        frame_time_p99_ms=_percentile(asc, 0.99),
        low_1pct_ms=_worst_mean(desc, 0.01),
        low_0p1pct_ms=_worst_mean(desc, 0.001),
        gpu_busy_ratio=gpu_ratio,
        classification=_classify(gpu_ratio, times, notes),
        notes=notes,
    )
