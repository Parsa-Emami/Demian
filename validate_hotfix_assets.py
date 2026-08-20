#!/usr/bin/env python3
from pathlib import Path
from PIL import Image
import json

root = Path(__file__).resolve().parent
assets = root / "demian/public/assets/characters/setayesh"

for variant in ("desktop", "mobile", "compact"):
    atlas_path = assets / f"setayesh-atlas-v5-{variant}.json"
    image_path = assets / f"setayesh-spritesheet-v5-{variant}.png"
    atlas = json.loads(atlas_path.read_text(encoding="utf-8"))
    image = Image.open(image_path).convert("RGBA")

    assert tuple(atlas["meta"]["size"].values()) == image.size
    assert atlas["meta"]["image"] == image_path.name
    assert image.getchannel("A").getextrema()[0] == 0
    assert {"idle", "walk", "run", "jump", "win"} <= set(atlas["animations"])

    for name, frame in atlas["frames"].items():
        assert frame["x"] >= 0 and frame["y"] >= 0
        assert frame["x"] + frame["w"] <= image.width
        assert frame["y"] + frame["h"] <= image.height

print("Setayesh local atlas validation: PASS")
