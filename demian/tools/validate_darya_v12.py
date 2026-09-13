#!/usr/bin/env python3
"""Strict integrity checks for the Darya + Pishi V12 replacement pack."""
from __future__ import annotations

import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "public/assets/characters/darya"
VERSION = 12
FORBIDDEN = {"attack", "combo", "uppercut", "cast", "charge", "hurt", "punch", "kick", "hit"}


def main() -> None:
    expected_files = {"darya-pishi-v12-master.png"}
    for variant, cell in {"desktop": 256, "mobile": 192, "compact": 128}.items():
        image_name = f"darya-spritesheet-v{VERSION}-{variant}.png"
        atlas_name = f"darya-atlas-v{VERSION}-{variant}.json"
        expected_files.update((image_name, atlas_name))
        image = Image.open(DIR / image_name)
        atlas = json.loads((DIR / atlas_name).read_text(encoding="utf-8"))
        assert image.mode == "RGBA"
        assert image.size == (21 * cell, 12 * cell)
        assert image.getchannel("A").getextrema() == (0, 255)
        assert atlas["meta"]["version"] == VERSION
        assert atlas["meta"]["generatedFrameCount"] == 252
        assert len(atlas["frames"]) == 252
        assert set(atlas["meta"]["directions"]) == {"n", "ne", "e", "se", "s", "sw", "w", "nw"}
        assert not FORBIDDEN.intersection(map(str.lower, atlas["animations"]))
        assert atlas["companion"]["bakedIntoEveryFrame"] is True
        for animation in atlas["animations"].values():
            for frame in animation.get("frames", []):
                assert frame in atlas["frames"]
            for directional in animation.get("framesByDirection", {}).values():
                assert directional
                assert all(frame in atlas["frames"] for frame in directional)

    actual = {path.name for path in DIR.iterdir() if path.is_file()}
    assert actual == expected_files, f"stale or missing Darya files: {sorted(actual ^ expected_files)}"
    print("Darya V12 validation passed: 3 variants, 252 frames each, no legacy assets.")


if __name__ == "__main__":
    main()
