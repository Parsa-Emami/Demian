#!/usr/bin/env python3
"""Generate the Demian V4 high-frame arcade sprite packs from the 4x3 source sheets.

The source artwork remains untouched. The generated sheet adds carefully varied in-between
poses (squash/stretch, anticipation, follow-through and directional cadence) so the runtime
can animate at a much smoother frame rate without requiring a skeletal rig.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Iterable

from PIL import Image

from character_art_registry import character_name, resolve_targets, speech_payload

ROOT = Path(__file__).resolve().parents[1]
CELL = 256
COLUMNS = 12
ROWS = 8
SHEET_SIZE = (COLUMNS * CELL, ROWS * CELL)

SOURCE = {
    "idle_0": (0, 0),
    "idle_1": (1, 0),
    "walk_e": (2, 0),
    "walk_w": (3, 0),
    "run_e": (0, 1),
    "run_w": (1, 1),
    "jump_0": (2, 1),
    "jump_1": (3, 1),
    "attack_e": (0, 2),
    "attack_w": (1, 2),
    "win_0": (2, 2),
    "win_1": (3, 2),
}

COUNTS = {
    "idle": 8,
    "walk_e": 10,
    "walk_w": 10,
    "run_e": 12,
    "run_w": 12,
    "jump": 8,
    "attack_e": 10,
    "attack_w": 10,
    "win": 8,
    "special": 8,
}


def crop_cell(sheet: Image.Image, position: tuple[int, int]) -> Image.Image:
    column, row = position
    return sheet.crop((column * CELL, row * CELL, (column + 1) * CELL, (row + 1) * CELL))


def transform_pose(
    image: Image.Image,
    *,
    scale_x: float = 1.0,
    scale_y: float = 1.0,
    dx: float = 0.0,
    dy: float = 0.0,
    angle: float = 0.0,
) -> Image.Image:
    """Transform the visible character while preserving its original ground contact."""
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return image.copy()

    subject = image.crop(bbox)
    width = max(1, round(subject.width * scale_x))
    height = max(1, round(subject.height * scale_y))
    subject = subject.resize((width, height), Image.Resampling.LANCZOS)

    if abs(angle) > 0.01:
        subject = subject.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)

    ground_margin = CELL - bbox[3]
    x = round((CELL - subject.width) / 2 + dx)
    y = round(CELL - ground_margin - subject.height + dy)

    output = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    output.alpha_composite(subject, (x, y))
    return output


def build_sequences(source: dict[str, Image.Image]) -> list[tuple[str, Image.Image]]:
    frames: list[tuple[str, Image.Image]] = []

    for index in range(COUNTS["idle"]):
        phase = index / COUNTS["idle"] * math.tau
        base = source["idle_0" if index < 4 else "idle_1"]
        frames.append((
            f"idle_{index:02d}",
            transform_pose(
                base,
                scale_x=1 + math.sin(phase) * 0.012,
                scale_y=1 - math.sin(phase) * 0.014,
                dy=-abs(math.sin(phase)) * 1.4,
                angle=math.sin(phase * 0.5) * 0.45,
            ),
        ))

    for direction in ("e", "w"):
        sign = 1 if direction == "e" else -1
        for index in range(COUNTS[f"walk_{direction}"]):
            phase = index / COUNTS[f"walk_{direction}"] * math.tau
            contact = abs(math.sin(phase))
            frames.append((
                f"walk_{direction}_{index:02d}",
                transform_pose(
                    source[f"walk_{direction}"],
                    scale_x=1 + math.cos(phase * 2) * 0.022,
                    scale_y=1 - math.cos(phase * 2) * 0.026,
                    dx=math.sin(phase) * 2.5 * sign,
                    dy=-contact * 5.2,
                    angle=math.sin(phase) * 2.0 * sign,
                ),
            ))

    for direction in ("e", "w"):
        sign = 1 if direction == "e" else -1
        for index in range(COUNTS[f"run_{direction}"]):
            phase = index / COUNTS[f"run_{direction}"] * math.tau
            contact = abs(math.sin(phase))
            frames.append((
                f"run_{direction}_{index:02d}",
                transform_pose(
                    source[f"run_{direction}"],
                    scale_x=1 + math.cos(phase * 2) * 0.042,
                    scale_y=1 - math.cos(phase * 2) * 0.048,
                    dx=math.sin(phase) * 4.2 * sign,
                    dy=-contact * 8.0,
                    angle=(math.sin(phase) * 2.8 - 2.4) * sign,
                ),
            ))

    for index in range(COUNTS["jump"]):
        progress = index / (COUNTS["jump"] - 1)
        base = source["jump_0" if progress < 0.52 else "jump_1"]
        arc = math.sin(progress * math.pi)
        vertical = math.cos(progress * math.pi)
        frames.append((
            f"jump_{index:02d}",
            transform_pose(
                base,
                scale_x=1 - max(vertical, 0) * 0.055 + max(-vertical, 0) * 0.06,
                scale_y=1 + max(vertical, 0) * 0.075 - max(-vertical, 0) * 0.055,
                dy=-arc * 7.0,
                angle=(progress - 0.5) * 2.2,
            ),
        ))

    for direction in ("e", "w"):
        sign = 1 if direction == "e" else -1
        for index in range(COUNTS[f"attack_{direction}"]):
            progress = index / (COUNTS[f"attack_{direction}"] - 1)
            anticipation = -math.sin(min(progress / 0.28, 1) * math.pi / 2) if progress < 0.28 else 0
            strike = math.sin(max(0, min((progress - 0.2) / 0.8, 1)) * math.pi)
            frames.append((
                f"attack_{direction}_{index:02d}",
                transform_pose(
                    source[f"attack_{direction}"],
                    scale_x=1 + strike * 0.075,
                    scale_y=1 - strike * 0.045,
                    dx=(anticipation * 3 + strike * 11) * sign,
                    dy=-strike * 3.2,
                    angle=(anticipation * 3.2 - strike * 4.8) * sign,
                ),
            ))

    for index in range(COUNTS["win"]):
        phase = index / COUNTS["win"] * math.tau
        base = source["win_0" if index % 4 < 2 else "win_1"]
        frames.append((
            f"win_{index:02d}",
            transform_pose(
                base,
                scale_x=1 + math.cos(phase) * 0.035,
                scale_y=1 - math.cos(phase) * 0.035,
                dx=math.sin(phase * 0.5) * 2.5,
                dy=-abs(math.sin(phase)) * 8,
                angle=math.sin(phase * 0.5) * 2.8,
            ),
        ))

    for index in range(COUNTS["special"]):
        phase = index / COUNTS["special"] * math.tau
        base = source["idle_1" if index % 2 else "win_0"]
        frames.append((
            f"special_{index:02d}",
            transform_pose(
                base,
                scale_x=1 + math.sin(phase) * 0.05,
                scale_y=1 - math.sin(phase) * 0.045,
                dx=math.sin(phase) * 5.5,
                dy=-abs(math.sin(phase * 2)) * 4,
                angle=math.sin(phase) * 5.2,
            ),
        ))

    assert len(frames) == COLUMNS * ROWS, len(frames)
    return frames


def names(prefix: str, count: int) -> list[str]:
    return [f"{prefix}_{index:02d}" for index in range(count)]


def directional(east: Iterable[str], west: Iterable[str]) -> dict[str, list[str]]:
    east = list(east)
    west = list(west)
    return {
        "e": east,
        "ne": east,
        "se": east,
        "w": west,
        "nw": west,
        "sw": west,
    }


def animation(frames: list[str], fps: float, loop: bool = True, **extra: object) -> dict[str, object]:
    value: dict[str, object] = {"frames": frames, "fps": fps, "loop": loop}
    value.update(extra)
    return value


def build_atlas(character: str, frame_names: list[str]) -> dict[str, object]:
    frame_map: dict[str, dict[str, int]] = {}
    for index, frame_name in enumerate(frame_names):
        column = index % COLUMNS
        row = index // COLUMNS
        frame_map[frame_name] = {
            "x": column * CELL,
            "y": row * CELL,
            "w": CELL,
            "h": CELL,
        }

    idle = names("idle", 8)
    walk_e, walk_w = names("walk_e", 10), names("walk_w", 10)
    run_e, run_w = names("run_e", 12), names("run_w", 12)
    jump = names("jump", 8)
    attack_e, attack_w = names("attack_e", 10), names("attack_w", 10)
    win = names("win", 8)
    special = names("special", 8)

    animations: dict[str, object] = {
        "idle": animation(idle, 8, motion="breathing"),
        "breathe": animation(idle, 6, motion="breathing"),
        "blink": animation([idle[0], idle[1], idle[4], idle[1]], 7, motion="blink"),
        "ready": animation([idle[0], idle[2], idle[4], idle[6]], 9, motion="ready"),
        "walk": animation(walk_e, 14, framesRight=walk_e, framesLeft=walk_w, framesByDirection=directional(walk_e, walk_w), motion="walk"),
        "run": animation(run_e, 19, framesRight=run_e, framesLeft=run_w, framesByDirection=directional(run_e, run_w), motion="run"),
        "sprint": animation(run_e, 24, framesRight=run_e, framesLeft=run_w, framesByDirection=directional(run_e, run_w), motion="sprint"),
        "skid": animation(list(reversed(run_e[:7])), 18, False, framesRight=list(reversed(run_e[:7])), framesLeft=list(reversed(run_w[:7])), framesByDirection=directional(list(reversed(run_e[:7])), list(reversed(run_w[:7]))), motion="skid"),
        "turn": animation([walk_e[1], idle[2], walk_w[6]], 16, False, motion="turn"),
        "jump": animation(jump, 15, False, motion="jump"),
        "takeoff": animation(jump[:4], 18, False, motion="takeoff"),
        "fall": animation(jump[4:], 14, True, motion="fall"),
        "land": animation([jump[-1], idle[5], idle[1]], 16, False, motion="land"),
        "attack": animation(attack_e, 20, False, framesRight=attack_e, framesLeft=attack_w, framesByDirection=directional(attack_e, attack_w), motion="attack"),
        "combo": animation(attack_e + list(reversed(attack_e[3:8])), 24, False, framesRight=attack_e + list(reversed(attack_e[3:8])), framesLeft=attack_w + list(reversed(attack_w[3:8])), motion="combo"),
        "uppercut": animation(attack_e[1:] + jump[:4], 21, False, framesRight=attack_e[1:] + jump[:4], framesLeft=attack_w[1:] + jump[:4], motion="uppercut"),
        "cast": animation(special + attack_e[4:8], 15, False, framesRight=special + attack_e[4:8], framesLeft=special + attack_w[4:8], motion="cast"),
        "charge": animation(idle + special, 13, True, motion="charge"),
        "hurt": animation([attack_e[-1], jump[-1], idle[-1]], 13, False, framesRight=[attack_e[-1], jump[-1], idle[-1]], framesLeft=[attack_w[-1], jump[-1], idle[-1]], motion="hurt"),
        "dash": animation(run_e, 26, True, framesRight=run_e, framesLeft=run_w, framesByDirection=directional(run_e, run_w), motion="dash"),
        "slide": animation(run_e[2:10], 18, False, framesRight=run_e[2:10], framesLeft=run_w[2:10], motion="slide"),
        "dodge": animation(jump[2:] + jump[:2], 18, False, motion="dodge"),
        "win": animation(win, 13, True, motion="win"),
        "celebrate": animation(win + special, 15, True, motion="celebrate"),
        "dance": animation(special + win, 16, True, motion="dance"),
        "wave": animation([win[0], idle[1], win[2], idle[3], win[0]], 11, True, motion="wave"),
        "salute": animation([idle[0], win[1], win[1], idle[0]], 9, False, motion="salute"),
        "spin": animation(special, 20, True, motion="spin"),
        "crouch": animation([jump[-1], idle[-1]], 7, True, motion="crouch"),
        "laugh": animation(win + idle[::2], 15, True, motion="laugh"),
        "pose": animation([win[0], win[2], win[0]], 7, True, motion="pose"),
        "sleep": animation(idle, 3, True, motion="sleep"),
        "taunt": animation(attack_e[::2] + idle[::2], 13, True, framesRight=attack_e[::2] + idle[::2], framesLeft=attack_w[::2] + idle[::2], motion="taunt"),
        "hover": animation(jump[2:6], 10, True, motion="hover"),
    }

    return {
        "meta": {
            "name": character_name(character),
            "version": 4,
            "image": f"{character}-spritesheet-v4.png",
            "size": {"w": SHEET_SIZE[0], "h": SHEET_SIZE[1]},
            "frameSize": {"w": CELL, "h": CELL},
            "pixelArt": True,
            "stableFacing": True,
            "directionalFrames": True,
            "directions": ["n", "ne", "e", "se", "s", "sw", "w", "nw"],
            "generatedFrameCount": len(frame_names),
            "animationCount": len(animations),
            "note": "Demian V4 high-frame arcade pack with 8-way runtime direction handling.",
        },
        "frames": frame_map,
        "animations": animations,
        "fallbacks": {
            "sprint": "run", "skid": "run", "turn": "walk", "takeoff": "jump",
            "fall": "jump", "land": "jump", "combo": "attack", "uppercut": "attack",
            "cast": "attack", "charge": "idle", "hurt": "attack", "slide": "run",
            "celebrate": "win", "salute": "win", "breathe": "idle", "blink": "idle",
            "ready": "idle", "hover": "jump",
        },
        "speech": speech_payload(character),
        "pivot": {"x": 0.5, "y": 0.96},
        "display": {"worldWidth": 3.75, "worldHeight": 3.75},
        "motion": {
            "directionDepthScale": 0.09,
            "diagonalScale": 0.965,
            "northSouthScale": 0.91,
            "transitionSeconds": 0.09,
        },
    }


def main() -> None:
    characters = resolve_targets(sys.argv[1:], ("{character}-spritesheet.png",))
    if not characters:
        raise SystemExit("No canonical 4x3 character source sheets were found.")

    for character in characters:
        directory = ROOT / "public" / "assets" / "characters" / character
        source_path = directory / f"{character}-spritesheet.png"
        sheet = Image.open(source_path).convert("RGBA")
        source = {name: crop_cell(sheet, position) for name, position in SOURCE.items()}
        sequence = build_sequences(source)

        output = Image.new("RGBA", SHEET_SIZE, (0, 0, 0, 0))
        for index, (_, frame) in enumerate(sequence):
            x = (index % COLUMNS) * CELL
            y = (index // COLUMNS) * CELL
            output.alpha_composite(frame, (x, y))

        output_path = directory / f"{character}-spritesheet-v4.png"
        output.save(output_path, optimize=True, compress_level=9)

        atlas = build_atlas(character, [name for name, _ in sequence])
        atlas_path = directory / f"{character}-atlas.json"
        atlas_path.write_text(
            json.dumps(atlas, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        print(f"{character}: {len(sequence)} frames -> {output_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
