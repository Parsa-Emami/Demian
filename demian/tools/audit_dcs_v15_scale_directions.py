from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "assets" / "characters"
DIRECTIONS = ("s", "sw", "w", "nw", "n", "ne", "e", "se")
VARIANTS = ("lite", "runtime", "detail", "compact", "mobile", "desktop")
STATES = ("idle", "walk", "run", "takeoff", "jump", "fall", "land", "slide", "turn", "celebrate")
TARGETS = ("darya", "setayesh", "negar", "mobina", "arsal")


def median(values):
    return round(statistics.median(values), 4) if values else None


def measure_frame(image, rect, pivot, ratio, world_height):
    x, y, w, h = (rect[key] for key in ("x", "y", "w", "h"))
    if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > image.width or y + h > image.height:
        raise ValueError(f"Frame outside atlas: {rect}")
    alpha = image.crop((x, y, x + w, y + h)).getchannel("A")
    box = alpha.point(lambda value: 255 if value > 32 else 0).getbbox()
    if box is None:
        raise ValueError(f"Empty frame: {rect}")
    left, top, right, bottom = box
    return {
        "silhouette_height_px": bottom - top,
        "silhouette_width_px": right - left,
        "height_cell_ratio": (bottom - top) / h,
        "rendered_height_world": (bottom - top) / h * world_height / ratio,
        "ground_offset_cell": (bottom - pivot * h) / h,
        "touches_edge": left == 0 or top == 0 or right == w or bottom == h,
    }


def inspect(slug, variant, version):
    directory = ASSETS / slug
    atlas = json.loads((directory / f"{slug}-atlas-v{version}-{variant}.json").read_text(encoding="utf-8"))
    ratio = float(atlas["render"]["referenceBodyHeightRatio"])
    height = float(atlas["display"]["worldHeight"])
    pivot = float(atlas["pivot"]["y"])
    if not 0 < ratio <= 1 or height <= 0 or not 0 <= pivot <= 1:
        raise ValueError(f"Invalid scale contract: {slug}/{variant}")
    with Image.open(directory / atlas["meta"]["image"]) as source:
        image = source.convert("RGBA")
    cache = {}
    def measure(name):
        if name not in cache:
            cache[name] = measure_frame(image, atlas["frames"][name], pivot, ratio, height)
        return cache[name]
    states = {}
    for state in STATES:
        clip = atlas["animations"].get(state)
        if not clip:
            states[state] = {"missing": True}
            continue
        names = clip.get("frames", [])
        samples = [measure(name) for name in dict.fromkeys(names)]
        directions = clip.get("framesByDirection", {})
        directional_samples = {}
        for direction in DIRECTIONS:
            sequence = directions.get(direction, [])
            values = [measure(name) for name in dict.fromkeys(sequence)]
            directional_samples[direction] = {
                "logical_frames": len(sequence),
                "distinct_cells": len({tuple(atlas["frames"][name][key] for key in ("x", "y", "w", "h")) for name in sequence}),
                "median_world_silhouette_height": median([item["rendered_height_world"] for item in values]),
            }
        states[state] = {
            "median_world_silhouette_height": median([item["rendered_height_world"] for item in samples]),
            "median_cell_height": median([item["height_cell_ratio"] for item in samples]),
            "min_world_silhouette_height": round(min(item["rendered_height_world"] for item in samples), 4) if samples else None,
            "max_world_silhouette_height": round(max(item["rendered_height_world"] for item in samples), 4) if samples else None,
            "max_ground_offset_cell": round(max(abs(item["ground_offset_cell"]) for item in samples), 4) if samples else None,
            "edge_touch_count": sum(item["touches_edge"] for item in samples),
            "distinct_direction_sequences": len({tuple(directions[d]) for d in DIRECTIONS if directions.get(d)}),
            "directions": directional_samples,
        }
    turn = atlas["animations"]["turn"]
    front = turn.get("framesByDirection", {}).get("s", turn["frames"])[0]
    front_metrics = measure(front)
    return {
        "slug": slug, "version": version, "variant": variant, "declared_ratio": ratio,
        "declared_world_height": height, "foot_pivot": pivot,
        "front_standing_silhouette": front_metrics,
        "states": states,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--characters", nargs="+")
    parser.add_argument("--variants", nargs="+", choices=VARIANTS, default=list(VARIANTS))
    parser.add_argument("--version", type=int, choices=(14, 15), default=14)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    slugs = args.characters or (["darya", "arsal"] if args.version == 15 else TARGETS)
    results = [inspect(slug, variant, args.version) for slug in slugs for variant in args.variants]
    report = {
        "status": "measurement_only",
        "limitations": [
            "Alpha bounds measure silhouette, not anatomical height; hair, accessories and companions may affect bounds.",
            "Identical direction sequences prove reuse; different identifiers alone do not prove independently drawn poses.",
            "Do not normalize individual frames or compressed jump/landing/slide poses to standing height.",
            "No assets, physics, or score rules are modified.",
        ],
        "results": results,
    }
    output = json.dumps(report, indent=2, ensure_ascii=False)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(output + "\n", encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
