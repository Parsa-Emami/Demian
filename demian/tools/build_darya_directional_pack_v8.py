#!/usr/bin/env python3
"""Build Darya v8 with real 8-direction presentation poses and smooth locomotion.

The v7 Darya pack contains excellent side-view walk/run/jump cycles, but its atlas
maps north/south/diagonal movement to the same east/west art.  This builder keeps
all v7 artwork unchanged for E/W, extracts the FRONT / 3/4 / BACK concept poses
from Darya's canonical reference sheet, synthesizes subtle motion cycles from
those exact poses, and appends them to each runtime variant.

Only Darya is changed.  Pishi is part of every extracted pose, so the companion
always faces and travels in the same direction as Darya.
"""
from __future__ import annotations

import copy
import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CHAR_DIR = ROOT / "public" / "assets" / "characters" / "darya"
REFERENCE = CHAR_DIR / "darya-character-sheet-reference-v3.png"
VARIANTS = ("desktop", "mobile", "compact")
SOURCE_VERSION = 7
TARGET_VERSION = 8
COLUMNS = 21

# Crop rectangles measured on the 1448x1086 reference supplied by the user.
# They are scaled proportionally, so the builder works with the higher-resolution
# canonical reference copy checked into the project as well.
REFERENCE_BASIS = (1448, 1086)
CROPS = {
    "s": (470, 245, 700, 655),       # FRONT
    "sw": (710, 245, 930, 655),      # 3/4 VIEW
    "w": (940, 245, 1150, 655),      # SIDE (used as visual reference only)
    "n": (1160, 245, 1410, 655),     # BACK (avoids the presentation border)
}

DIRECTION_ORDER = ("n", "ne", "e", "se", "s", "sw", "w", "nw")
GENERATED_DIRECTIONS = ("n", "ne", "se", "s", "sw", "nw")

CYCLE_COUNTS = {
    "idle": 8,
    "walk": 12,
    "run": 16,
    "jump": 12,
    "land": 8,
}


def scaled_box(box: tuple[int, int, int, int], size: tuple[int, int]) -> tuple[int, int, int, int]:
    sx = size[0] / REFERENCE_BASIS[0]
    sy = size[1] / REFERENCE_BASIS[1]
    x0, y0, x1, y1 = box
    return (round(x0 * sx), round(y0 * sy), round(x1 * sx), round(y1 * sy))


def extract_foreground(source: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    crop = source.crop(box).convert("RGB")
    rgb = np.array(crop)
    h, w = rgb.shape[:2]

    mask = np.zeros((h, w), np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(rgb, mask, (4, 4, max(1, w - 8), max(1, h - 8)), bgd, fgd, 7, cv2.GC_INIT_WITH_RECT)
    alpha = np.where((mask == cv2.GC_BGD) | (mask == cv2.GC_PR_BGD), 0, 255).astype("uint8")

    # Remove tiny guide/grid fragments while retaining Darya + Pishi, even when
    # they are disconnected components in the reference art.
    count, labels, stats, _ = cv2.connectedComponentsWithStats(alpha, 8)
    clean = np.zeros_like(alpha)
    components: list[tuple[int, int]] = []
    for idx in range(1, count):
        x, y, ww, hh, area = stats[idx]
        if area < 24:
            continue
        if hh <= 5 and ww >= 24:
            continue
        components.append((int(area), idx))
    components.sort(reverse=True)
    for _, idx in components[:14]:
        clean[labels == idx] = 255

    pose = Image.fromarray(np.dstack([rgb, clean]), "RGBA")
    bbox = pose.getbbox()
    return pose.crop(bbox) if bbox else pose


def shear_pose(pose: Image.Image, amount: float) -> Image.Image:
    """Create a subtle rear three-quarter cue without repainting the character."""
    pad = max(4, round(pose.width * 0.10))
    canvas = Image.new("RGBA", (pose.width + pad * 2, pose.height), (0, 0, 0, 0))
    canvas.alpha_composite(pose, (pad, 0))
    # x' = x + amount * (y - h/2)
    c = -amount * (canvas.height / 2)
    return canvas.transform(
        canvas.size,
        Image.Transform.AFFINE,
        (1, amount, c, 0, 1, 0),
        resample=Image.Resampling.BICUBIC,
    )


def fit_pose(pose: Image.Image, cell: int) -> Image.Image:
    # Preserve exact proportions; reserve a little room for bounce/jump motion.
    max_w = cell * 0.82
    max_h = cell * 0.87
    scale = min(max_w / max(1, pose.width), max_h / max(1, pose.height))
    size = (max(1, round(pose.width * scale)), max(1, round(pose.height * scale)))
    return pose.resize(size, Image.Resampling.LANCZOS)


def render_cycle_frame(base: Image.Image, cell: int, action: str, index: int, count: int, direction: str) -> Image.Image:
    phase = (index / max(1, count)) * math.tau
    canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))

    if action == "idle":
        bob = math.sin(phase) * cell * 0.006
        sway = math.sin(phase * 0.5) * cell * 0.004
        sx = 1.0 + math.sin(phase) * 0.002
        sy = 1.0 - math.sin(phase) * 0.003
    elif action == "walk":
        bob = -abs(math.sin(phase)) * cell * 0.018
        sway = math.sin(phase) * cell * 0.012
        sx = 1.0 + math.cos(phase * 2) * 0.004
        sy = 1.0 - math.cos(phase * 2) * 0.006
    elif action == "run":
        bob = -abs(math.sin(phase)) * cell * 0.028
        sway = math.sin(phase) * cell * 0.016
        sx = 1.0 + math.cos(phase * 2) * 0.007
        sy = 1.0 - math.cos(phase * 2) * 0.010
    elif action == "jump":
        t = index / max(1, count - 1)
        lift = math.sin(math.pi * t) * cell * 0.16
        bob = -lift
        sway = math.sin(math.pi * t) * (cell * 0.015 if direction in ("se", "sw", "ne", "nw") else 0)
        # Tiny takeoff/landing squash, stretch near the apex.
        sy = 0.985 + math.sin(math.pi * t) * 0.025
        sx = 1.015 - math.sin(math.pi * t) * 0.012
    else:  # land
        t = index / max(1, count - 1)
        impact = math.exp(-5.0 * t) * math.sin(t * math.pi * 2.5)
        bob = abs(impact) * cell * 0.015
        sway = 0
        sx = 1.0 + impact * 0.018
        sy = 1.0 - impact * 0.026

    width = max(1, round(base.width * sx))
    height = max(1, round(base.height * sy))
    posed = base.resize((width, height), Image.Resampling.LANCZOS)

    x = round((cell - width) / 2 + sway)
    y = round(cell - height - cell * 0.035 + bob)
    canvas.alpha_composite(posed, (x, y))
    return canvas


