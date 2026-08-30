"""Tests for the metrics and the noise floor.

These are the numbers every downstream conclusion rests on, so the tests are
written against hand-computable cases rather than golden files.
"""

import unittest

from allytune.analysis import metrics as M
from allytune.analysis import noise as N
from allytune.capture.schema import Frame


def frames(times_ms, gpu_ms=None, displayed=None, start=0.0):
    """Build a synthetic capture with a running timestamp."""
    out = []
    t = start
    for i, ft in enumerate(times_ms):
        out.append(Frame(
            time_s=t,
            frame_time_ms=ft,
            gpu_busy_ms=None if gpu_ms is None else gpu_ms[i],
            cpu_busy_ms=None,
            displayed=True if displayed is None else displayed[i],
            app="u4.exe",
            pid=1,
            present_mode="Hardware Composed: Independent Flip",
        ))
        t += ft / 1000.0
    return out


class TestWarmup(unittest.TestCase):
    def test_trims_by_time_not_frame_count(self):
        """Warm-up is a duration, not a frame count.

        A slow warm-up produces fewer frames per second, so trimming a fixed
        number of frames would remove a different amount of time on every run --
        which is variance injected by the analysis itself.
        """
        f = frames([100.0] * 20)  # 100 ms each -> 2 s total
        kept = M.trim_warmup(f, warmup_s=1.0)
        self.assertEqual(len(kept), 10)

    def test_zero_warmup_keeps_everything(self):
        f = frames([10.0] * 5)
        self.assertEqual(len(M.trim_warmup(f, 0)), 5)

    def test_over_trimming_raises_rather_than_returning_garbage(self):
        with self.assertRaises(ValueError):
            M.compute(frames([10.0] * 10), warmup_s=60.0)


class TestMetrics(unittest.TestCase):
    def test_mean_and_fps_on_a_steady_capture(self):
        m = M.compute(frames([25.0] * 100), warmup_s=0)
        self.assertAlmostEqual(m.frame_time_mean_ms, 25.0, places=6)
        self.assertAlmostEqual(m.avg_fps, 40.0, places=6)
        self.assertAlmostEqual(m.frame_time_stdev_ms, 0.0, places=6)

    def test_1pct_low_is_mean_of_worst_one_percent(self):
        """99 frames at 10 ms and one at 100 ms: the worst 1% is that one frame."""
        m = M.compute(frames([10.0] * 99 + [100.0]), warmup_s=0)
        self.assertAlmostEqual(m.low_1pct_ms, 100.0, places=6)

    def test_1pct_low_averages_when_more_than_one_frame_qualifies(self):
        times = [10.0] * 198 + [50.0, 30.0]
        m = M.compute(frames(times), warmup_s=0)
        # 1% of 200 frames = 2 frames: the 50 and the 30.
        self.assertAlmostEqual(m.low_1pct_ms, 40.0, places=6)

    def test_0p1pct_low_catches_the_single_worst_hitch(self):
        times = [10.0] * 999 + [250.0]
        m = M.compute(frames(times), warmup_s=0)
        self.assertAlmostEqual(m.low_0p1pct_ms, 250.0, places=6)

    def test_dropped_frames_counted_but_excluded_from_timings(self):
        times = [10.0] * 10 + [999.0]
        disp = [True] * 10 + [False]
        m = M.compute(frames(times, displayed=disp), warmup_s=0)
        self.assertEqual(m.dropped, 1)
        self.assertEqual(m.frames, 10)
        self.assertAlmostEqual(m.frame_time_mean_ms, 10.0, places=6)

    def test_all_dropped_raises(self):
        with self.assertRaises(ValueError):
            M.compute(frames([10.0] * 5, displayed=[False] * 5), warmup_s=0)


