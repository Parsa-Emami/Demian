#!/usr/bin/env python3
"""Build Demian V5 multi-resolution 120-frame sprite packs from the bundled V4 packs.

The mobile and compact packs keep the decoded texture budget low while the desktop pack keeps full
256 px cells. All atlases have identical animation names and directional jump frames.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ("tiam", "ronak", "amirreza")
COLUMNS = 15
ROWS = 8
SEQUENCES = {
    "idle": 10,
    "walk_e": 12,
    "walk_w": 12,
    "run_e": 14,
    "run_w": 14,
    "jump_e": 10,
    "jump_w": 10,
    "attack_e": 10,
    "attack_w": 10,
    "win": 10,
    "special": 8,
}
assert sum(SEQUENCES.values()) == COLUMNS * ROWS

SOURCE_SEQUENCES = {
    "idle": [f"idle_{index:02d}" for index in range(8)],
    "walk_e": [f"walk_e_{index:02d}" for index in range(10)],
    "walk_w": [f"walk_w_{index:02d}" for index in range(10)],
    "run_e": [f"run_e_{index:02d}" for index in range(12)],
    "run_w": [f"run_w_{index:02d}" for index in range(12)],
    "jump_e": [f"jump_{index:02d}" for index in range(8)],
    "attack_e": [f"attack_e_{index:02d}" for index in range(10)],
    "attack_w": [f"attack_w_{index:02d}" for index in range(10)],
    "win": [f"win_{index:02d}" for index in range(8)],
    "special": [f"special_{index:02d}" for index in range(8)],
}


def extract(sheet: Image.Image, frame: dict[str, int]) -> Image.Image:
    return sheet.crop((frame["x"], frame["y"], frame["x"] + frame["w"], frame["y"] + frame["h"]))


def soften_intermediate(image: Image.Image, phase: float) -> Image.Image:
    """Apply a tiny luminance pulse so neighbouring generated frames are not exact clones."""
    enhancer = ImageEnhance.Brightness(image)
    return enhancer.enhance(1 + phase * 0.008)


def resample_sequence(frames: list[Image.Image], count: int, *, loop: bool) -> list[Image.Image]:
    if len(frames) == count:
        return [frame.copy() for frame in frames]

    output: list[Image.Image] = []
    denominator = count if loop else max(count - 1, 1)
    source_span = len(frames) if loop else max(len(frames) - 1, 1)

    for index in range(count):
        position = index / denominator * source_span
        left_index = int(position) % len(frames)
        fraction = position - int(position)
        right_index = (left_index + 1) % len(frames) if loop else min(left_index + 1, len(frames) - 1)
        left = frames[left_index]
        right = frames[right_index]

        # Limit the blend amount: enough to add in-betweens without leaving a long ghost trail.
        blend_amount = min(fraction, 1 - fraction) * 0.72
        if fraction >= 0.5:
            base, neighbour = right, left
        else:
            base, neighbour = left, right
        generated = Image.blend(base, neighbour, blend_amount)
        generated = soften_intermediate(generated, (index % 4) - 1.5)
        output.append(generated)

    return output


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
        "n": east,
        "s": east,
    }


def animation(frames: list[str], fps: float, loop: bool = True, **extra: object) -> dict[str, object]:
    value: dict[str, object] = {"frames": frames, "fps": fps, "loop": loop}
    value.update(extra)
    return value


def build_atlas(character: str, variant: str, cell: int, names_by_sequence: dict[str, list[str]]) -> dict[str, object]:
    frame_names = [name for sequence in names_by_sequence.values() for name in sequence]
    frames: dict[str, dict[str, int]] = {}
    for index, name in enumerate(frame_names):
        frames[name] = {
            "x": (index % COLUMNS) * cell,
            "y": (index // COLUMNS) * cell,
            "w": cell,
            "h": cell,
        }

    idle = names_by_sequence["idle"]
    walk_e, walk_w = names_by_sequence["walk_e"], names_by_sequence["walk_w"]
    run_e, run_w = names_by_sequence["run_e"], names_by_sequence["run_w"]
    jump_e, jump_w = names_by_sequence["jump_e"], names_by_sequence["jump_w"]
    attack_e, attack_w = names_by_sequence["attack_e"], names_by_sequence["attack_w"]
    win, special = names_by_sequence["win"], names_by_sequence["special"]

    animations: dict[str, object] = {
        "idle": animation(idle, 10, motion="breathing"),
        "breathe": animation(idle, 7, motion="breathing"),
        "blink": animation([idle[0], idle[2], idle[6], idle[2]], 8, motion="blink"),
        "ready": animation([idle[0], idle[3], idle[6], idle[8]], 10, motion="ready"),
        "walk": animation(walk_e, 17, framesRight=walk_e, framesLeft=walk_w, framesByDirection=directional(walk_e, walk_w), motion="walk"),
        "run": animation(run_e, 22, framesRight=run_e, framesLeft=run_w, framesByDirection=directional(run_e, run_w), motion="run"),
        "sprint": animation(run_e, 27, framesRight=run_e, framesLeft=run_w, framesByDirection=directional(run_e, run_w), motion="sprint"),
        "skid": animation(list(reversed(run_e[:8])), 20, False, framesRight=list(reversed(run_e[:8])), framesLeft=list(reversed(run_w[:8])), framesByDirection=directional(list(reversed(run_e[:8])), list(reversed(run_w[:8]))), motion="skid"),
        "turn": animation([walk_e[1], idle[3], walk_w[7]], 18, False, motion="turn"),
        "jump": animation(jump_e, 18, False, framesRight=jump_e, framesLeft=jump_w, framesByDirection=directional(jump_e, jump_w), motion="jump"),
        "takeoff": animation(jump_e[:4], 20, False, framesRight=jump_e[:4], framesLeft=jump_w[:4], framesByDirection=directional(jump_e[:4], jump_w[:4]), motion="takeoff"),
        "fall": animation(jump_e[4:], 17, True, framesRight=jump_e[4:], framesLeft=jump_w[4:], framesByDirection=directional(jump_e[4:], jump_w[4:]), motion="fall"),
        "land": animation([jump_e[-1], idle[6], idle[2]], 18, False, framesRight=[jump_e[-1], idle[6], idle[2]], framesLeft=[jump_w[-1], idle[6], idle[2]], framesByDirection=directional([jump_e[-1], idle[6], idle[2]], [jump_w[-1], idle[6], idle[2]]), motion="land"),
        "attack": animation(attack_e, 22, False, framesRight=attack_e, framesLeft=attack_w, framesByDirection=directional(attack_e, attack_w), motion="attack"),
        "combo": animation(attack_e + list(reversed(attack_e[3:8])), 26, False, framesRight=attack_e + list(reversed(attack_e[3:8])), framesLeft=attack_w + list(reversed(attack_w[3:8])), motion="combo"),
        "uppercut": animation(attack_e[1:] + jump_e[:4], 23, False, framesRight=attack_e[1:] + jump_e[:4], framesLeft=attack_w[1:] + jump_w[:4], motion="uppercut"),
        "cast": animation(special + attack_e[4:8], 17, False, framesRight=special + attack_e[4:8], framesLeft=special + attack_w[4:8], motion="cast"),
        "charge": animation(idle + special, 15, True, motion="charge"),
        "hurt": animation([attack_e[-1], jump_e[-1], idle[-1]], 15, False, framesRight=[attack_e[-1], jump_e[-1], idle[-1]], framesLeft=[attack_w[-1], jump_w[-1], idle[-1]], motion="hurt"),
        "dash": animation(run_e, 30, True, framesRight=run_e, framesLeft=run_w, framesByDirection=directional(run_e, run_w), motion="dash"),
        "slide": animation(run_e[3:11], 20, False, framesRight=run_e[3:11], framesLeft=run_w[3:11], motion="slide"),
        "dodge": animation(jump_e[2:] + jump_e[:2], 20, False, framesRight=jump_e[2:] + jump_e[:2], framesLeft=jump_w[2:] + jump_w[:2], motion="dodge"),
        "win": animation(win, 15, True, motion="win"),
        "celebrate": animation(win + special, 17, True, motion="celebrate"),
        "dance": animation(special + win, 18, True, motion="dance"),
        "wave": animation([win[0], idle[2], win[3], idle[5], win[0]], 12, True, motion="wave"),
        "salute": animation([idle[0], win[2], win[2], idle[0]], 10, False, motion="salute"),
        "spin": animation(special, 22, True, motion="spin"),
        "crouch": animation([jump_e[-1], idle[-1]], 8, True, motion="crouch"),
        "laugh": animation(win + idle[::2], 17, True, motion="laugh"),
        "pose": animation([win[0], win[3], win[0]], 8, True, motion="pose"),
        "sleep": animation(idle, 4, True, motion="sleep"),
        "taunt": animation(attack_e[::2] + idle[::2], 15, True, framesRight=attack_e[::2] + idle[::2], framesLeft=attack_w[::2] + idle[::2], motion="taunt"),
        "hover": animation(jump_e[2:7], 12, True, framesRight=jump_e[2:7], framesLeft=jump_w[2:7], framesByDirection=directional(jump_e[2:7], jump_w[2:7]), motion="hover"),
    }

    speech = {
        "tiam": ["گی", "کافی فقط بچ کافی", "متالیکا دیگه خز شد", "بریم یه دود بگیریم", "باختم", "صدرا لته آرت تمرین کن", "صدرا بیس تمرین کن", "ستایش بیا اینجا"],
        "ronak": ["روناک وارد شد", "آرکید یعنی همین", "بزن بریم", "این یکی رو من می‌برم", "حرکت بعدی رو ببین", "فول انرژی", "رکورد تازه", "مرحله بعد کجاست؟"],
        "amirreza": ["بال بزن بریم", "از همه سریع‌ترم", "الان وقت های‌اسکوره", "پرواز کوتاه، برد بزرگ", "سرعت یعنی امیررضا", "بزن بریم یه دور سریع", "فول اسپید!", "با بال‌ها می‌بریم"],
    }

    return {
        "meta": {
            "name": character.upper(),
            "version": 5,
            "variant": variant,
            "image": f"{character}-spritesheet-v5-{variant}.png",
            "size": {"w": COLUMNS * cell, "h": ROWS * cell},
            "frameSize": {"w": cell, "h": cell},
            "pixelArt": True,
            "stableFacing": True,
            "directionalFrames": True,
            "directions": ["n", "ne", "e", "se", "s", "sw", "w", "nw"],
            "generatedFrameCount": len(frame_names),
            "animationCount": len(animations),
            "note": "Demian V5 dual-resolution 120-frame pack with directional airborne animation.",
        },
        "frames": frames,
        "animations": animations,
        "fallbacks": {
            "sprint": "run", "skid": "run", "turn": "walk", "takeoff": "jump",
            "fall": "jump", "land": "jump", "combo": "attack", "uppercut": "attack",
            "cast": "attack", "charge": "idle", "hurt": "attack", "slide": "run",
            "celebrate": "win", "salute": "win", "breathe": "idle", "blink": "idle",
            "ready": "idle", "hover": "jump",
        },
        "speech": {"duration": 3.2, "messages": speech[character]},
        "pivot": {"x": 0.5, "y": 0.96},
        "display": {"worldWidth": 3.75, "worldHeight": 3.75},
        "motion": {
            "directionDepthScale": 0.09,
            "diagonalScale": 0.965,
            "northSouthScale": 0.91,
            "transitionSeconds": 0.07,
        },
    }


def build_character(character: str) -> None:
    directory = ROOT / "public" / "assets" / "characters" / character
    source_sheet = Image.open(directory / f"{character}-spritesheet-v4.png").convert("RGBA")
    source_atlas = json.loads((directory / f"{character}-atlas.json").read_text(encoding="utf-8"))

    source_frames = {
        name: extract(source_sheet, frame)
        for name, frame in source_atlas["frames"].items()
    }

    sequences: dict[str, list[Image.Image]] = {}
    for sequence_name, count in SEQUENCES.items():
        if sequence_name == "jump_w":
            east = sequences["jump_e"]
            sequences[sequence_name] = [frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for frame in east]
            continue

        source_names = SOURCE_SEQUENCES[sequence_name]
        source = [source_frames[name] for name in source_names]
        sequences[sequence_name] = resample_sequence(
            source,
            count,
            loop=sequence_name in {"idle", "walk_e", "walk_w", "run_e", "run_w", "win", "special"},
        )

    names_by_sequence = {
        name: [f"{name}_{index:02d}" for index in range(len(frames))]
        for name, frames in sequences.items()
    }

    for variant, cell in (("desktop", 256), ("mobile", 192), ("compact", 128)):
        output = Image.new("RGBA", (COLUMNS * cell, ROWS * cell), (0, 0, 0, 0))
        index = 0
        for sequence_name, frames in sequences.items():
            for frame in frames:
                rendered = frame if cell == 256 else frame.resize((cell, cell), Image.Resampling.LANCZOS)
                x = (index % COLUMNS) * cell
                y = (index // COLUMNS) * cell
                output.alpha_composite(rendered, (x, y))
                index += 1

        output_path = directory / f"{character}-spritesheet-v5-{variant}.png"
        output.save(output_path, optimize=True, compress_level=9)

        atlas = build_atlas(character, variant, cell, names_by_sequence)
        atlas_path = directory / f"{character}-atlas-v5-{variant}.json"
        atlas_path.write_text(json.dumps(atlas, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{character} {variant}: {index} frames -> {output_path.relative_to(ROOT)}")


def main() -> None:
    for character in CHARACTERS:
        build_character(character)


if __name__ == "__main__":
    main()
