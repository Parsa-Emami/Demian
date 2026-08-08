#!/usr/bin/env python3
"""Repair the bundled PARSA V5 sprite pack without redrawing the source art.

The supplied desktop sheet contains two reproducible defects:
1. Near-black opaque salt/noise pixels in regions that should be transparent.
2. Small transparent holes inside the foreground plus detached locomotion fragments.

The repair uses only deterministic pixel operations on the existing artwork. It removes the
near-black background corruption, repairs small enclosed holes by local inpainting, removes
detached run/jump fragments above the main body, then derives mobile/compact sheets from the
repaired desktop master so all runtime variants stay identical in content.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CHARACTER = "parsa"
DIRECTORY = ROOT / "public" / "assets" / "characters" / CHARACTER
DESKTOP_CELL = 256
COLUMNS = 15
ROWS = 8
BLACK_NOISE_MAX = 4
ALPHA_THRESHOLD = 8


def remove_detached_upper_components(tile: np.ndarray, frame_name: str) -> None:
    mask = (tile[:, :, 3] > ALPHA_THRESHOLD).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count <= 2:
        return

    components = list(range(1, count))
    main = max(components, key=lambda component: int(stats[component, cv2.CC_STAT_AREA]))
    main_top = int(stats[main, cv2.CC_STAT_TOP])
    gap = max(4, round(tile.shape[0] * 0.04))
    large_fragment = max(24, round(tile.shape[0] * tile.shape[1] * 0.0025))
    locomotion = frame_name.startswith(("walk_e_", "walk_w_", "run_e_", "run_w_", "jump_e_", "jump_w_"))

    for component in components:
        if component == main:
            continue
        top = int(stats[component, cv2.CC_STAT_TOP])
        height = int(stats[component, cv2.CC_STAT_HEIGHT])
        bottom = top + height
        area = int(stats[component, cv2.CC_STAT_AREA])
        if bottom <= main_top - gap and (locomotion or area >= large_fragment):
            tile[labels == component] = (0, 0, 0, 0)


def repair_small_foreground_holes(tile: np.ndarray) -> None:
    alpha = (tile[:, :, 3] > ALPHA_THRESHOLD).astype(np.uint8) * 255
    kernel_size = max(5, round(tile.shape[0] * 0.043))
    if kernel_size % 2 == 0:
        kernel_size += 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    closed = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, kernel, iterations=1)
    repair_mask = (closed > 0) & (alpha == 0)
    if not repair_mask.any():
        return

    bgr = cv2.cvtColor(tile[:, :, :3], cv2.COLOR_RGB2BGR)
    inpaint_mask = repair_mask.astype(np.uint8) * 255
    repaired_bgr = cv2.inpaint(bgr, inpaint_mask, 3, cv2.INPAINT_TELEA)
    repaired_rgb = cv2.cvtColor(repaired_bgr, cv2.COLOR_BGR2RGB)
    tile[repair_mask, :3] = repaired_rgb[repair_mask]
    tile[repair_mask, 3] = 255



def has_baked_background_corruption(source: np.ndarray, atlas: dict[str, object]) -> bool:
    edge_to_edge = 0
    frames = atlas.get("frames", {})
    for frame in frames.values():
        x, y, w, h = (int(frame[key]) for key in ("x", "y", "w", "h"))
        alpha = source[y : y + h, x : x + w, 3]
        points = np.argwhere(alpha > ALPHA_THRESHOLD)
        if points.size == 0:
            continue
        top, left = points.min(axis=0)
        bottom, right = points.max(axis=0)
        if top == 0 and left == 0 and bottom == h - 1 and right == w - 1:
            edge_to_edge += 1
    return bool(frames) and edge_to_edge >= max(3, len(frames) // 2)

def repair_desktop() -> tuple[Image.Image, dict[str, object]]:
    atlas_path = DIRECTORY / f"{CHARACTER}-atlas-v5-desktop.json"
    sheet_path = DIRECTORY / f"{CHARACTER}-spritesheet-v5-desktop.png"
    atlas = json.loads(atlas_path.read_text(encoding="utf-8"))
    source = np.array(Image.open(sheet_path).convert("RGBA"))
    if not has_baked_background_corruption(source, atlas):
        return Image.fromarray(source, mode="RGBA"), atlas

    output = np.zeros_like(source)

    for frame_name, frame in atlas["frames"].items():
        x, y, w, h = (int(frame[key]) for key in ("x", "y", "w", "h"))
        tile = source[y : y + h, x : x + w].copy()
        near_black_noise = (tile[:, :, :3].max(axis=2) <= BLACK_NOISE_MAX) & (tile[:, :, 3] > 0)
        tile[near_black_noise] = (0, 0, 0, 0)
        remove_detached_upper_components(tile, frame_name)
        repair_small_foreground_holes(tile)
        output[y : y + h, x : x + w] = tile

    repaired = Image.fromarray(output, mode="RGBA")
    repaired.save(sheet_path, optimize=True, compress_level=9)
    return repaired, atlas


def derive_variant(desktop: Image.Image, variant: str, cell: int) -> None:
    output = Image.new("RGBA", (COLUMNS * cell, ROWS * cell), (0, 0, 0, 0))
    for index in range(COLUMNS * ROWS):
        source_x = (index % COLUMNS) * DESKTOP_CELL
        source_y = (index // COLUMNS) * DESKTOP_CELL
        frame = desktop.crop((source_x, source_y, source_x + DESKTOP_CELL, source_y + DESKTOP_CELL))
        rendered = frame.resize((cell, cell), Image.Resampling.LANCZOS)
        output.alpha_composite(rendered, ((index % COLUMNS) * cell, (index // COLUMNS) * cell))

    output.save(
        DIRECTORY / f"{CHARACTER}-spritesheet-v5-{variant}.png",
        optimize=True,
        compress_level=9,
    )


def main() -> None:
    atlas_path = DIRECTORY / f"{CHARACTER}-atlas-v5-desktop.json"
    sheet_path = DIRECTORY / f"{CHARACTER}-spritesheet-v5-desktop.png"
    atlas = json.loads(atlas_path.read_text(encoding="utf-8"))
    source = np.array(Image.open(sheet_path).convert("RGBA"))
    if not has_baked_background_corruption(source, atlas):
        print("PARSA V5 sprite pack is already clean; no changes were required.")
        return

    desktop, _ = repair_desktop()
    derive_variant(desktop, "mobile", 192)
    derive_variant(desktop, "compact", 128)
    print("PARSA V5 desktop repaired; mobile and compact variants regenerated from the repaired master.")


if __name__ == "__main__":
    main()
