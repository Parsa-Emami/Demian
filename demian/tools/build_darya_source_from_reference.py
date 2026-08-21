#!/usr/bin/env python3
"""Build Darya's canonical 4x3 source sheet from the flattened reference spritesheet.

The provided reference artwork is a presentation sheet (with titles, row labels and guide
lines), not a production-ready transparent source atlas. This helper extracts twelve clean
base poses with GrabCut-based foreground isolation and packs them into the canonical 4x3
source sheet consumed by the existing Demian character-pack pipeline.

Output:
    public/assets/characters/darya/darya-spritesheet.png
    public/assets/characters/darya/darya-source-extracted-preview.png
    public/assets/characters/darya/darya-character-sheet-reference-v2.png
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CHAR_DIR = ROOT / "public" / "assets" / "characters" / "darya"
REFERENCE = Path("/mnt/data/ghostwriter_images/context/a451f262-9774-5dfc-b7ef-098881198acd.jpg")
CELL = 256
GRID = (4, 3)

# x0, y0, x1, y1 on the flattened presentation sheet.
POSES = {
    "idle_0": (185, 245, 345, 420),
    "idle_1": (440, 245, 600, 420),
    "walk_e": (175, 432, 345, 602),
    "walk_w": (1045, 432, 1215, 602),
    "run_e": (175, 620, 345, 790),
    "run_w": (1045, 620, 1215, 790),
    "jump_0": (600, 800, 780, 980),
    "jump_1": (910, 750, 1088, 980),
    "attack_e": (185, 990, 350, 1178),
    "attack_w": (1005, 990, 1265, 1178),
    "win_0": (195, 1168, 375, 1365),
    "win_1": (1800, 1165, 2025, 1370),
}
ORDER = [
    "idle_0", "idle_1", "walk_e", "walk_w",
    "run_e", "run_w", "jump_0", "jump_1",
    "attack_e", "attack_w", "win_0", "win_1",
]


def extract_pose(source: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    crop = source.crop(box)
    rgb = np.array(crop.convert("RGB"))
    h, w = rgb.shape[:2]

    mask = np.zeros((h, w), np.uint8)
    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    rect = (4, 4, max(1, w - 8), max(1, h - 8))
    cv2.grabCut(rgb, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
    alpha = np.where((mask == cv2.GC_BGD) | (mask == cv2.GC_PR_BGD), 0, 255).astype("uint8")

    # Remove thin detached guide-line fragments and tiny specks.
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(alpha, 8)
    clean = np.zeros_like(alpha)
    components: list[tuple[int, int, int, int, int, int]] = []
    for i in range(1, num_labels):
        x, y, ww, hh, area = stats[i]
        if area < 20:
            continue
        if hh <= 5 and ww >= 20:
            continue
        components.append((area, i, x, y, ww, hh))
    components.sort(reverse=True)
    for _, i, _, _, _, _ in components[:6]:
        clean[labels == i] = 255

    rgba = np.dstack([rgb, clean])
    pose = Image.fromarray(rgba, "RGBA")
    bbox = pose.getbbox()
    if bbox:
        pose = pose.crop(bbox)

    # Fit into the canonical cell while keeping a foot-pivot style anchor.
    scale = min(220 / pose.width, 230 / pose.height, 1.0)
    nw = max(1, int(round(pose.width * scale)))
    nh = max(1, int(round(pose.height * scale)))
    pose = pose.resize((nw, nh), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    x = (CELL - nw) // 2
    y = CELL - nh - 8
    canvas.alpha_composite(pose, (x, y))
    return canvas


def main() -> int:
    if not REFERENCE.exists():
        raise SystemExit(f"Reference image not found: {REFERENCE}")

    CHAR_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(REFERENCE).convert("RGBA")

    # Keep a copy of the supplied concept / presentation sheet beside the assets.
    reference_out = CHAR_DIR / "darya-character-sheet-reference-v2.png"
    source.save(reference_out)

    frames = [extract_pose(source, POSES[name]) for name in ORDER]

    sheet = Image.new("RGBA", (GRID[0] * CELL, GRID[1] * CELL), (0, 0, 0, 0))
    preview = Image.new("RGBA", (GRID[0] * CELL, GRID[1] * CELL), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        x = (index % GRID[0]) * CELL
        y = (index // GRID[0]) * CELL
        sheet.alpha_composite(frame, (x, y))
        preview.alpha_composite(frame, (x, y))

    (CHAR_DIR / "darya-spritesheet.png").write_bytes(b"")
    sheet.save(CHAR_DIR / "darya-spritesheet.png", optimize=True, compress_level=9)
    preview.save(CHAR_DIR / "darya-source-extracted-preview.png", optimize=True, compress_level=9)
    print(f"Wrote canonical source sheet: {CHAR_DIR / 'darya-spritesheet.png'}")
    print(f"Wrote extraction preview:    {CHAR_DIR / 'darya-source-extracted-preview.png'}")
    print(f"Wrote reference copy:       {reference_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
