#!/usr/bin/env python3
"""Repair reproducible detached-frame artifacts in bundled Demian character art.

The AMIRREZA V5 run/jump sheets contain a detached shoe/ground fragment copied into the
upper edge of several cells. The artifact is spatially separated above the main character,
so it can be removed deterministically without redrawing or recolouring the intended art.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CHARACTER = "amirreza"
VARIANTS = ("desktop", "mobile", "compact")
TARGET_PREFIXES = ("run_e_", "run_w_", "jump_e_", "jump_w_")
ALPHA_THRESHOLD = 8


def repair_variant(variant: str) -> tuple[int, int]:
    directory = ROOT / "public" / "assets" / "characters" / CHARACTER
    atlas_path = directory / f"{CHARACTER}-atlas-v5-{variant}.json"
    sheet_path = directory / f"{CHARACTER}-spritesheet-v5-{variant}.png"
    atlas = json.loads(atlas_path.read_text(encoding="utf-8"))
    sheet = np.array(Image.open(sheet_path).convert("RGBA"))

    touched_frames = 0
    removed_pixels = 0

    for name, frame in atlas["frames"].items():
        if not name.startswith(TARGET_PREFIXES):
            continue

        x, y, w, h = (int(frame[key]) for key in ("x", "y", "w", "h"))
        tile = sheet[y : y + h, x : x + w]
        mask = (tile[:, :, 3] > ALPHA_THRESHOLD).astype(np.uint8)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        if count <= 2:
            continue

        component_ids = list(range(1, count))
        main_id = max(component_ids, key=lambda component_id: int(stats[component_id, cv2.CC_STAT_AREA]))
        main_top = int(stats[main_id, cv2.CC_STAT_TOP])
        gap = max(4, round(h * 0.04))
        frame_removed = 0

        for component_id in component_ids:
            if component_id == main_id:
                continue
            top = int(stats[component_id, cv2.CC_STAT_TOP])
            height = int(stats[component_id, cv2.CC_STAT_HEIGHT])
            bottom = top + height
            area = int(stats[component_id, cv2.CC_STAT_AREA])
            if area > 0 and bottom <= main_top - gap:
                component_mask = labels == component_id
                frame_removed += int(component_mask.sum())
                tile[component_mask] = (0, 0, 0, 0)

        if frame_removed:
            touched_frames += 1
            removed_pixels += frame_removed

    if touched_frames:
        Image.fromarray(sheet, mode="RGBA").save(sheet_path, optimize=True, compress_level=9)

    return touched_frames, removed_pixels


def main() -> None:
    for variant in VARIANTS:
        frames, pixels = repair_variant(variant)
        print(f"{CHARACTER}/{variant}: repaired {frames} frames, removed {pixels} detached pixels")


if __name__ == "__main__":
    main()
