#!/usr/bin/env python3
"""Strict structural validator for Demian V6 character sprite packs."""
from __future__ import annotations

import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ("tiam", "ronak", "amirreza", "parsa", "uzudi")
VARIANTS = {"desktop": 256, "mobile": 192, "compact": 128}
COLUMNS = 21
ROWS = 12
FRAME_COUNT = COLUMNS * ROWS
FORBIDDEN = {"attack", "combo", "uppercut", "cast", "charge", "hurt", "punch", "kick", "hit"}
REQUIRED = {
    "idle", "walk", "run", "sprint", "jump", "takeoff", "fall", "land",
    "hop", "skid", "dash", "slide", "dodge", "win", "celebrate", "dance",
    "wave", "salute", "spin", "crouch", "laugh", "pose", "sleep", "taunt",
}


def animation_frames(animation: dict) -> list[str]:
    values: list[str] = []
    for key in ("frames", "framesRight", "framesLeft"):
        if isinstance(animation.get(key), list):
            values.extend(animation[key])
    for frames in (animation.get("framesByDirection") or {}).values():
        if isinstance(frames, list):
            values.extend(frames)
    return values


def validate_pack(character: str, variant: str, cell: int) -> list[str]:
    errors: list[str] = []
    directory = ROOT / "public" / "assets" / "characters" / character
    atlas_path = directory / f"{character}-atlas-v6-{variant}.json"
    image_path = directory / f"{character}-spritesheet-v6-{variant}.png"
    if not atlas_path.exists() or not image_path.exists():
        return [f"{character}/{variant}: V6 files are missing"]

    atlas = json.loads(atlas_path.read_text(encoding="utf-8"))
    image = Image.open(image_path)
    expected_size = (COLUMNS * cell, ROWS * cell)
    if image.size != expected_size:
        errors.append(f"{character}/{variant}: PNG {image.size} != {expected_size}")
    if image.mode != "RGBA":
        errors.append(f"{character}/{variant}: PNG mode must be RGBA, got {image.mode}")

    meta = atlas.get("meta", {})
    if meta.get("version") != 6:
        errors.append(f"{character}/{variant}: meta.version must be 6")
    if meta.get("variant") != variant:
        errors.append(f"{character}/{variant}: meta.variant mismatch")
    if meta.get("generatedFrameCount") != FRAME_COUNT:
        errors.append(f"{character}/{variant}: generatedFrameCount must be {FRAME_COUNT}")
    if meta.get("combatAnimationsRemoved") is not True:
        errors.append(f"{character}/{variant}: combatAnimationsRemoved must be true")
    if meta.get("artIntegrity") != "valid":
        errors.append(f"{character}/{variant}: artIntegrity must be valid")

    frames = atlas.get("frames", {})
    if len(frames) != FRAME_COUNT:
        errors.append(f"{character}/{variant}: expected {FRAME_COUNT} frames, got {len(frames)}")
    for name, frame in frames.items():
        try:
            x, y, w, h = (int(frame[key]) for key in ("x", "y", "w", "h"))
        except Exception:
            errors.append(f"{character}/{variant}: malformed frame {name}")
            continue
        if w != cell or h != cell:
            errors.append(f"{character}/{variant}: frame {name} must be {cell}x{cell}")
        if x < 0 or y < 0 or x + w > image.width or y + h > image.height:
            errors.append(f"{character}/{variant}: frame {name} outside PNG")
        lowered = name.lower()
        if any(token in lowered for token in FORBIDDEN):
            errors.append(f"{character}/{variant}: forbidden combat frame {name}")

    animations = atlas.get("animations", {})
    forbidden_animations = FORBIDDEN.intersection(map(str.lower, animations.keys()))
    if forbidden_animations:
        errors.append(f"{character}/{variant}: forbidden animations {sorted(forbidden_animations)}")
    missing = REQUIRED.difference(animations)
    if missing:
        errors.append(f"{character}/{variant}: missing required animations {sorted(missing)}")

    for name, definition in animations.items():
        refs = animation_frames(definition)
        if not refs:
            errors.append(f"{character}/{variant}: animation {name} has no frames")
        unknown = sorted(set(refs).difference(frames))
        if unknown:
            errors.append(f"{character}/{variant}: animation {name} references unknown frames {unknown[:3]}")
        if any(token in name.lower() for token in FORBIDDEN):
            errors.append(f"{character}/{variant}: combat animation leaked: {name}")

    display = atlas.get("display", {})
    if float(display.get("worldWidth", 0)) != 3.75 or float(display.get("worldHeight", 0)) != 3.75:
        errors.append(f"{character}/{variant}: canonical display must be 3.75 x 3.75")
    render = atlas.get("render", {})
    if not 0.42 <= float(render.get("referenceBodyWidthRatio", 0)) <= 0.98:
        errors.append(f"{character}/{variant}: invalid referenceBodyWidthRatio")
    if not 0.62 <= float(render.get("referenceBodyHeightRatio", 0)) <= 0.98:
        errors.append(f"{character}/{variant}: invalid referenceBodyHeightRatio")

    return errors


def main() -> int:
    failures: list[str] = []
    for character in CHARACTERS:
        for variant, cell in VARIANTS.items():
            errors = validate_pack(character, variant, cell)
            if errors:
                failures.extend(errors)
                print(f"FAIL {character:9}/{variant:7} · {len(errors)} issue(s)")
            else:
                print(f"OK   {character:9}/{variant:7} · {FRAME_COUNT} frames · non-combat")

    if failures:
        print("\nValidation errors:")
        for error in failures:
            print(f" - {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
