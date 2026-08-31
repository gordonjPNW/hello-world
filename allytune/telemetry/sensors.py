"""Power, temperature and clock telemetry, sampled alongside a capture.

Two independent sources, because neither is sufficient alone:

**LibreHardwareMonitor** (v0.9.6, pinned) exposes the APU's own sensors -- package
power, per-core clocks, edge temperature -- as JSON over a local HTTP port. It is
the detailed source, but it needs Administrator to read most of them, and it has
to be running.

**The battery** reports `DischargeRate` in milliwatts through WMI, needs no driver
and no elevation, and is the *whole system's* draw at the wall of the pack. That
makes it the honest number for handheld battery-life questions, where package
power alone understates the total by the display, the fans and the SSD.

The catch, and it matters for the two-configuration design: DischargeRate only
exists while actually discharging. Plugged in -- which is every docked run -- it
reads zero. So docked power telemetry depends on LibreHardwareMonitor, and
handheld telemetry does not. Recorded here so a later session does not read a
docked run's zero as "the machine used no power".

Sampling runs on a background thread during a capture and is deliberately
tolerant: telemetry failing must never invalidate a frametime capture, because
frametimes are the measurement and this is context.
"""

from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field, asdict

from allytune import winbridge as wb

LHM_VERSION = "0.9.6"
LHM_SHA256 = "086D9F1B5A99E643EDC2CFAAAC16051685B551E4C5AC0B32A57C58C0E529C001"
LHM_DEFAULT_PORT = 8085

# Sensor names as LibreHardwareMonitor 0.9.6 reports them for the Ryzen Z1
# Extreme, verified against the live JSON tree on this Ally X on 2026-08-30
# (see docs/allytune/04-phase1-results.md). Matched as case-insensitive
# substrings because LHM decorates names slightly differently between versions,
# and an exact match that silently finds nothing is worse than a loose one that
# finds the right sensor.
#
# Two known imperfections on this hardware:
#   - gpu_temp_c resolves to "GPU VR SoC" (the voltage regulator). The Z1
#     Extreme exposes no GPU-die edge temperature; "core (tctl/tdie)" is the
#     shared APU sensor and is the honest GPU thermal number if VRM is not it.
#   - cpu_clock_mhz matches nominal "Core #1", not "Core #1 (Effective)", which
#     diverge sharply at low load. Switch the needle if effective clock matters.
WANTED = {
    "package_power_w": ("power", "package"),
    "cpu_temp_c": ("temperature", "core (tctl/tdie)"),
    "cpu_clock_mhz": ("clock", "core #1"),
    "gpu_temp_c": ("temperature", "gpu"),
    "gpu_clock_mhz": ("clock", "gpu core"),
    "gpu_power_w": ("power", "gpu"),
}


@dataclass
class Sample:
    t: float
    battery_pct: int | None = None
    system_power_w: float | None = None   # from the battery, whole device
    on_ac: bool | None = None
    package_power_w: float | None = None  # from LHM, APU only
    cpu_temp_c: float | None = None
    cpu_clock_mhz: float | None = None
    gpu_temp_c: float | None = None
    gpu_clock_mhz: float | None = None
    gpu_power_w: float | None = None

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class TelemetrySummary:
    samples: int = 0
    duration_s: float = 0.0
    system_power_w_mean: float | None = None
    package_power_w_mean: float | None = None
    package_power_w_max: float | None = None
    cpu_temp_c_mean: float | None = None
    cpu_temp_c_max: float | None = None
    gpu_clock_mhz_mean: float | None = None
    battery_pct_start: int | None = None
    battery_pct_end: int | None = None
    sources: list = field(default_factory=list)
    notes: list = field(default_factory=list)

    def as_dict(self) -> dict:
        return asdict(self)


# --------------------------------------------------------------------------- #
# LibreHardwareMonitor


def lhm_available(port: int = LHM_DEFAULT_PORT, timeout: float = 1.0) -> bool:
    try:
        urllib.request.urlopen(
            "http://localhost:" + str(port) + "/data.json", timeout=timeout
        ).read(64)
        return True
    except (urllib.error.URLError, OSError):
        return False


def _walk(node, trail, out):
    """Flatten LHM's nested sensor tree into (path, value) pairs.

    LHM nests Computer > Hardware > SensorType > Sensor, and the depth varies by
    hardware, so the tree is walked rather than indexed.
    """
    text = (node.get("Text") or "").strip()
    here = trail + [text] if text else trail
    children = node.get("Children") or []
    if not children:
        val = (node.get("Value") or "").strip()
        if val:
            out.append((" / ".join(here).lower(), val))
        return
    for c in children:
        _walk(c, here, out)


