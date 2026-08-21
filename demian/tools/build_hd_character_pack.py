#!/usr/bin/env python3
"""Build an "HD" (higher pixel-density) character pack from an existing pack.

This does NOT invent new poses or new art content — it takes the existing,
already-approved sprite sheet for a character/variant and re-samples every
frame at a higher pixel density using an edge-aware upscale + polish pass
(smooth resample -> edge-preserving denoise -> unsharp mask -> palette
quantize -> hard alpha snap). The result is a crisper, less blocky sprite at
the *same* in-game world size (CharacterVisualContract.characterFrameWorldSize
is resolution independent), which is a real, measurable visual upgrade that
does not require redrawing the character.

Genuinely new poses/frames/art (a different haircut, a new attack animation,
hand-drawn detail that was never in the source) are outside what this script
-- or any image-processing script -- can do; that step needs new source art
(concept art + an artist or an image-generation pass) to be produced first
and dropped into public/assets/characters/<slug>/ before a build tool like
this one can package it into an atlas.

Usage:
    python3 tools/build_hd_character_pack.py --slug darya
    python3 tools/build_hd_character_pack.py --slug darya --scale 1.5 --source-version 6 --target-version 7

The output follows the exact same naming/geometry convention consumed by
CharacterVisualContract.characterAssetRelativePath(), so it is a drop-in
sibling pack: <slug>-spritesheet-v{target}-{variant}.png /
<slug>-atlas-v{target}-{variant}.json.
"""
from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
CHARACTER_ROOT = ROOT / "public" / "assets" / "characters"
VARIANTS = ("desktop", "mobile", "compact")
ALPHA_SNAP_THRESHOLD = 56
DEFAULT_PALETTE_COLORS = 96


def upscale_sheet(image: Image.Image, factor: float, palette_colors: int) -> Image.Image:
    """Edge-aware upscale + polish pass for a whole sprite sheet at once."""
    src = image.convert("RGBA")
    width, height = src.size
    new_size = (round(width * factor), round(height * factor))

    arr = np.array(src)
    rgb = arr[..., :3].astype(np.uint8)
    alpha = arr[..., 3].astype(np.uint8)

    # Smooth resample gives real intermediate detail instead of blocky repeats.
    rgb_up = cv2.resize(rgb, new_size, interpolation=cv2.INTER_CUBIC)
    # Edge-preserving smoothing removes cubic-resample ringing near hard edges.
    rgb_smooth = cv2.bilateralFilter(rgb_up, d=5, sigmaColor=35, sigmaSpace=35)
    # Unsharp mask restores/boosts perceived detail lost to the smoothing pass.
    blurred = cv2.GaussianBlur(rgb_smooth, (0, 0), sigmaX=1.3)
    sharpened = cv2.addWeighted(rgb_smooth, 1.5, blurred, -0.5, 0)
    sharpened = np.clip(sharpened, 0, 255).astype(np.uint8)

    alpha_up = cv2.resize(alpha, new_size, interpolation=cv2.INTER_CUBIC)

    merged = np.dstack([sharpened, alpha_up])
    upscaled = Image.fromarray(merged, mode="RGBA")

    rgb_channels = upscaled.convert("RGB")
    rgb_channels = ImageEnhance.Contrast(rgb_channels).enhance(1.07)
    rgb_channels = ImageEnhance.Color(rgb_channels).enhance(1.10)
    polished = Image.merge("RGBA", (*rgb_channels.split(), upscaled.getchannel("A")))

    quantized = polished.quantize(
        colors=palette_colors,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    ).convert("RGBA")

    # Pixel art wants explicit coverage, not a fringe of translucent
    # anti-aliasing (same rule the existing v5/v6 rebuild tool enforces).
    snapped_alpha = polished.getchannel("A").point(lambda value: 0 if value < ALPHA_SNAP_THRESHOLD else 255)
    quantized.putalpha(snapped_alpha)
    return quantized


def scale_frame(frame: dict, factor: float) -> dict:
    return {
        "x": round(frame["x"] * factor),
        "y": round(frame["y"] * factor),
        "w": round(frame["w"] * factor),
        "h": round(frame["h"] * factor),
    }


def build_variant(slug: str, variant: str, factor: float, source_version: int, target_version: int, palette_colors: int) -> Path:
    directory = CHARACTER_ROOT / slug
    source_image_path = directory / f"{slug}-spritesheet-v{source_version}-{variant}.png"
    source_atlas_path = directory / f"{slug}-atlas-v{source_version}-{variant}.json"
    if not source_image_path.exists() or not source_atlas_path.exists():
        raise FileNotFoundError(f"Missing source pack for {slug}/{variant} at v{source_version}.")

    atlas = json.loads(source_atlas_path.read_text(encoding="utf-8"))
    image = Image.open(source_image_path)

    hd_image = upscale_sheet(image, factor, palette_colors)

    hd_atlas = copy.deepcopy(atlas)
    meta = hd_atlas.setdefault("meta", {})
    target_image_name = f"{slug}-spritesheet-v{target_version}-{variant}.png"
    meta["version"] = target_version
    meta["variant"] = variant
    meta["image"] = target_image_name
    meta["size"] = {"w": hd_image.width, "h": hd_image.height}
    meta["frameSize"] = {
        "w": round(meta.get("frameSize", {}).get("w", 0) * factor),
        "h": round(meta.get("frameSize", {}).get("h", 0) * factor),
    }
    meta["hd"] = True
    meta["upscaleFactor"] = factor
    meta["sourceVersion"] = source_version
    meta["note"] = (
        f"HD pack: v{source_version} frames re-sampled at {factor}x pixel density "
        "(edge-aware upscale + unsharp polish + palette quantize + hard alpha snap). "
        "Same poses/animations as the source pack; no new art content."
    )
    # artIntegrity / render body ratios get re-measured for real by
    # audit_character_sprite_packs.py --write-metadata right after this runs.
    meta.pop("artIntegrityReason", None)

    hd_atlas["frames"] = {name: scale_frame(frame, factor) for name, frame in atlas.get("frames", {}).items()}

    render = hd_atlas.setdefault("render", {})
    # Opt-in sub-frame smoothing hook consumed by FrameAnimator/PixelActorRenderer.
    # Only set on packs that explicitly request it; every other character/atlas
    # is untouched and keeps its exact current (false/absent) behaviour.
    render["frameBlend"] = True
    render["frameBlendMaxAlpha"] = 0.32

    target_image_path = directory / target_image_name
    target_atlas_path = directory / f"{slug}-atlas-v{target_version}-{variant}.json"
    hd_image.save(target_image_path, optimize=True, compress_level=9)
    target_atlas_path.write_text(json.dumps(hd_atlas, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        f"HD pack: {slug}/{variant} v{source_version}->v{target_version} "
        f"{image.size} -> {hd_image.size} ({target_image_path.stat().st_size / 1024:.0f} KB)"
    )
    return target_atlas_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--slug", required=True, help="Character slug, e.g. darya")
    parser.add_argument("--scale", type=float, default=1.5, help="Upscale factor (default: 1.5)")
    parser.add_argument("--source-version", type=int, default=6, help="Source pack version (default: 6)")
    parser.add_argument("--target-version", type=int, default=7, help="Output pack version (default: 7)")
    parser.add_argument("--palette-colors", type=int, default=DEFAULT_PALETTE_COLORS)
    parser.add_argument("--variants", nargs="*", default=list(VARIANTS), choices=VARIANTS)
    args = parser.parse_args()

    slug = args.slug.strip().lower()
    for variant in args.variants:
        build_variant(slug, variant, args.scale, args.source_version, args.target_version, args.palette_colors)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
