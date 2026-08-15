#!/usr/bin/env python3
"""Rebuild bundled Demian character sheets into a crisp 8-bit presentation.

The atlas geometry is intentionally unchanged. Each variant is reduced to the
same 64px-per-frame effective pixel grid, palette-quantized, alpha-snapped and
then enlarged with nearest-neighbour sampling to its original dimensions.
This keeps every existing JSON atlas valid while making Canvas2D down-scaling
far more stable and visually coherent.
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
CHARACTER_ROOT = ROOT / "public" / "assets" / "characters"
VARIANT_SCALE = {"compact": 2, "mobile": 3, "desktop": 4}
PALETTE_COLORS = 72


def variant_for(path: Path) -> str | None:
    name = path.name
    for variant in VARIANT_SCALE:
        if name.endswith(f"-v5-{variant}.png"):
            return variant
    return None


def pixelize(path: Path, variant: str) -> None:
    factor = VARIANT_SCALE[variant]
    image = Image.open(path).convert("RGBA")
    width, height = image.size
    if width % factor or height % factor:
        raise ValueError(f"{path}: dimensions {image.size} are not divisible by {factor}")

    # Slight contrast/chroma lift compensates for palette reduction and gives
    # the characters stronger readability against the café floor.
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    rgb = ImageEnhance.Contrast(rgb).enhance(1.10)
    rgb = ImageEnhance.Color(rgb).enhance(1.08)
    image = Image.merge("RGBA", (*rgb.split(), alpha))

    small_size = (width // factor, height // factor)
    small = image.resize(small_size, Image.Resampling.NEAREST)
    small = small.quantize(
        colors=PALETTE_COLORS,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    ).convert("RGBA")

    # Pixel art should have explicit coverage, not a fringe of translucent
    # anti-aliasing. A low threshold preserves hair/finger details.
    snapped_alpha = small.getchannel("A").point(lambda value: 0 if value < 56 else 255)
    small.putalpha(snapped_alpha)

    rebuilt = small.resize((width, height), Image.Resampling.NEAREST)
    rebuilt.save(path, optimize=True, compress_level=9)
    print(f"8-bit: {path.relative_to(ROOT)} -> effective {small_size[0]}x{small_size[1]}")


def main() -> int:
    targets = []
    for path in sorted(CHARACTER_ROOT.glob("*/*-spritesheet-v5-*.png")):
        variant = variant_for(path)
        if variant:
            targets.append((path, variant))

    if not targets:
        raise SystemExit("No V5 character sprite sheets were found.")

    for path, variant in targets:
        pixelize(path, variant)

    print(f"Rebuilt {len(targets)} character sprite sheets.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
