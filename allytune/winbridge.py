"""Thin bridge to Windows facts, via PowerShell returning JSON.

Deliberately the only place in allytune that knows Windows exists, apart from
the capture runner. Everything in `analysis/` stays importable (and testable) on
any machine, which is what lets the maths be verified without the hardware.

PowerShell rather than a WMI binding because it needs no third-party package.
Every dependency is something to install on a handheld, and this device only had
a zero-byte Microsoft Store Python stub when we started.
"""

from __future__ import annotations

import json
import shutil
import subprocess

_PWSH = None


def powershell() -> str:
    """Locate a PowerShell interpreter, preferring Windows PowerShell 5.1."""
    global _PWSH
    if _PWSH is None:
        for cand in ("powershell.exe", "pwsh.exe"):
            found = shutil.which(cand)
            if found:
                _PWSH = found
                break
        else:
            raise RuntimeError("no PowerShell interpreter found on PATH")
    return _PWSH


def ps_json(script: str, timeout: float = 60.0):
    """Run a PowerShell snippet and parse its JSON output.

    The snippet must end in something pipeable to ConvertTo-Json; the wrapper
    adds the conversion so call sites stay readable. Depth 4 is enough for the
    flat objects we ask for and keeps output small.

    Returns None when the snippet produced nothing, which is the normal result
    for a WMI class the device does not implement -- several battery classes are
    optional and absent on this hardware.
    """
    wrapped = f"$ProgressPreference='SilentlyContinue'; $r = @({script}); if ($r.Count -eq 0) {{ '' }} else {{ $r | ConvertTo-Json -Depth 4 -Compress }}"
    try:
        proc = subprocess.run(
            [powershell(), "-NoProfile", "-NonInteractive", "-Command", wrapped],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return None
    out = (proc.stdout or "").strip()
    if not out:
        return None
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return None
    return data


def as_list(data) -> list:
    """ConvertTo-Json emits a bare object for one item and an array for many."""
    if data is None:
        return []
    return data if isinstance(data, list) else [data]
