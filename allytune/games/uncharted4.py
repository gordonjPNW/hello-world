"""Uncharted 4: A Thief's End -- game adapter.

Phase 1 uses only the read-only half of an adapter: how to recognise the process
and where its files live. The knob map that phase 2 would need is deliberately
absent, and the reason is a finding rather than an omission -- see below.

Verified against the install on this device on 2026-08-30.
"""

from __future__ import annotations

import os
from pathlib import Path

STEAM_APP_ID = 1659420
NAME = "Uncharted 4: A Thief's End"
COLLECTION = "UNCHARTED: Legacy of Thieves Collection"

# The collection ships two games. u4.exe is A Thief's End; tll.exe is The Lost
# Legacy. The '-l' variants alongside them are the launcher shims -- PresentMon
# will attribute frames to the game executable, not the shim.
PROCESS_NAME = "u4.exe"
SIBLING_PROCESS = "tll.exe"

INSTALL_DIR = Path(
    r"C:\Program Files (x86)\Steam\steamapps\common"
    r"\Uncharted Legacy of Thieves Collection"
)

SAVE_DIR = Path.home() / "Saved Games" / "Uncharted Legacy of Thieves Collection"

# What phase 2 needs to know, established in phase 1:
#
# There is no plaintext graphics configuration file. The only human-readable
# file in the save directory is sharedsettings.cfg, and it holds three keys --
# DataCollection, SplashVolume, PSNAuthLink -- none of which are graphics
# settings. Everything else is Naughty Dog's binary save format (P.save,
# *.USR-DATA), and a string scan of P.save finds no 'render', 'shadow', 'fsr',
# 'resolution', 'texture' or 'quality' tokens.
#
# So the plan's assumption that settings can be patched in a text file does not
# hold for this title. Phase 2 has to either reverse the binary format or drive
# the in-game menu, and that changes the cost of an unattended settings sweep
# considerably. Recorded here so the decision is made with the fact in hand.
SETTINGS_FILE_FORMAT = "binary-save"
SETTINGS_PATCHABLE = False

SHARED_SETTINGS = SAVE_DIR / "users"  # per-Steam-user subdirectory below this


def installed() -> bool:
    return (INSTALL_DIR / PROCESS_NAME).is_file()


def executable() -> Path:
    return INSTALL_DIR / PROCESS_NAME


def launch_url() -> str:
    """Steam URL that launches the collection.

    Phase 1 does not use this -- the game is started by hand -- but recording it
    here keeps the adapter complete.
    """
    return "steam://rungameid/" + str(STEAM_APP_ID)


def save_files() -> list:
    if not SAVE_DIR.is_dir():
        return []
    return [str(p) for p in SAVE_DIR.rglob("*") if p.is_file()]