def _parse_value(raw: str) -> float | None:
    """LHM values arrive as '13.4 W', '61.0 °C', '2,800 MHz'."""
    cleaned = raw.replace(",", "").split(" ")[0].strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def read_lhm(port: int = LHM_DEFAULT_PORT, timeout: float = 2.0) -> dict:
    """One poll of LibreHardwareMonitor's JSON endpoint."""
    try:
        raw = urllib.request.urlopen(
            "http://localhost:" + str(port) + "/data.json", timeout=timeout
        ).read()
        tree = json.loads(raw)
    except (urllib.error.URLError, OSError, json.JSONDecodeError):
        return {}

    flat: list = []
    _walk(tree, [], flat)

    result: dict = {}
    for field_name, (kind, needle) in WANTED.items():
        for path, raw_val in flat:
            if kind in path and needle in path:
                v = _parse_value(raw_val)
                if v is not None:
                    result[field_name] = v
                    break
    return result


# --------------------------------------------------------------------------- #
# battery


def read_battery() -> dict:
    """Whole-device power draw and charge state, no elevation required."""
    status = wb.as_list(wb.ps_json(
        "Get-CimInstance -Namespace root\\wmi -ClassName BatteryStatus "
        "-ErrorAction SilentlyContinue | "
        "Select-Object PowerOnline,DischargeRate,RemainingCapacity"
    ))
    batt = wb.as_list(wb.ps_json(
        "Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining"
    ))
    out: dict = {}
    if status:
        s = status[0]
        out["on_ac"] = bool(s.get("PowerOnline"))
        rate = s.get("DischargeRate") or 0
        # Zero while charging: the pack is not discharging, so this channel says
        # nothing about system draw. None, not 0.0 -- see the module docstring.
        out["system_power_w"] = round(rate / 1000.0, 2) if rate else None
    if batt:
        out["battery_pct"] = batt[0].get("EstimatedChargeRemaining")
    return out


# --------------------------------------------------------------------------- #
# sampler


class Sampler:
    """Polls both sources on a background thread for the life of a capture.

    Battery polling goes through PowerShell, which costs roughly 100 ms per call,
    so the default interval is 2 s. That is ample for thermal and power trends
    and cheap enough not to perturb the thing being measured -- a telemetry
    thread that steals CPU from the game would corrupt the very frametimes it is
    supposed to annotate.
    """

    def __init__(self, interval: float = 2.0, lhm_port: int = LHM_DEFAULT_PORT):
        self.interval = interval
        self.lhm_port = lhm_port
        self.samples: list = []
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.use_lhm = lhm_available(lhm_port)

    def _loop(self):
        while not self._stop.is_set():
            s = Sample(t=time.time())
            try:
                b = read_battery()
                s.battery_pct = b.get("battery_pct")
                s.system_power_w = b.get("system_power_w")
                s.on_ac = b.get("on_ac")
                if self.use_lhm:
                    for k, v in read_lhm(self.lhm_port).items():
                        setattr(s, k, v)
            except Exception:
                # Telemetry is context, not the measurement. A failure here must
                # never take down a capture that is otherwise valid.
                pass
            self.samples.append(s)
            self._stop.wait(self.interval)

    def start(self) -> "Sampler":
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        return self

    def stop(self) -> "Sampler":
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=self.interval + 3)
        return self

    def __enter__(self):
        return self.start()

    def __exit__(self, *exc):
        self.stop()
        return False

    def summary(self) -> TelemetrySummary:
        return summarise(self.samples, used_lhm=self.use_lhm)


def _mean(values):
    vals = [v for v in values if v is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


def _max(values):
    vals = [v for v in values if v is not None]
    return round(max(vals), 2) if vals else None


def summarise(samples, used_lhm: bool = False) -> TelemetrySummary:
    s = TelemetrySummary(samples=len(samples))
    if not samples:
        s.notes.append("no telemetry captured")
        return s

    s.duration_s = round(samples[-1].t - samples[0].t, 1)
    s.system_power_w_mean = _mean([x.system_power_w for x in samples])
    s.package_power_w_mean = _mean([x.package_power_w for x in samples])
    s.package_power_w_max = _max([x.package_power_w for x in samples])
    s.cpu_temp_c_mean = _mean([x.cpu_temp_c for x in samples])
    s.cpu_temp_c_max = _max([x.cpu_temp_c for x in samples])
    s.gpu_clock_mhz_mean = _mean([x.gpu_clock_mhz for x in samples])

    charges = [x.battery_pct for x in samples if x.battery_pct is not None]
    if charges:
        s.battery_pct_start, s.battery_pct_end = charges[0], charges[-1]

    s.sources = ["battery/WMI"] + (["LibreHardwareMonitor"] if used_lhm else [])
    if not used_lhm:
        s.notes.append(
            "LibreHardwareMonitor not reachable on localhost:" + str(LHM_DEFAULT_PORT)
            + "; APU package power, clocks and temperatures are unavailable for "
            "this run. Start it with its web server enabled, as Administrator."
        )
    if s.system_power_w_mean is None and any(x.on_ac for x in samples):
        s.notes.append(
            "On AC, so the battery reports no discharge rate and whole-system "
            "power was not measurable from it. This is expected docked."
        )
    return s
