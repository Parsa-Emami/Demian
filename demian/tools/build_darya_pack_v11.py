#!/usr/bin/env python3
"""Build the canonical Darya v11 pack from the supplied transparent character sheet."""
from __future__ import annotations

import json
import os
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/assets/characters/darya"
SOURCE = Path(os.environ.get("DARYA_REFERENCE", OUT / "darya-character-sheet-reference-v11.png"))
if not SOURCE.exists():
    SOURCE = Path(__file__).resolve().parents[4] / "upload/886b58af-42c5-494d-9391-4f2f74dca90e.png"
VARIANTS = {"desktop": 256, "mobile": 192, "compact": 128}
COLS, ROWS = 8, 7


def frame_image(source: Image.Image, col: int, row: int, cell: int) -> Image.Image:
    # The supplied sheet is a transparent 8-column x 7-row presentation grid.
    x0, x1 = round(source.width * col / COLS), round(source.width * (col + 1) / COLS)
    y0, y1 = round(source.height * row / ROWS), round(source.height * (row + 1) / ROWS)
    crop = source.crop((x0, y0, x1, y1))
    bbox = crop.getbbox()
    if bbox:
        crop = crop.crop(bbox)
    max_w, max_h = cell * 0.92, cell * 0.94
    scale = min(max_w / max(1, crop.width), max_h / max(1, crop.height))
    crop = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    canvas.alpha_composite(crop, ((cell - crop.width) // 2, cell - crop.height - round(cell * 0.035)))
    return canvas


def make_atlas(variant: str, cell: int, source: Image.Image) -> None:
    sheet = Image.new("RGBA", (COLS * cell, ROWS * cell), (0, 0, 0, 0))
    frames = {}
    for row in range(ROWS):
        for col in range(COLS):
            index = row * COLS + col
            name = f"frame_{index:03d}"
            sheet.alpha_composite(frame_image(source, col, row, cell), (col * cell, row * cell))
            frames[name] = {"x": col * cell, "y": row * cell, "w": cell, "h": cell}

    def row_frames(row: int):
        return [f"frame_{row * COLS + col:03d}" for col in range(COLS)]

    idle, walk, run, interact, celebrate, rest, directions = [row_frames(row) for row in range(7)]
    animations = {
        "idle": {"frames": idle, "fps": 8},
        "walk": {"frames": walk, "fps": 12},
        "run": {"frames": run, "fps": 16},
        "sprint": {"frames": run, "fps": 18},
        "jump": {"frames": [*run[2:6], *interact[2:6]], "fps": 12, "loop": False},
        "takeoff": {"frames": run[:4], "fps": 14, "loop": False},
        "fall": {"frames": run[4:], "fps": 12, "loop": False},
        "land": {"frames": [*run[6:], *idle[:2]], "fps": 12, "loop": False},
        "hop": {"frames": [*run[1:5], *idle[:2]], "fps": 14, "loop": False},
        "skid": {"frames": run[4:8], "fps": 14, "loop": False},
        "dash": {"frames": run, "fps": 20},
        "slide": {"frames": rest[:6], "fps": 12, "loop": False},
        "dodge": {"frames": [*run[5:], *rest[:3]], "fps": 16, "loop": False},
        "win": {"frames": celebrate, "fps": 10, "loop": False},
        "celebrate": {"frames": celebrate, "fps": 10, "loop": False},
        "dance": {"frames": celebrate, "fps": 12},
        "wave": {"frames": interact, "fps": 10, "loop": False},
        "salute": {"frames": interact[2:] + interact[:2], "fps": 10, "loop": False},
        "spin": {"frames": celebrate, "fps": 12, "loop": False},
        "crouch": {"frames": rest, "fps": 8, "loop": False},
        "laugh": {"frames": celebrate[:6], "fps": 10, "loop": False},
        "pose": {"frames": interact[:4], "fps": 8, "loop": False},
        "sleep": {"frames": rest, "fps": 6},
        "taunt": {"frames": celebrate[2:] + celebrate[:2], "fps": 10, "loop": False},
    }
    # The final row is a complete eight-direction facing set. Locomotion uses
    # it as a stable directional presentation while preserving authored cycles.
    for name in ("idle", "walk", "run", "sprint"):
        animations[name]["framesByDirection"] = {d: [directions[i]] for i, d in enumerate(("n", "ne", "e", "se", "s", "sw", "w", "nw"))}

    atlas = {
        "meta": {"name": "DARYA / دریا", "version": 11, "variant": variant,
                 "image": f"darya-spritesheet-v11-{variant}.png", "size": {"w": COLS * cell, "h": ROWS * cell},
                 "frameSize": {"w": cell, "h": cell}, "grid": {"columns": COLS, "rows": ROWS},
                 "generatedFrameCount": COLS * ROWS, "redesign": "v11 complete Darya + Pishi rebuild",
                 "combatAnimationsRemoved": True, "artIntegrity": "valid"},
        "frames": frames,
        "animations": animations,
        "fallbacks": {"breathe": "idle", "ready": "idle", "turn": "walk", "hover": "jump", "guitar": "dance", "guitar_loop": "dance"},
        "pivot": {"x": 0.5, "y": 0.96},
        "display": {"worldWidth": 3.75, "worldHeight": 3.75},
        "render": {"referenceBodyWidthRatio": 0.72, "referenceBodyHeightRatio": 0.86, "frameBlend": True, "frameBlendMaxAlpha": 0.24},
        "companion": {"id": "pishi", "name": "Pishi / پیشی", "alwaysVisible": True, "bakedIntoEveryFrame": True},
    }
    OUT.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT / f"darya-spritesheet-v11-{variant}.png", optimize=True, compress_level=9)
    (OUT / f"darya-atlas-v11-{variant}.json").write_text(json.dumps(atlas, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    OUT.joinpath("darya-character-sheet-reference-v11.png").write_bytes(SOURCE.read_bytes())
    for variant, cell in VARIANTS.items():
        make_atlas(variant, cell, source)


if __name__ == "__main__":
    main()
