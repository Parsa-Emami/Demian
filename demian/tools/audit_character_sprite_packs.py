#!/usr/bin/env python3
"""Audit Demian character sprite packs for layout, transparency and runtime sizing metadata."""
from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ("tiam", "ronak", "amirreza", "parsa", "mojtaba")
VARIANTS = ("desktop", "mobile", "compact")
ALPHA_THRESHOLD = 8
OPAQUE_FRAME_RATIO = 0.94


def alpha_bbox_ratio(image: Image.Image, frame: dict[str, int]) -> tuple[float, float]:
    crop = image.crop((frame["x"], frame["y"], frame["x"] + frame["w"], frame["y"] + frame["h"]))
    alpha = crop.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > ALPHA_THRESHOLD else 0).getbbox()
    if not bbox:
        return 0.0, 0.0
    width = max(0, bbox[2] - bbox[0])
    height = max(0, bbox[3] - bbox[1])
    return width / frame["w"], height / frame["h"]


def occupancy(image: Image.Image, frame: dict[str, int]) -> float:
    crop = image.crop((frame["x"], frame["y"], frame["x"] + frame["w"], frame["y"] + frame["h"]))
    alpha = crop.getchannel("A")
    histogram = alpha.histogram()
    opaque = sum(histogram[ALPHA_THRESHOLD + 1 :])
    return opaque / max(1, frame["w"] * frame["h"])


def audit_pack(character: str, variant: str, write_metadata: bool, pack_version: int = 5) -> dict[str, object]:
    directory = ROOT / "public" / "assets" / "characters" / character
    atlas_path = directory / f"{character}-atlas-v{pack_version}-{variant}.json"
    image_path = directory / f"{character}-spritesheet-v{pack_version}-{variant}.png"
    atlas = json.loads(atlas_path.read_text(encoding="utf-8"))
    image = Image.open(image_path).convert("RGBA")

    declared = atlas.get("meta", {}).get("size", {})
    if image.size != (declared.get("w"), declared.get("h")):
        raise ValueError(f"{character}/{variant}: atlas size does not match PNG size")

    frame_occupancy: list[float] = []
    idle_width_ratios: list[float] = []
    idle_height_ratios: list[float] = []
    edge_to_edge_frames = 0
    for name, frame in atlas.get("frames", {}).items():
        x, y, w, h = (int(frame[key]) for key in ("x", "y", "w", "h"))
        if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > image.width or y + h > image.height:
            raise ValueError(f"{character}/{variant}: frame {name} is outside the sprite sheet")
        frame_occupancy.append(occupancy(image, frame))
        width_ratio, height_ratio = alpha_bbox_ratio(image, frame)
        if width_ratio >= 0.995 and height_ratio >= 0.995:
            edge_to_edge_frames += 1
        if name.startswith("idle_") and height_ratio > 0:
            idle_width_ratios.append(width_ratio)
            idle_height_ratios.append(height_ratio)

    median_occupancy = statistics.median(frame_occupancy) if frame_occupancy else 0.0
    full_frames = sum(value >= OPAQUE_FRAME_RATIO for value in frame_occupancy)
    invalid_background = bool(frame_occupancy) and (
        full_frames >= max(3, len(frame_occupancy) // 2)
        or edge_to_edge_frames >= max(3, len(frame_occupancy) // 2)
    )
    reference_width_ratio = statistics.median(idle_width_ratios) if idle_width_ratios else 0.72
    reference_height_ratio = statistics.median(idle_height_ratios) if idle_height_ratios else 0.86
    reference_width_ratio = min(0.98, max(0.42, reference_width_ratio))
    reference_height_ratio = min(0.98, max(0.62, reference_height_ratio))

    atlas.setdefault("render", {})["referenceBodyWidthRatio"] = round(reference_width_ratio, 4)
    atlas.setdefault("render", {})["referenceBodyHeightRatio"] = round(reference_height_ratio, 4)
    atlas.setdefault("meta", {})["artIntegrity"] = "invalid" if invalid_background else "valid"
    if invalid_background:
        atlas["meta"]["artIntegrityReason"] = "opaque-or-baked-background-detected"
    else:
        atlas["meta"].pop("artIntegrityReason", None)

    if write_metadata:
        atlas_path.write_text(json.dumps(atlas, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return {
        "character": character,
        "variant": variant,
        "frames": len(frame_occupancy),
        "median_occupancy": median_occupancy,
        "full_frames": full_frames,
        "edge_to_edge_frames": edge_to_edge_frames,
        "reference_body_width_ratio": reference_width_ratio,
        "reference_body_height_ratio": reference_height_ratio,
        "valid": not invalid_background,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-metadata", action="store_true")
    parser.add_argument("--version", type=int, default=5, help="Character pack version to audit (default: 5).")
    parser.add_argument("--strict", action="store_true", help="Exit non-zero when corrupted art is detected.")
    args = parser.parse_args()

    results = [
        audit_pack(character, variant, args.write_metadata, args.version)
        for character in CHARACTERS
        for variant in VARIANTS
    ]
    invalid = [result for result in results if not result["valid"]]

    for result in results:
        status = "OK" if result["valid"] else "INVALID"
        print(
            f"{status:7} {result['character']:9}/{result['variant']:7} "
            f"frames={result['frames']:3} occupancy={result['median_occupancy']:.3f} "
            f"body={result['reference_body_width_ratio']:.3f}x{result['reference_body_height_ratio']:.3f}"
        )

    if invalid:
        print("\nCorrupted sprite art detected. Runtime will reject packs marked artIntegrity=invalid and use its safe fallback.")
        return 1 if args.strict else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
