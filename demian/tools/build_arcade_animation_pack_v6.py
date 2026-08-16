#!/usr/bin/env python3
"""Build Demian V6 expanded non-combat character packs from the validated V5 art.

V6 deliberately preserves the existing character artwork while increasing temporal
resolution for locomotion and airborne motion. Combat frames are never copied into
this pack. All built-in characters share the exact same grid, frame count, cell sizes,
and canonical in-world body dimensions.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Iterable

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ("tiam", "ronak", "amirreza", "parsa")
COLUMNS = 21
ROWS = 12
VARIANTS = {"desktop": 256, "mobile": 192, "compact": 128}
SEQUENCES = {
    "idle": 16,
    "walk_e": 28,
    "walk_w": 28,
    "run_e": 32,
    "run_w": 32,
    "jump_e": 24,
    "jump_w": 24,
    "land_e": 12,
    "land_w": 12,
    "celebrate": 16,
    "emote": 16,
    "hop_e": 6,
    "hop_w": 6,
}
assert sum(SEQUENCES.values()) == COLUMNS * ROWS == 252

FORBIDDEN = {"attack", "combo", "uppercut", "cast", "charge", "hurt", "punch", "kick", "hit"}
TARGET_IDLE_BODY_HEIGHT_RATIO = 0.86
ALPHA_THRESHOLD = 8


def alpha_height_ratio(frame: Image.Image) -> float:
    alpha = frame.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > ALPHA_THRESHOLD else 0).getbbox()
    if not bbox:
        return 0.0
    return max(0, bbox[3] - bbox[1]) / max(1, frame.height)


def median(values: list[float]) -> float:
    ordered = sorted(value for value in values if value > 0)
    if not ordered:
        return TARGET_IDLE_BODY_HEIGHT_RATIO
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def extract(sheet: Image.Image, frame: dict[str, int]) -> Image.Image:
    return sheet.crop((frame["x"], frame["y"], frame["x"] + frame["w"], frame["y"] + frame["h"]))


def source_sequence(sheet: Image.Image, atlas: dict, prefix: str) -> list[Image.Image]:
    names = sorted(
        (name for name in atlas["frames"] if name.startswith(f"{prefix}_")),
        key=lambda value: int(value.rsplit("_", 1)[-1]),
    )
    if not names:
        raise ValueError(f"Source sequence {prefix!r} is missing")
    return [extract(sheet, atlas["frames"][name]) for name in names]


def resample_sequence(frames: list[Image.Image], count: int, *, loop: bool) -> list[Image.Image]:
    """Create restrained alpha-aware in-betweens without changing the character design."""
    if count <= 0:
        return []
    output: list[Image.Image] = []
    denominator = count if loop else max(count - 1, 1)
    span = len(frames) if loop else max(len(frames) - 1, 1)

    for index in range(count):
        position = index / denominator * span
        left_index = int(math.floor(position)) % len(frames)
        fraction = position - math.floor(position)
        right_index = (left_index + 1) % len(frames) if loop else min(left_index + 1, len(frames) - 1)
        left, right = frames[left_index], frames[right_index]

        # Keep the stronger original pose as the base so facial/body details stay crisp.
        if fraction < 0.5:
            base, neighbour, blend = left, right, fraction * 0.64
        else:
            base, neighbour, blend = right, left, (1 - fraction) * 0.64
        generated = Image.blend(base, neighbour, max(0.0, min(0.32, blend)))
        output.append(generated)
    return output


def anchored_scale(frame: Image.Image, sx: float, sy: float, dy: int = 0) -> Image.Image:
    """Apply a tiny squash/stretch around the bottom-center pivot for extra charm."""
    width, height = frame.size
    new_w = max(1, int(round(width * sx)))
    new_h = max(1, int(round(height * sy)))
    resized = frame.resize((new_w, new_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    x = (width - new_w) // 2
    y = height - new_h + int(dy)
    canvas.alpha_composite(resized, (x, y))
    return canvas


def add_motion_character(frames: list[Image.Image], kind: str) -> list[Image.Image]:
    output: list[Image.Image] = []
    count = max(1, len(frames))
    for index, frame in enumerate(frames):
        phase = (index / count) * math.tau
        if kind == "walk":
            contact = math.cos(phase * 2)
            bounce = abs(math.sin(phase))
            sx, sy, dy = 1 + contact * 0.014, 1 - contact * 0.017, -round(bounce * 2)
        elif kind == "run":
            contact = math.cos(phase * 2)
            bounce = abs(math.sin(phase))
            sx, sy, dy = 1 + contact * 0.021, 1 - contact * 0.026, -round(bounce * 4)
        elif kind == "jump":
            progress = index / max(1, count - 1)
            lift = math.sin(progress * math.pi)
            sx, sy, dy = 1 - lift * 0.022, 1 + lift * 0.03, -round(lift * 3)
        elif kind == "land":
            impact = math.sin((index / max(1, count - 1)) * math.pi)
            sx, sy, dy = 1 + impact * 0.055, 1 - impact * 0.06, round(impact * 2)
        elif kind == "hop":
            lift = math.sin((index / max(1, count - 1)) * math.pi)
            sx, sy, dy = 1 - lift * 0.018, 1 + lift * 0.026, -round(lift * 3)
        else:
            pulse = math.sin(phase)
            sx, sy, dy = 1 + pulse * 0.008, 1 - pulse * 0.008, 0
        output.append(anchored_scale(frame, sx, sy, dy))
    return output


def directional(east: Iterable[str], west: Iterable[str]) -> dict[str, list[str]]:
    east, west = list(east), list(west)
    return {
        "e": east, "ne": east, "se": east,
        "w": west, "nw": west, "sw": west,
        "n": east, "s": east,
    }


def animation(frames: list[str], fps: float, loop: bool = True, **extra: object) -> dict[str, object]:
    result: dict[str, object] = {"frames": list(frames), "fps": fps, "loop": loop}
    result.update(extra)
    return result


def directional_animation(east: list[str], west: list[str], fps: float, loop: bool, motion: str) -> dict[str, object]:
    return animation(
        east,
        fps,
        loop,
        framesRight=east,
        framesLeft=west,
        framesByDirection=directional(east, west),
        motion=motion,
    )


def build_atlas(character: str, variant: str, cell: int, names: dict[str, list[str]], source_atlas: dict) -> dict:
    frame_names = [name for sequence_names in names.values() for name in sequence_names]
    frames = {
        name: {
            "x": (index % COLUMNS) * cell,
            "y": (index // COLUMNS) * cell,
            "w": cell,
            "h": cell,
        }
        for index, name in enumerate(frame_names)
    }

    idle = names["idle"]
    walk_e, walk_w = names["walk_e"], names["walk_w"]
    run_e, run_w = names["run_e"], names["run_w"]
    jump_e, jump_w = names["jump_e"], names["jump_w"]
    land_e, land_w = names["land_e"], names["land_w"]
    hop_e, hop_w = names["hop_e"], names["hop_w"]
    celebrate, emote = names["celebrate"], names["emote"]

    animations = {
        "idle": animation(idle, 12, True, motion="breathing"),
        "breathe": animation(idle, 8, True, motion="breathing"),
        "blink": animation([idle[0], idle[4], idle[9], idle[4]], 9, True, motion="blink"),
        "ready": animation([idle[0], idle[4], idle[8], idle[12]], 11, True, motion="ready"),
        "walk": directional_animation(walk_e, walk_w, 21, True, "walk"),
        "tiptoe": directional_animation(walk_e[::2] + walk_e[1::4], walk_w[::2] + walk_w[1::4], 17, True, "tiptoe"),
        "run": directional_animation(run_e, run_w, 27, True, "run"),
        "sprint": directional_animation(run_e, run_w, 32, True, "sprint"),
        "skid": directional_animation(list(reversed(run_e[8:22])), list(reversed(run_w[8:22])), 24, False, "skid"),
        "turn": directional_animation([walk_e[2], idle[5], walk_e[15]], [walk_w[2], idle[5], walk_w[15]], 18, False, "turn"),
        "jump": directional_animation(jump_e, jump_w, 22, False, "jump"),
        "takeoff": directional_animation(jump_e[:7], jump_w[:7], 25, False, "takeoff"),
        "hop": directional_animation(hop_e, hop_w, 18, False, "hop"),
        "hover": directional_animation(jump_e[8:16], jump_w[8:16], 13, True, "hover"),
        "fall": directional_animation(jump_e[14:], jump_w[14:], 19, True, "fall"),
        "land": directional_animation(land_e, land_w, 22, False, "land"),
        "dash": directional_animation(run_e, run_w, 35, True, "dash"),
        "slide": directional_animation(run_e[10:24], run_w[10:24], 24, False, "slide"),
        "dodge": directional_animation(hop_e + land_e[:4], hop_w + land_w[:4], 21, False, "dodge"),
        "win": animation(celebrate, 17, True, motion="win"),
        "celebrate": animation(celebrate, 19, True, motion="celebrate"),
        "dance": animation(emote + celebrate[::2], 20, True, motion="dance"),
        "wave": animation([celebrate[0], celebrate[3], celebrate[6], celebrate[3], idle[2]], 12, True, motion="wave"),
        "salute": animation([idle[0], celebrate[3], celebrate[3], idle[0]], 10, False, motion="salute"),
        "spin": animation(emote, 23, True, motion="spin"),
        "crouch": animation(land_e[-6:] + idle[-2:], 10, True, motion="crouch"),
        "laugh": animation(celebrate + idle[::3], 18, True, motion="laugh"),
        "pose": animation([celebrate[0], celebrate[5], celebrate[10], celebrate[5]], 9, True, motion="pose"),
        "sleep": animation(idle, 5, True, motion="sleep"),
        "taunt": animation(emote[::2] + idle[::4], 16, True, motion="taunt"),
        "guitar": animation(celebrate + emote, 18, True, motion="guitar"),
        "guitar_loop": animation(emote + celebrate, 20, True, motion="guitar"),
    }

    if FORBIDDEN.intersection(animations):
        raise AssertionError("Combat animation leaked into V6 atlas")

    speech = source_atlas.get("speech", {"duration": 3.2, "messages": []})
    return {
        "meta": {
            "name": character.upper(),
            "version": 6,
            "variant": variant,
            "image": f"{character}-spritesheet-v6-{variant}.png",
            "size": {"w": COLUMNS * cell, "h": ROWS * cell},
            "frameSize": {"w": cell, "h": cell},
            "grid": {"columns": COLUMNS, "rows": ROWS},
            "pixelArt": True,
            "stableFacing": True,
            "directionalFrames": True,
            "directions": ["n", "ne", "e", "se", "s", "sw", "w", "nw"],
            "generatedFrameCount": len(frame_names),
            "animationCount": len(animations),
            "combatAnimationsRemoved": True,
            "sourcePack": 5,
            "normalizedIdleBodyHeightRatio": TARGET_IDLE_BODY_HEIGHT_RATIO,
            "note": "Demian V6 252-frame non-combat pack: expanded cute walk/run/jump timing with canonical character dimensions.",
        },
        "frames": frames,
        "animations": animations,
        "fallbacks": {
            "breathe": "idle", "blink": "idle", "ready": "idle", "tiptoe": "walk",
            "sprint": "run", "skid": "run", "turn": "walk", "takeoff": "jump",
            "hop": "jump", "hover": "jump", "fall": "jump", "land": "jump",
            "dash": "run", "slide": "skid", "dodge": "hop", "celebrate": "win",
            "salute": "wave", "guitar": "dance", "guitar_loop": "guitar",
        },
        "speech": speech,
        "pivot": {"x": 0.5, "y": 0.96},
        "display": {"worldWidth": 3.75, "worldHeight": 3.75},
        "motion": {
            "directionDepthScale": 0.09,
            "diagonalScale": 0.965,
            "northSouthScale": 0.91,
            "transitionSeconds": 0.055,
        },
        "render": {
            "canonicalBodyWorldWidth": 3.75,
            "canonicalBodyWorldHeight": 3.75,
            "normalizedBodyHeightRatio": TARGET_IDLE_BODY_HEIGHT_RATIO,
            "preserveAspectRatio": True,
        },
    }


def build_character(character: str) -> None:
    directory = ROOT / "public" / "assets" / "characters" / character
    sheet_path = directory / f"{character}-spritesheet-v5-desktop.png"
    atlas_path = directory / f"{character}-atlas-v5-desktop.json"
    sheet = Image.open(sheet_path).convert("RGBA")
    source_atlas = json.loads(atlas_path.read_text(encoding="utf-8"))

    base = {
        "idle": source_sequence(sheet, source_atlas, "idle"),
        "walk_e": source_sequence(sheet, source_atlas, "walk_e"),
        "walk_w": source_sequence(sheet, source_atlas, "walk_w"),
        "run_e": source_sequence(sheet, source_atlas, "run_e"),
        "run_w": source_sequence(sheet, source_atlas, "run_w"),
        "jump_e": source_sequence(sheet, source_atlas, "jump_e"),
        "jump_w": source_sequence(sheet, source_atlas, "jump_w"),
        "win": source_sequence(sheet, source_atlas, "win"),
    }

    # Normalize only with a *uniform* scale around the foot pivot. This makes
    # every built-in character read at the same height without stretching
    # faces/bodies horizontally or changing the original character design.
    source_idle_ratio = median([alpha_height_ratio(frame) for frame in base["idle"]])
    uniform_scale = TARGET_IDLE_BODY_HEIGHT_RATIO / max(source_idle_ratio, 0.01)
    for key, sequence_frames in tuple(base.items()):
        base[key] = [anchored_scale(frame, uniform_scale, uniform_scale) for frame in sequence_frames]

    sequences = {
        "idle": add_motion_character(resample_sequence(base["idle"], 16, loop=True), "idle"),
        "walk_e": add_motion_character(resample_sequence(base["walk_e"], 28, loop=True), "walk"),
        "walk_w": add_motion_character(resample_sequence(base["walk_w"], 28, loop=True), "walk"),
        "run_e": add_motion_character(resample_sequence(base["run_e"], 32, loop=True), "run"),
        "run_w": add_motion_character(resample_sequence(base["run_w"], 32, loop=True), "run"),
        "jump_e": add_motion_character(resample_sequence(base["jump_e"], 24, loop=False), "jump"),
        "jump_w": add_motion_character(resample_sequence(base["jump_w"], 24, loop=False), "jump"),
        "land_e": add_motion_character(resample_sequence(base["jump_e"][-3:] + base["idle"][:2], 12, loop=False), "land"),
        "land_w": add_motion_character(resample_sequence(base["jump_w"][-3:] + base["idle"][:2], 12, loop=False), "land"),
        "celebrate": add_motion_character(resample_sequence(base["win"], 16, loop=True), "social"),
        "emote": add_motion_character(resample_sequence(base["idle"][::2] + base["win"], 16, loop=True), "social"),
        "hop_e": add_motion_character(resample_sequence(base["jump_e"], 6, loop=False), "hop"),
        "hop_w": add_motion_character(resample_sequence(base["jump_w"], 6, loop=False), "hop"),
    }

    if {name.split("_", 1)[0] for name in sequences}.intersection(FORBIDDEN):
        raise AssertionError("Forbidden source sequence leaked into V6")

    names = {
        sequence: [f"{sequence}_{index:02d}" for index in range(len(frames))]
        for sequence, frames in sequences.items()
    }

    for variant, cell in VARIANTS.items():
        output = Image.new("RGBA", (COLUMNS * cell, ROWS * cell), (0, 0, 0, 0))
        index = 0
        for sequence_frames in sequences.values():
            for frame in sequence_frames:
                rendered = frame if cell == 256 else frame.resize((cell, cell), Image.Resampling.LANCZOS)
                x = (index % COLUMNS) * cell
                y = (index // COLUMNS) * cell
                output.alpha_composite(rendered, (x, y))
                index += 1

        sprite_path = directory / f"{character}-spritesheet-v6-{variant}.png"
        output.save(sprite_path, optimize=False, compress_level=4)
        atlas = build_atlas(character, variant, cell, names, source_atlas)
        output_atlas = directory / f"{character}-atlas-v6-{variant}.json"
        output_atlas.write_text(json.dumps(atlas, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{character:9} {variant:7}: {index} frames · {output.size[0]}x{output.size[1]}")


def main() -> None:
    requested = tuple(value for value in sys.argv[1:] if value in CHARACTERS)
    for character in (requested or CHARACTERS):
        build_character(character)


if __name__ == "__main__":
    main()