def direction_bases(reference: Image.Image, cell: int) -> dict[str, Image.Image]:
    raw_s = extract_foreground(reference, scaled_box(CROPS["s"], reference.size))
    raw_sw = extract_foreground(reference, scaled_box(CROPS["sw"], reference.size))
    raw_n = extract_foreground(reference, scaled_box(CROPS["n"], reference.size))

    # South diagonals use the exact 3/4 reference and its mirror.  Rear diagonals
    # use a very subtle shear of the exact back pose; no face/outfit repainting.
    raw_se = raw_sw.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    raw_nw = shear_pose(raw_n, -0.055)
    raw_ne = raw_nw.transpose(Image.Transpose.FLIP_LEFT_RIGHT)

    return {
        "s": fit_pose(raw_s, cell),
        "sw": fit_pose(raw_sw, cell),
        "se": fit_pose(raw_se, cell),
        "n": fit_pose(raw_n, cell),
        "nw": fit_pose(raw_nw, cell),
        "ne": fit_pose(raw_ne, cell),
    }


def append_frame(sheet: Image.Image, frame: Image.Image, index: int, cell: int) -> tuple[int, int]:
    col = index % COLUMNS
    row = index // COLUMNS
    x, y = col * cell, row * cell
    sheet.alpha_composite(frame, (x, y))
    return x, y


