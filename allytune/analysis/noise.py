"""The noise floor: how small a difference this rig can actually resolve.

Three identical captures, same route, same settings, same power profile. The
spread across them is the resolution limit of the whole session. Any later
result smaller than it is not a finding -- it is the rig breathing.

Why this module exists at all is the point of the project: an ordinary tuning
change is worth 5-15%, and a session that cannot resolve that will still happily
produce confident-sounding conclusions. This is the check that stops it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence
import statistics

from allytune.analysis.metrics import Metrics

# The brief's thresholds.
GOOD_BELOW_PCT = 3.0
BROKEN_AT_PCT = 5.0

# Metrics the verdict is allowed to rest on. Average fps is deliberately absent:
# it is the least sensitive of the four and would flatter the result.
PACING_METRICS = ("low_1pct_ms", "frame_time_stdev_ms", "frame_time_mean_ms")

_LABELS = {
    "low_1pct_ms": "1% low frametime",
    "low_0p1pct_ms": "0.1% low frametime",
    "frame_time_stdev_ms": "frametime stdev",
    "frame_time_mean_ms": "mean frametime",
    "avg_fps": "average fps",
    "gpu_busy_ratio": "GPU-busy ratio",
}


@dataclass
class Spread:
    """Run-to-run variation in one metric."""

    metric: str
    label: str
    values: list[float]
    mean: float
    stdev: float
    range_pct: float   # (max - min) / mean, the conservative headline
    cv_pct: float      # stdev / mean, the statistical one

    def line(self) -> str:
        vals = ", ".join(f"{v:.3f}" for v in self.values)
        return (
            f"{self.label:<22} mean {self.mean:8.3f}  "
            f"spread {self.range_pct:5.2f}%  cv {self.cv_pct:5.2f}%   [{vals}]"
        )


@dataclass
class NoiseFloor:
    spreads: list[Spread]
    headline_pct: float
    headline_metric: str
    verdict: str
    runs: int

    def report(self) -> str:
        out = [
            f"Noise floor from {self.runs} identical runs",
            "=" * 74,
        ]
        out += ["  " + s.line() for s in self.spreads]
        out += [
            "",
            f"  Headline: {self.headline_pct:.2f}% "
            f"(worst pacing metric: {_LABELS.get(self.headline_metric, self.headline_metric)})",
            f"  Verdict:  {self.verdict}",
        ]
        return "\n".join(out)


def _spread(metric: str, values: Sequence[float]) -> Spread:
    mean = statistics.fmean(values)
    stdev = statistics.stdev(values) if len(values) > 1 else 0.0
    rng = (max(values) - min(values)) / mean * 100 if mean else 0.0
    cv = stdev / mean * 100 if mean else 0.0
    return Spread(metric, _LABELS.get(metric, metric), list(values), mean, stdev, rng, cv)


def compute(runs: Sequence[Metrics]) -> NoiseFloor:
    """Compare repeat runs of an identical configuration.

    The headline is the *worst* spread among the pacing metrics, not the average
    of them. If the rig cannot hold the 1% low steady, it cannot resolve a
    change in the 1% low, regardless of how steady mean frametime looks.
    """
    if len(runs) < 2:
        raise ValueError(f"need at least 2 runs to measure a spread; got {len(runs)}")

    reported = list(PACING_METRICS) + ["low_0p1pct_ms", "avg_fps"]
    spreads = []
    for m in reported:
        values = [getattr(r, m) for r in runs]
        if any(v is None for v in values):
            continue
        spreads.append(_spread(m, values))

    pacing = [s for s in spreads if s.metric in PACING_METRICS]
    worst = max(pacing, key=lambda s: s.range_pct)

    if worst.range_pct < GOOD_BELOW_PCT:
        verdict = (
            f"USABLE -- under {GOOD_BELOW_PCT:.0f}%. The rig resolves a 5% effect. "
            "Changes larger than the headline are real; smaller ones are not."
        )
    elif worst.range_pct < BROKEN_AT_PCT:
        verdict = (
            f"MARGINAL -- between {GOOD_BELOW_PCT:.0f}% and {BROKEN_AT_PCT:.0f}%. "
            "Only large effects are trustworthy. Reduce variance before sweeping settings."
        )
    else:
        verdict = (
            f"NOT USABLE -- at or above {BROKEN_AT_PCT:.0f}%, which is the size of the "
            "effects being hunted. Phase 1 is not done. Find the variance and kill it."
        )

    return NoiseFloor(
        spreads=spreads,
        headline_pct=worst.range_pct,
        headline_metric=worst.metric,
        verdict=verdict,
        runs=len(runs),
    )
