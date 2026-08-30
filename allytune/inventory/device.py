"""Device inventory, and detection of which of the two target configurations
the machine is currently in.

Gordon runs this device two ways, and they are different measurement regimes:

  handheld : on battery, internal 7" panel at 120 Hz, lower power ceilings
  docked   : plugged in, Alienware 32" monitor, higher SPL/sPPT/fPPT ceilings

A noise floor measured in one says nothing about the other -- the power limits,
the thermal behaviour and the pixel count all differ -- so every capture records
its configuration and results are never pooled across the two.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict

from allytune import winbridge as wb

# Internal panel of the ROG Ally X, read off this device's EDID.
INTERNAL_PANEL_MODEL = "TL070FVXS01-0"

WATCH_PROCESSES = [
    "ArmouryCrateSE", "ArmouryCrate.UserSessionHelper", "ArmouryCrate.Service",
    "RTSS", "RTSSHooksLoader64", "MSIAfterburner",
    "RadeonSoftware", "AMDRSServ", "cncmd",
    "LibreHardwareMonitor", "PresentMon",
    "steam", "steamwebhelper", "GameBar",
]

VRAM_REG_QUERY = (
    "Get-ChildItem "
    "'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}' "
    "-ErrorAction SilentlyContinue | "
    "ForEach-Object { Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue } | "
    "Where-Object { $_.'HardwareInformation.qwMemorySize' } | "
    "Select-Object @{n='VramBytes';e={$_.'HardwareInformation.qwMemorySize'}}"
)

MONITOR_QUERY = (
    "Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorID "
    "-ErrorAction SilentlyContinue | ForEach-Object { [pscustomobject]@{ "
    "Name = (($_.UserFriendlyName | Where-Object {$_ -ne 0}) | ForEach-Object {[char]$_}) -join ''; "
    "Mfr = (($_.ManufacturerName | Where-Object {$_ -ne 0}) | ForEach-Object {[char]$_}) -join ''; "
    "Inst = $_.InstanceName } }"
)

ELEVATION_QUERY = (
    "[pscustomobject]@{ E = ([Security.Principal.WindowsPrincipal]"
    "[Security.Principal.WindowsIdentity]::GetCurrent())"
    ".IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }"
)


@dataclass
class Display:
    device: str
    name: str
    manufacturer: str
    width: int
    height: int
    refresh_hz: int
    primary: bool
    internal: bool


@dataclass
class Inventory:
    model: str = ""
    manufacturer: str = ""
    bios: str = ""
    os_caption: str = ""
    os_version: str = ""
    cpu: str = ""
    cpu_cores: int = 0
    ram_installed_gb: float = 0.0
    ram_visible_gb: float = 0.0
    ram_free_gb: float = 0.0
    vram_dedicated_gb: float = 0.0
    gpu: str = ""
    gpu_driver: str = ""
    gpu_driver_date: str = ""
    battery_full_mwh: int = 0
    battery_design_mwh: int = 0
    battery_health_pct: float = 0.0
    battery_charge_pct: int = 0
    on_ac: bool = False
    discharge_mw: int = 0
    displays: list = field(default_factory=list)
    processes_running: list = field(default_factory=list)
    configuration: str = "unknown"
    elevated: bool = False
    warnings: list = field(default_factory=list)

    def as_dict(self) -> dict:
        d = asdict(self)
        d["displays"] = [x if isinstance(x, dict) else asdict(x) for x in self.displays]
        return d


def _first(data, default=None):
    items = wb.as_list(data)
    return items[0] if items else default


def collect() -> Inventory:
    inv = Inventory()

    sysinfo = _first(wb.ps_json(
        "Get-CimInstance Win32_ComputerSystem | Select-Object Model,Manufacturer"
    ), {}) or {}
    inv.model = sysinfo.get("Model", "")
    inv.manufacturer = sysinfo.get("Manufacturer", "")

    cpu = _first(wb.ps_json(
        "Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores"
    ), {}) or {}
    inv.cpu = (cpu.get("Name") or "").strip()
    inv.cpu_cores = cpu.get("NumberOfCores") or 0

    bios = _first(wb.ps_json(
        "Get-CimInstance Win32_BIOS | Select-Object SMBIOSBIOSVersion"
    ), {}) or {}
    inv.bios = bios.get("SMBIOSBIOSVersion", "")

    os_ = _first(wb.ps_json(
        "Get-CimInstance Win32_OperatingSystem | "
        "Select-Object Caption,Version,TotalVisibleMemorySize,FreePhysicalMemory"
    ), {}) or {}
    inv.os_caption = (os_.get("Caption") or "").strip()
    inv.os_version = os_.get("Version", "")
    inv.ram_visible_gb = round((os_.get("TotalVisibleMemorySize") or 0) / 1048576, 2)
    inv.ram_free_gb = round((os_.get("FreePhysicalMemory") or 0) / 1048576, 2)

    # Installed RAM comes from the DIMM list, not TotalPhysicalMemory: the iGPU
    # carve-out is invisible to the OS, so the two disagree by the VRAM size.
    modules = wb.as_list(wb.ps_json(
        "Get-CimInstance Win32_PhysicalMemory | Select-Object Capacity"
    ))
    total_bytes = sum((m.get("Capacity") or 0) for m in modules)
    inv.ram_installed_gb = round(total_bytes / 1073741824, 1)

    # DriverDate is formatted PowerShell-side: ConvertTo-Json renders a DateTime
    # as /Date(1779062400000)/, which is unreadable in a report.
    gpu = _first(wb.ps_json(
        "Get-CimInstance Win32_VideoController | "
        "Select-Object Name,DriverVersion,CurrentRefreshRate,"
        "CurrentHorizontalResolution,CurrentVerticalResolution,"
        "@{n='DriverDateStr';e={$_.DriverDate.ToString('yyyy-MM-dd')}}"
    ), {}) or {}
    inv.gpu = (gpu.get("Name") or "").strip()
    inv.gpu_driver = gpu.get("DriverVersion", "")
    inv.gpu_driver_date = gpu.get("DriverDateStr", "") or ""

    vram = _first(wb.ps_json(VRAM_REG_QUERY), {}) or {}
    inv.vram_dedicated_gb = round((vram.get("VramBytes") or 0) / 1073741824, 2)

    inv.battery_full_mwh = (_first(wb.ps_json(
        "Get-CimInstance -Namespace root\\wmi -ClassName BatteryFullChargedCapacity "
        "-ErrorAction SilentlyContinue | Select-Object FullChargedCapacity"
    ), {}) or {}).get("FullChargedCapacity", 0) or 0

    design = (_first(wb.ps_json(
        "Get-CimInstance -Namespace root\\wmi -ClassName BatteryStaticData "
        "-ErrorAction SilentlyContinue | Select-Object DesignedCapacity"
    ), {}) or {}).get("DesignedCapacity", 0) or 0
    # BatteryStaticData is not implemented on this device; fall back to the
    # nominal pack size so health is still reportable rather than blank.
    inv.battery_design_mwh = design or 80000
    if inv.battery_full_mwh:
        inv.battery_health_pct = round(
            inv.battery_full_mwh / inv.battery_design_mwh * 100, 1
        )

    batt = _first(wb.ps_json(
        "Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining"
    ), {}) or {}
    inv.battery_charge_pct = batt.get("EstimatedChargeRemaining", 0) or 0

    status = _first(wb.ps_json(
        "Get-CimInstance -Namespace root\\wmi -ClassName BatteryStatus "
        "-ErrorAction SilentlyContinue | Select-Object PowerOnline,Discharging,DischargeRate"
    ), {}) or {}
    inv.on_ac = bool(status.get("PowerOnline", False))
    inv.discharge_mw = status.get("DischargeRate", 0) or 0

    inv.displays = _collect_displays(gpu)

    proc_query = (
        "Get-Process -Name "
        + ",".join("'" + n + "'" for n in WATCH_PROCESSES)
        + " -ErrorAction SilentlyContinue | Select-Object -Unique Name"
    )
    inv.processes_running = [
        p.get("Name") for p in wb.as_list(wb.ps_json(proc_query)) if p.get("Name")
    ]

    inv.elevated = bool((_first(wb.ps_json(ELEVATION_QUERY), {}) or {}).get("E", False))

    inv.configuration = classify_configuration(inv)
    inv.warnings = build_warnings(inv)
    return inv


def _collect_displays(gpu: dict) -> list:
    """Enumerate attached displays.

    WmiMonitorID gives the EDID identity (which panel); the video controller
    gives the active mode. They are joined on 'is this the internal panel',
    which is the distinction that actually matters here -- set-refresh-rate.ps1
    historically addressed 'the primary display' and so silently hit the TV
    while docked.
    """
    monitors = wb.as_list(wb.ps_json(MONITOR_QUERY))
    single = len(monitors) == 1
    out = []
    for i, m in enumerate(monitors):
        name = (m.get("Name") or "").strip()
        out.append(Display(
            device=(m.get("Inst") or "").strip(),
            name=name,
            manufacturer=(m.get("Mfr") or "").strip(),
            # Mode reporting is per-adapter, so it is only unambiguous with one
            # display attached. With two we record panel identity and leave the
            # per-display mode to the display module in phase 2.
            width=(gpu.get("CurrentHorizontalResolution") or 0) if single else 0,
            height=(gpu.get("CurrentVerticalResolution") or 0) if single else 0,
            refresh_hz=(gpu.get("CurrentRefreshRate") or 0) if single else 0,
            primary=(i == 0),
            internal=(name == INTERNAL_PANEL_MODEL),
        ))
    return out


def classify_configuration(inv: Inventory) -> str:
    """Decide whether this is a 'handheld' or 'docked' measurement.

    AC power is the primary signal because it is what moves the power ceilings
    (SPL 25 W on battery vs 30 W plugged in), and the power ceiling dominates
    the measurement. An external display is corroborating evidence.

    The two mixed states get their own names rather than being forced into one
    of the targets, because silently filing a charging-handheld run under
    'handheld' is exactly the kind of quiet mislabelling that corrupts a data
    set months later.
    """
    external = [d for d in inv.displays if not d.internal]
    if inv.on_ac and external:
        return "docked"
    if not inv.on_ac and not external:
        return "handheld"
    if inv.on_ac and not external:
        return "handheld-charging"
    return "undocked-external"


def build_warnings(inv: Inventory) -> list:
    """Conditions that would make a measurement untrustworthy."""
    w = []
    if not inv.elevated:
        w.append(
            "Not running as Administrator. PresentMon still captures, but it cannot "
            "resolve short-lived or other-account processes, and --process_name "
            "targeting is unreliable. Run the terminal as Administrator."
        )
    if inv.battery_charge_pct and inv.battery_charge_pct < 40 and not inv.on_ac:
        w.append(
            "Battery at " + str(inv.battery_charge_pct) + "%. As the pack drains the "
            "platform trims power limits, which silently changes what you are "
            "measuring. Charge above 50% before a benchmark set."
        )
    if inv.configuration in ("handheld-charging", "undocked-external"):
        w.append(
            "Configuration reads as '" + inv.configuration + "', which is neither of "
            "the two target profiles. Do not pool these results with handheld or "
            "docked sets."
        )
    if "ArmouryCrateSE" in inv.processes_running:
        w.append(
            "Armoury Crate SE is running. It re-asserts power limits on mode change, "
            "AC plug/unplug and resume. Harmless to a read-only capture, but note any "
            "plug/unplug during a run and discard that run."
        )
    if inv.ram_free_gb and inv.ram_free_gb < 4:
        w.append(
            "Only " + str(inv.ram_free_gb) + " GB of RAM free. Memory pressure causes "
            "streaming hitches that show up in the 0.1% low and inflate the noise floor."
        )
    return w