class TestGpuBusyRatio(unittest.TestCase):
    def test_ratio_is_sum_weighted_not_frame_averaged(self):
        """One long frame must count more than one short frame.

        Averaging per-frame ratios would give a 100 ms stall the same weight as
        a 5 ms frame, understating how much of the wall clock the GPU was idle.
        """
        times = [10.0, 90.0]
        gpu = [10.0, 45.0]          # 55 ms busy out of 100 ms
        m = M.compute(frames(times, gpu_ms=gpu), warmup_s=0)
        self.assertAlmostEqual(m.gpu_busy_ratio, 0.55, places=6)

    def test_frames_missing_gpu_data_excluded_from_both_sides(self):
        times = [10.0, 10.0, 10.0]
        gpu = [10.0, None, 10.0]
        m = M.compute(frames(times, gpu_ms=gpu), warmup_s=0)
        self.assertAlmostEqual(m.gpu_busy_ratio, 1.0, places=6)


class TestClassification(unittest.TestCase):
    def _jitter(self, base, n=200):
        """Frame times spread wide enough not to trip the cap detector."""
        return [base + (i % 20) - 10 for i in range(n)]

    def test_gpu_bound(self):
        times = self._jitter(40.0)
        gpu = [t * 0.99 for t in times]
        m = M.compute(frames(times, gpu_ms=gpu), warmup_s=0)
        self.assertEqual(m.classification, "GPU-bound")

    def test_cpu_bound(self):
        times = self._jitter(40.0)
        gpu = [t * 0.50 for t in times]
        m = M.compute(frames(times, gpu_ms=gpu), warmup_s=0)
        self.assertEqual(m.classification, "CPU-bound or present-blocked")

    def test_mixed(self):
        times = self._jitter(40.0)
        gpu = [t * 0.90 for t in times]
        m = M.compute(frames(times, gpu_ms=gpu), warmup_s=0)
        self.assertEqual(m.classification, "mixed")

    def test_cap_bound_wins_over_gpu_bound(self):
        """A frame-limited capture must not read as GPU-bound.

        At a 40 fps cap the GPU can be ~100% busy inside each frame while the
        chip has headroom to spare. Calling that 'GPU-bound' would send a tuning
        session hunting for watts it does not need.
        """
        times = [25.0] * 200
        gpu = [24.9] * 200
        m = M.compute(frames(times, gpu_ms=gpu), warmup_s=0)
        self.assertEqual(m.classification, "cap-bound")

    def test_unknown_without_gpu_data(self):
        m = M.compute(frames(self._jitter(40.0)), warmup_s=0)
        self.assertEqual(m.classification, "unknown")


class TestNoiseFloor(unittest.TestCase):
    def _runs(self, scales):
        return [M.compute(frames([25.0 * s] * 200), warmup_s=0) for s in scales]

    def test_identical_runs_give_zero_spread(self):
        nf = N.compute(self._runs([1.0, 1.0, 1.0]))
        self.assertAlmostEqual(nf.headline_pct, 0.0, places=6)
        self.assertIn("USABLE", nf.verdict)

    def test_two_percent_spread_is_usable(self):
        nf = N.compute(self._runs([1.00, 1.01, 1.02]))
        self.assertAlmostEqual(nf.headline_pct, 1.98, places=1)
        self.assertIn("USABLE", nf.verdict)

    def test_six_percent_spread_is_not_usable(self):
        nf = N.compute(self._runs([1.00, 1.03, 1.06]))
        self.assertGreater(nf.headline_pct, 5.0)
        self.assertIn("NOT USABLE", nf.verdict)

    def test_headline_is_the_worst_pacing_metric_not_the_average(self):
        """If any pacing metric is unstable, the floor is unstable.

        Taking the mean across metrics would let a rock-steady mean frametime
        hide a 1% low that wanders, and the 1% low is the primary metric.
        """
        nf = N.compute(self._runs([1.00, 1.02, 1.05]))
        worst = max(s.range_pct for s in nf.spreads if s.metric in N.PACING_METRICS)
        self.assertAlmostEqual(nf.headline_pct, worst, places=6)

    def test_average_fps_never_decides_the_verdict(self):
        nf = N.compute(self._runs([1.0, 1.0, 1.0]))
        self.assertNotIn("avg_fps", N.PACING_METRICS)
        self.assertIn("avg_fps", [s.metric for s in nf.spreads])

    def test_single_run_cannot_produce_a_floor(self):
        with self.assertRaises(ValueError):
            N.compute(self._runs([1.0]))


if __name__ == "__main__":
    unittest.main()
