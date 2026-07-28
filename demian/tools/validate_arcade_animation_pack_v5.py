#!/usr/bin/env python3
"""Validate Demian V5 sprite sheets and atlas manifests."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ("tiam", "ronak", "amirreza")
VARIANTS = {
    "desktop": (3840, 2048),
    "mobile": (2880, 1536),
    "compact": (1920, 1024),
}
EXPECTED_FRAMES = 120
EXPECTED_ANIMATIONS = 34


def animation_references(animation: dict[str, object]) -> list[str]:
    references: list[str] = []

    for key in ("frames", "framesRight", "framesLeft"):
        value = animation.get(key, [])
        if isinstance(value, list):
            references.extend(str(frame) for frame in value)

    directional = animation.get("framesByDirection", {})
    if isinstance(directional, dict):
        for value in directional.values():
            if isinstance(value, list):
                references.extend(str(frame) for frame in value)

    return references


def validate_variant(character: str, variant: str, expected_size: tuple[int, int]) -> list[str]:
    directory = ROOT / "public" / "assets" / "characters" / character
    image_path = directory / f"{character}-spritesheet-v5-{variant}.png"
    atlas_path = directory / f"{character}-atlas-v5-{variant}.json"
    errors: list[str] = []

    if not image_path.exists():
        return [f"Missing image: {image_path.relative_to(ROOT)}"]
    if not atlas_path.exists():
        return [f"Missing atlas: {atlas_path.relative_to(ROOT)}"]

    with Image.open(image_path) as image:
        image_size = image.size

    atlas = json.loads(atlas_path.read_text(encoding="utf-8"))
    meta = atlas.get("meta", {})
    frames = atlas.get("frames", {})
    animations = atlas.get("animations", {})

    if image_size != expected_size:
        errors.append(f"{image_path.name}: expected {expected_size}, got {image_size}")

    expected_meta_size = {"w": expected_size[0], "h": expected_size[1]}
    if meta.get("size") != expected_meta_size:
        errors.append(f"{atlas_path.name}: invalid meta.size")
    if meta.get("variant") != variant:
        errors.append(f"{atlas_path.name}: invalid variant")
    if len(frames) != EXPECTED_FRAMES:
        errors.append(f"{atlas_path.name}: expected {EXPECTED_FRAMES} frames, got {len(frames)}")
    if len(animations) != EXPECTED_ANIMATIONS:
        errors.append(
            f"{atlas_path.name}: expected {EXPECTED_ANIMATIONS} animations, got {len(animations)}"
        )

    frame_names = set(frames)
    for animation_name, animation in animations.items():
        if not isinstance(animation, dict):
            errors.append(f"{atlas_path.name}: animation {animation_name} is invalid")
            continue

        missing = sorted(set(animation_references(animation)) - frame_names)
        if missing:
            errors.append(
                f"{atlas_path.name}: animation {animation_name} references missing frames {missing[:4]}"
            )

    width, height = image_size
    for frame_name, frame in frames.items():
        if not isinstance(frame, dict):
            errors.append(f"{atlas_path.name}: frame {frame_name} is invalid")
            continue

        x = int(frame.get("x", -1))
        y = int(frame.get("y", -1))
        frame_width = int(frame.get("w", 0))
        frame_height = int(frame.get("h", 0))
        if x < 0 or y < 0 or frame_width <= 0 or frame_height <= 0:
            errors.append(f"{atlas_path.name}: frame {frame_name} has invalid geometry")
        elif x + frame_width > width or y + frame_height > height:
            errors.append(f"{atlas_path.name}: frame {frame_name} is outside the image")

    return errors


def main() -> int:
    errors: list[str] = []

    for character in CHARACTERS:
        for variant, expected_size in VARIANTS.items():
            variant_errors = validate_variant(character, variant, expected_size)
            errors.extend(variant_errors)
            if not variant_errors:
                print(f"OK  {character:10} {variant:8} {expected_size[0]}x{expected_size[1]}")

    if errors:
        print("\nValidation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        f"\nValidated {len(CHARACTERS) * len(VARIANTS)} packs, "
        f"{EXPECTED_FRAMES} frames and {EXPECTED_ANIMATIONS} animations per atlas."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
