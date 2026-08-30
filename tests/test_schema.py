"""Tests for PresentMon CSV parsing.

The headers below are verbatim from PresentMon 2.5.1 running on the Ally X on
2026-08-30, captured with --v2_metrics and --v1_metrics respectively. They are
not reconstructed from documentation, which is the whole reason this file
exists: the handoff brief guessed the 2.x names as 'FrameTime' and 'GPUBusy'
and both guesses were wrong.
"""

import csv
import io
import unittest

from allytune.capture.schema import Frame, SchemaError, detect_schema, parse_rows

V2_HEADER = (
    "Application,ProcessID,SwapChainAddress,PresentRuntime,SyncInterval,PresentFlags,"
    "AllowsTearing,PresentMode,TimeInMs,MsBetweenSimulationStart,MsBetweenPresents,"
    "MsBetweenDisplayChange,MsInPresentAPI,MsRenderPresentLatency,MsUntilDisplayed,"
    "CPUStartTimeInMs,MsBetweenAppStart,MsCPUBusy,MsCPUWait,MsGPULatency,MsGPUTime,"
    "MsGPUBusy,MsGPUWait,MsAnimationError,AnimationTime,MsFlipDelay,"
    "MsAllInputToPhotonLatency,MsClickToPhotonLatency"
)

V2_ROW = (
    "u4.exe,7980,0x1F2764AB3D0,DXGI,0,0,0,Hardware Composed: Independent Flip,"
    "10.9976,NA,8.17780000000000,8.34910000000000,1.15240000000000,0.99050000000000,"
    "6.7994,4.2401,7.9099,6.7575,1.1524,7.3235,0.4245,7.9000,0.0000,NA,4.2401,NA,NA,NA"
)

V1_HEADER = (
    "Application,ProcessID,SwapChainAddress,Runtime,SyncInterval,PresentFlags,Dropped,"
    "TimeInSeconds,msInPresentAPI,msBetweenPresents,AllowsTearing,PresentMode,"
    "msUntilRenderComplete,msUntilDisplayed,msBetweenDisplayChange,msFlipDelay,"
    "msUntilRenderStart,msGPUActive,msSinceInput"
)

V1_ROW = (
    "u4.exe,7980,0x1F2764AB3D0,DXGI,0,0,0,1.234,1.15,16.70,0,"
    "Hardware Composed: Independent Flip,2.0,6.8,16.7,NA,0.5,15.90,NA"
)


def rows(header, *body):
    return list(csv.DictReader(io.StringIO("\n".join([header, *body]))))


class TestDetect(unittest.TestCase):
    def test_detects_v2(self):
        self.assertEqual(detect_schema(V2_HEADER.split(",")), "v2")

    def test_detects_v1(self):
        self.assertEqual(detect_schema(V1_HEADER.split(",")), "v1")

    def test_rejects_unknown_header(self):
        with self.assertRaises(SchemaError):
            detect_schema(["Application", "Nonsense", "Whatever"])

    def test_case_matters(self):
        """v1 and v2 differ only by case, so matching must be case-sensitive.

        A case-insensitive match would pick the wrong branch and then divide the
        timestamp by 1000 (or fail to), silently corrupting every duration.
        """
        self.assertEqual(detect_schema(["msBetweenPresents"]), "v1")
        self.assertEqual(detect_schema(["MsBetweenPresents"]), "v2")


class TestParseV2(unittest.TestCase):
    def setUp(self):
        self.frames = list(parse_rows(rows(V2_HEADER, V2_ROW)))

    def test_one_frame(self):
        self.assertEqual(len(self.frames), 1)

    def test_frame_time(self):
        self.assertAlmostEqual(self.frames[0].frame_time_ms, 8.1778, places=4)

    def test_gpu_busy_uses_msgpubusy_not_msgputime(self):
        """MsGPUTime and MsGPUBusy are different columns and differ under load.

        MsGPUBusy is the one the bottleneck classifier wants; picking MsGPUTime
        would understate the ratio on a GPU-bound capture.
        """
        self.assertAlmostEqual(self.frames[0].gpu_busy_ms, 7.9, places=4)

    def test_cpu_busy(self):
        self.assertAlmostEqual(self.frames[0].cpu_busy_ms, 6.7575, places=4)

    def test_time_converted_from_ms_to_seconds(self):
        self.assertAlmostEqual(self.frames[0].time_s, 0.0109976, places=7)

    def test_metadata(self):
        f = self.frames[0]
        self.assertEqual(f.app, "u4.exe")
        self.assertEqual(f.pid, 7980)
        self.assertTrue(f.displayed)


class TestParseV1(unittest.TestCase):
    def setUp(self):
        self.frames = list(parse_rows(rows(V1_HEADER, V1_ROW)))

    def test_frame_time(self):
        self.assertAlmostEqual(self.frames[0].frame_time_ms, 16.70, places=4)

    def test_gpu_busy_from_msgpuactive(self):
        self.assertAlmostEqual(self.frames[0].gpu_busy_ms, 15.90, places=4)

    def test_time_already_seconds(self):
        """v1 reports TimeInSeconds; it must not be divided by 1000 again."""
        self.assertAlmostEqual(self.frames[0].time_s, 1.234, places=4)

    def test_no_cpu_busy_column_in_v1(self):
        self.assertIsNone(self.frames[0].cpu_busy_ms)


class TestNullHandling(unittest.TestCase):
    def test_na_gpu_busy_becomes_none_not_zero(self):
        """A missing GPU time is unknown, not idle.

        Coercing NA to 0.0 would drag the GPU-busy ratio down and misclassify a
        GPU-bound game as CPU-bound -- the single most consequential wrong
        answer this tool can give.
        """
        row = V2_ROW.split(",")
        row[21] = "NA"  # MsGPUBusy
        f = list(parse_rows(rows(V2_HEADER, ",".join(row))))[0]
        self.assertIsNone(f.gpu_busy_ms)

    def test_dropped_frame_detected_in_v2_via_msuntildisplayed(self):
        row = V2_ROW.split(",")
        row[14] = "NA"  # MsUntilDisplayed
        f = list(parse_rows(rows(V2_HEADER, ",".join(row))))[0]
        self.assertFalse(f.displayed)

    def test_dropped_flag_honoured_in_v1(self):
        row = V1_ROW.split(",")
        row[6] = "1"  # Dropped
        f = list(parse_rows(rows(V1_HEADER, ",".join(row))))[0]
        self.assertFalse(f.displayed)

    def test_zero_and_missing_frame_times_are_skipped(self):
        bad = V2_ROW.split(",")
        bad[10] = "0"
        worse = V2_ROW.split(",")
        worse[10] = "NA"
        frames = list(parse_rows(rows(V2_HEADER, ",".join(bad), ",".join(worse), V2_ROW)))
        self.assertEqual(len(frames), 1)

    def test_empty_input(self):
        self.assertEqual(list(parse_rows([])), [])


if __name__ == "__main__":
    unittest.main()
