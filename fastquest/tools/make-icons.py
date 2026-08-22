#!/usr/bin/env python3
"""Generate FastQuest's PWA icons.

No SVG rasteriser (cairosvg, ImageMagick, rsvg) is available in this project's
environment, and iOS ignores SVG icons for the home screen — so the PNGs are
drawn here directly with the standard library and committed alongside the source
`icon.svg`. Re-run this after changing the mark:

    python3 fastquest/tools/make-icons.py

The mark is a progress ring with a marker dot at the top, on a deep green field —
the same ring the app draws around its fast timer.
"""

import math
import os
import struct
import zlib

# Rendered at SUPERSAMPLE x and box-filtered down, which is what keeps the curves
# smooth without pulling in an imaging library.
SUPERSAMPLE = 4

BG_TOP = (0x25, 0x8B, 0x59)
BG_BOTTOM = (0x11, 0x53, 0x34)
RING = (0x7B, 0xE0, 0xA8)
DOT = (0xFF, 0xFF, 0xFF)

# Normalised geometry (fractions of the icon's width).
RING_RADIUS = 0.290
RING_HALF_WIDTH = 0.043
GAP_DEGREES = 26.0          # opening at the top, where the marker dot sits
DOT_RADIUS = 0.076

OUTPUTS = [
    ("icon-192.png", 192),
    ("icon-512.png", 512),
    ("apple-touch-icon.png", 180),
]


def shade(x: float, y: float) -> tuple:
    """Colour for one normalised (0..1) point of the icon. Fully opaque."""
    r, g, b = (
        round(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * y)
        for i in range(3)
    )

    dx, dy = x - 0.5, y - 0.5
    dist = math.hypot(dx, dy)

    # Marker dot, sitting on the ring at twelve o'clock.
    if math.hypot(dx, dy + RING_RADIUS) <= DOT_RADIUS:
        return DOT

    # Ring, minus an opening at the top so the dot reads as a position on it.
    if abs(dist - RING_RADIUS) <= RING_HALF_WIDTH:
        angle = math.degrees(math.atan2(dy, dx))  # -90 is straight up
        if abs(((angle + 90) + 180) % 360 - 180) > GAP_DEGREES:
            return RING

    return (r, g, b)


def render(size: int) -> bytes:
    """Render one icon as RGBA bytes, supersampled and box-filtered."""
    big = size * SUPERSAMPLE
    inv = 1.0 / big
    samples = SUPERSAMPLE * SUPERSAMPLE

    # Render the supersampled image one row at a time to keep memory modest.
    hi_rows = []
    for py in range(big):
        y = (py + 0.5) * inv
        row = []
        for px in range(big):
            row.append(shade((px + 0.5) * inv, y))
        hi_rows.append(row)

    out = bytearray()
    for oy in range(size):
        block = hi_rows[oy * SUPERSAMPLE:(oy + 1) * SUPERSAMPLE]
        for ox in range(size):
            r = g = b = 0
            for row in block:
                for sx in range(ox * SUPERSAMPLE, (ox + 1) * SUPERSAMPLE):
                    pr, pg, pb = row[sx]
                    r += pr
                    g += pg
                    b += pb
            out += bytes((r // samples, g // samples, b // samples, 255))
    return bytes(out)


def write_png(path: str, size: int, rgba: bytes) -> None:
    """Minimal 8-bit RGBA PNG writer."""
    stride = size * 4
    raw = b"".join(
        b"\x00" + rgba[y * stride:(y + 1) * stride]  # filter type 0 per scanline
        for y in range(size)
    )

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as handle:
        handle.write(png)


def main() -> None:
    icons_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
    icons_dir = os.path.normpath(icons_dir)
    os.makedirs(icons_dir, exist_ok=True)

    for name, size in OUTPUTS:
        path = os.path.join(icons_dir, name)
        write_png(path, size, render(size))
        print(f"wrote {path} ({size}x{size}, {os.path.getsize(path):,} bytes)")


if __name__ == "__main__":
    main()