def build_variant(variant: str) -> None:
    atlas_path = CHAR_DIR / f"darya-atlas-v{SOURCE_VERSION}-{variant}.json"
    sheet_path = CHAR_DIR / f"darya-spritesheet-v{SOURCE_VERSION}-{variant}.png"
    atlas = json.loads(atlas_path.read_text(encoding="utf-8"))
    source_sheet = Image.open(sheet_path).convert("RGBA")
    cell = int(atlas["meta"]["frameSize"]["w"])
    if cell != int(atlas["meta"]["frameSize"]["h"]):
        raise RuntimeError("Darya runtime cells must be square")

    reference = Image.open(REFERENCE).convert("RGBA")
    bases = direction_bases(reference, cell)

    generated: dict[str, dict[str, list[Image.Image]]] = {}
    for direction in GENERATED_DIRECTIONS:
        generated[direction] = {}
        for action, count in CYCLE_COUNTS.items():
            generated[direction][action] = [
                render_cycle_frame(bases[direction], cell, action, i, count, direction)
                for i in range(count)
            ]

    old_frames = copy.deepcopy(atlas.get("frames", {}))
    old_count = len(old_frames)
    add_count = sum(len(frames) for by_action in generated.values() for frames in by_action.values())
    total_count = old_count + add_count
    rows = math.ceil(total_count / COLUMNS)
    target_sheet = Image.new("RGBA", (COLUMNS * cell, rows * cell), (0, 0, 0, 0))
    target_sheet.alpha_composite(source_sheet, (0, 0))

    new_atlas = copy.deepcopy(atlas)
    new_atlas["frames"] = old_frames
    next_index = old_count
    frame_names: dict[str, dict[str, list[str]]] = {d: {} for d in GENERATED_DIRECTIONS}

    for direction in GENERATED_DIRECTIONS:
        for action in ("idle", "walk", "run", "jump", "land"):
            names: list[str] = []
            for i, frame in enumerate(generated[direction][action]):
                name = f"v8_{action}_{direction}_{i:02d}"
                x, y = append_frame(target_sheet, frame, next_index, cell)
                new_atlas["frames"][name] = {"x": x, "y": y, "w": cell, "h": cell}
                names.append(name)
                next_index += 1
            frame_names[direction][action] = names

    def assign(animation_name: str, cycle: str, subset: slice | None = None) -> None:
        animation = new_atlas.get("animations", {}).get(animation_name)
        if not animation:
            return
        mapping = animation.setdefault("framesByDirection", {})
        for direction in GENERATED_DIRECTIONS:
            names = frame_names[direction][cycle]
            mapping[direction] = names[subset] if subset is not None else list(names)

    # Preserve facing while stopped, and use the exact direction in locomotion.
    for name in ("idle", "breathe", "blink", "ready"):
        assign(name, "idle")
        animation = new_atlas.get("animations", {}).get(name)
        if animation:
            mapping = animation.setdefault("framesByDirection", {})
            walk_map = new_atlas.get("animations", {}).get("walk", {}).get("framesByDirection", {})
            east = (walk_map.get("e") or animation.get("frames") or [])[:1]
            west = (walk_map.get("w") or animation.get("frames") or [])[:1]
            if east:
                mapping["e"] = east * CYCLE_COUNTS["idle"]
            if west:
                mapping["w"] = west * CYCLE_COUNTS["idle"]
    for name in ("walk", "tiptoe", "turn"):
        assign(name, "walk")
    for name in ("run", "sprint", "dash", "slide", "dodge", "skid"):
        assign(name, "run")
    assign("jump", "jump")
    assign("takeoff", "jump", slice(0, 6))
    assign("hop", "jump")
    assign("hover", "jump", slice(4, 9))
    assign("fall", "jump", slice(5, 12))
    assign("land", "land")

    # Slightly tuned per-state FPS; the renderer's sub-frame blending provides
    # the final smoothness between these high-quality directional poses.
    for name, fps in {
        "idle": 10, "breathe": 10, "blink": 10, "ready": 10,
        "walk": 20, "tiptoe": 17, "turn": 18,
        "run": 27, "sprint": 31, "dash": 30, "slide": 26, "dodge": 26, "skid": 24,
        "jump": 22, "takeoff": 24, "hop": 22, "hover": 18, "fall": 20, "land": 24,
    }.items():
        if name in new_atlas.get("animations", {}):
            new_atlas["animations"][name]["fps"] = fps

    meta = new_atlas.setdefault("meta", {})
    meta.update({
        "version": TARGET_VERSION,
        "variant": variant,
        "image": f"darya-spritesheet-v{TARGET_VERSION}-{variant}.png",
        "size": {"w": target_sheet.width, "h": target_sheet.height},
        "grid": {"columns": COLUMNS, "rows": rows},
        "generatedFrameCount": len(new_atlas["frames"]),
        "directionalFrames": True,
        "directions": list(DIRECTION_ORDER),
        "sourceVersion": SOURCE_VERSION,
        "artIntegrity": "valid",
        "note": (
            "Darya v8: v7 E/W animation art preserved. N/S/diagonal frames are built from "
            "the exact FRONT / 3/4 / BACK reference poses; Pishi is baked into every frame. "
            "Directional idle + walk/run/jump/land cycles and sub-frame blending enabled."
        ),
    })
    render = new_atlas.setdefault("render", {})
    render["frameBlend"] = True
    render["frameBlendMaxAlpha"] = 0.46
    render["directionalPoseSource"] = "reference-v3"
    render["eightDirectionLocomotion"] = True
    motion = new_atlas.setdefault("motion", {})
    motion["transitionSeconds"] = 0.045
    motion["directionDepthScale"] = 0.075

    companion = new_atlas.setdefault("companion", {})
    companion.update({
        "id": "pishi",
        "alwaysVisible": True,
        "bakedIntoEveryFrame": True,
        "directionSynchronized": True,
    })

    target_sheet_path = CHAR_DIR / f"darya-spritesheet-v{TARGET_VERSION}-{variant}.png"
    target_atlas_path = CHAR_DIR / f"darya-atlas-v{TARGET_VERSION}-{variant}.json"
    target_sheet.save(target_sheet_path, optimize=True, compress_level=9)
    target_atlas_path.write_text(json.dumps(new_atlas, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Built {variant}: {target_sheet.size}, {len(new_atlas['frames'])} frames")


def main() -> int:
    if not REFERENCE.exists():
        raise SystemExit(f"Missing Darya reference: {REFERENCE}")
    for variant in VARIANTS:
        build_variant(variant)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
