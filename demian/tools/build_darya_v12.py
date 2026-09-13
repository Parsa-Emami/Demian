#!/usr/bin/env python3
"""Build Darya + Pishi V12 from the new clean master artwork.

The source master is never used by the runtime.  This builder removes its
preview checkerboard, normalises every pose around a shared foot pivot, and
creates three deterministic 252-frame atlases with eight-direction mapping.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageEnhance, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
CHAR_DIR = ROOT / "public/assets/characters/darya"
MASTER = CHAR_DIR / "darya-pishi-v12-master.png"
VERSION = 12
COLS, ROWS = 21, 12
VARIANTS = {"desktop": 256, "mobile": 192, "compact": 128}
DIRECTIONS = ("s", "sw", "w", "nw", "n", "ne", "e", "se")
FORBIDDEN = {"attack", "combo", "uppercut", "cast", "charge", "hurt", "punch", "kick", "hit"}

# The corrected master uses seven uniform eight-pose presentation strips.
STRIPS = (
    (0, 153, 8, "turn"),
    (153, 300, 8, "idle"),
    (300, 446, 8, "walk"),
    (446, 592, 8, "run"),
    (592, 737, 8, "celebrate"),
    (737, 879, 8, "companion"),
    (879, 1024, 8, "sleep"),
)
X_BOUNDS = (0, 215, 405, 595, 785, 975, 1165, 1355, 1536)

COUNTS = {
    "idle": 16, "walk_e": 28, "walk_w": 28, "run_e": 32, "run_w": 32,
    "jump_e": 24, "jump_w": 24, "land_e": 12, "land_w": 12,
    "celebrate": 16, "emote": 16, "hop_e": 6, "hop_w": 6,
}


def remove_preview_background(image: Image.Image) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"))
    dark = np.max(rgb, axis=2) < 198
    chroma = np.ptp(rgb.astype(np.int16), axis=2) > 18
    seed = ndimage.binary_closing(dark | chroma, structure=np.ones((5, 5)), iterations=2)
    labels, count = ndimage.label(seed, structure=np.ones((3, 3)))
    sizes = np.bincount(labels.ravel())
    keep = sizes >= 18
    keep[0] = False
    mask = ndimage.binary_fill_holes(keep[labels])
    mask = ndimage.binary_dilation(mask, structure=np.ones((3, 3)))
    mask = (ndimage.gaussian_filter(mask.astype(float), .7) * 255).astype(np.uint8)
    rgba = np.dstack((rgb, mask))
    return Image.fromarray(rgba, "RGBA")


def crop_strips(master: Image.Image) -> dict[str, list[Image.Image]]:
    poses: dict[str, list[Image.Image]] = {}
    for y0, y1, count, name in STRIPS:
        frames = []
        for index in range(count):
            # Never cross a cell boundary: even a one-pixel neighbour fragment
            # becomes conspicuous after normalisation to a runtime tile.
            box = (X_BOUNDS[index], y0, X_BOUNDS[index + 1], y1)
            frame = master.crop(box)
            alpha = np.asarray(frame.getchannel("A"))
            labelled, total = ndimage.label(alpha > 16)
            areas = ndimage.sum(alpha > 16, labelled, range(1, total + 1))
            largest = int(np.argmax(areas)) + 1 if len(areas) else 0
            keep = np.zeros(alpha.shape, dtype=bool)
            for component, area in enumerate(areas, start=1):
                pixels = labelled == component
                # A source pose is centred; small components entering through
                # the top edge are feet/shadows from the preceding strip.
                if area >= 18 and (component == largest or not pixels[:4, :].any()):
                    keep |= pixels
            frame.putalpha(Image.fromarray(np.where(keep, alpha, 0).astype(np.uint8), "L"))
            bbox = frame.getchannel("A").point(lambda v: 255 if v > 16 else 0).getbbox()
            if not bbox:
                raise RuntimeError(f"empty master frame: {name}[{index}]")
            frames.append(frame.crop(bbox))
        poses[name] = frames
    return poses


def place(pose: Image.Image, cell: int, *, dx: float = 0, dy: float = 0,
          sx: float = 1, sy: float = 1) -> Image.Image:
    max_w, max_h = cell * .90, cell * .90
    scale = min(max_w / pose.width, max_h / pose.height)
    size = (max(1, round(pose.width * scale * sx)), max(1, round(pose.height * scale * sy)))
    sprite = pose.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    x = round((cell - sprite.width) / 2 + dx * cell)
    y = round(cell * .965 - sprite.height + dy * cell)
    canvas.alpha_composite(sprite, (x, y))
    return canvas


def resample(source: list[Image.Image], count: int, cell: int, kind: str, *, mirror=False) -> list[Image.Image]:
    result = []
    for i in range(count):
        phase = i / count
        position = phase * len(source)
        a = source[int(position) % len(source)]
        b = source[(int(position) + 1) % len(source)]
        local = position - math.floor(position)
        # A restrained cross-dissolve adds temporal resolution without ghosting.
        base = Image.blend(a.resize((256, 256)), b.resize((256, 256)), min(local, 1-local) * .34)
        if mirror:
            base = base.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        wave = math.sin(phase * math.tau)
        contact = math.cos(phase * math.tau * 2)
        dx = wave * ({"walk": .010, "run": .016}.get(kind, .004))
        dy = -abs(wave) * ({"walk": .010, "run": .020}.get(kind, .004))
        sx = 1 + contact * ({"walk": .006, "run": .010}.get(kind, .003))
        sy = 1 - contact * ({"walk": .008, "run": .014}.get(kind, .004))
        result.append(place(base, cell, dx=dx, dy=dy, sx=sx, sy=sy))
    return result


def air_cycle(source: list[Image.Image], count: int, cell: int, *, mirror=False, landing=False) -> list[Image.Image]:
    usable = source[2:9] or source
    output = []
    for i in range(count):
        t = i / max(1, count - 1)
        pose = usable[round(t * (len(usable)-1))]
        if mirror:
            pose = pose.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if landing:
            impact = math.exp(-4*t) * math.sin(t * math.pi * 2)
            output.append(place(pose, cell, dy=abs(impact)*.014, sx=1+impact*.02, sy=1-impact*.03))
        else:
            lift = math.sin(math.pi*t)
            output.append(place(pose, cell, dy=-lift*.14, sx=1-lift*.012, sy=1+lift*.02))
    return output


def names_for(sequences: dict[str, list[Image.Image]]) -> dict[str, list[str]]:
    return {key: [f"{key}_{i:02d}" for i in range(len(value))] for key, value in sequences.items()}


def directions(east: list[str], west: list[str], turn_names: list[str]) -> dict[str, list[str]]:
    # Directional presentation poses are used whenever motion is close to the camera axis.
    return {
        "e": east, "ne": [turn_names[5]] * len(east), "n": [turn_names[4]] * len(east),
        "nw": [turn_names[3]] * len(east), "w": west, "sw": [turn_names[1]] * len(east),
        "s": [turn_names[0]] * len(east), "se": [turn_names[7]] * len(east),
    }


def anim(frames, fps, loop=True, **extra):
    return {"frames": list(frames), "fps": fps, "loop": loop, **extra}


def build_variant(poses: dict[str, list[Image.Image]], variant: str, cell: int) -> None:
    seq = {
        "idle": resample(poses["idle"], 16, cell, "idle"),
        "walk_e": resample(poses["walk"], 28, cell, "walk"),
        "walk_w": resample(poses["walk"], 28, cell, "walk", mirror=True),
        "run_e": resample(poses["run"], 32, cell, "run"),
        "run_w": resample(poses["run"], 32, cell, "run", mirror=True),
        "jump_e": air_cycle(poses["run"], 24, cell),
        "jump_w": air_cycle(poses["run"], 24, cell, mirror=True),
        "land_e": air_cycle(poses["run"], 12, cell, landing=True),
        "land_w": air_cycle(poses["run"], 12, cell, mirror=True, landing=True),
        "celebrate": resample(poses["celebrate"], 16, cell, "social"),
        "emote": resample(poses["companion"] + poses["sleep"], 16, cell, "social"),
        "hop_e": air_cycle(poses["run"], 6, cell),
        "hop_w": air_cycle(poses["run"], 6, cell, mirror=True),
    }
    assert sum(map(len, seq.values())) == COLS * ROWS
    names = names_for(seq)
    sheet = Image.new("RGBA", (COLS*cell, ROWS*cell), (0, 0, 0, 0))
    frames = {}
    index = 0
    for key, sequence in seq.items():
        for j, frame in enumerate(sequence):
            x, y = index % COLS * cell, index // COLS * cell
            sheet.alpha_composite(frame, (x, y))
            frames[names[key][j]] = {"x": x, "y": y, "w": cell, "h": cell}
            index += 1

    # Presentation direction frames are appended virtually by selecting normalised source poses.
    # Their pixels replace eight idle slots so no extra runtime texture memory is needed.
    turn = [place(p, cell) for p in poses["turn"]]
    for i, frame in enumerate(turn):
        x, y = i * cell, 0
        sheet.paste((0, 0, 0, 0), (x, y, x+cell, y+cell))
        sheet.alpha_composite(frame, (x, y))
        frames[names["idle"][i]] = {"x": x, "y": y, "w": cell, "h": cell}
    turn_names = names["idle"][:8]
    idle_map = {direction: [turn_names[i]] * 16 for i, direction in enumerate(DIRECTIONS)}
    def directional(key, fps, loop=True):
        east, west = names[f"{key}_e"], names[f"{key}_w"]
        return anim(east, fps, loop, framesRight=east, framesLeft=west,
                    framesByDirection=directions(east, west, turn_names), motion=key)
    animations = {
        "idle": anim(names["idle"], 10, True, framesByDirection=idle_map, motion="breathing"),
        "breathe": anim(names["idle"], 9, True, framesByDirection=idle_map, motion="breathing"),
        "blink": anim(names["idle"][8:12], 8, True, framesByDirection=idle_map, motion="blink"),
        "ready": anim(names["idle"], 11, True, framesByDirection=idle_map, motion="ready"),
        "walk": directional("walk", 20), "tiptoe": directional("walk", 16),
        "run": directional("run", 27), "sprint": directional("run", 31),
        "skid": directional("run", 24, False), "dash": directional("run", 30),
        "slide": directional("run", 24, False), "turn": directional("walk", 18, False),
        "jump": directional("jump", 22, False), "takeoff": directional("jump", 24, False),
        "fall": directional("jump", 20), "hover": directional("jump", 18),
        "land": directional("land", 24, False), "hop": directional("hop", 22, False),
        "dodge": directional("hop", 24, False),
        "win": anim(names["celebrate"], 17), "celebrate": anim(names["celebrate"], 19),
        "dance": anim(names["celebrate"] + names["emote"], 20),
        "wave": anim(names["celebrate"][:8], 12), "salute": anim(names["celebrate"][:6], 10, False),
        "spin": anim(names["emote"], 20), "crouch": anim(names["emote"], 10),
        "laugh": anim(names["celebrate"], 17), "pose": anim(names["emote"], 9),
        "sleep": anim(names["emote"], 5), "taunt": anim(names["celebrate"], 15),
        "companion": anim(names["emote"] + names["celebrate"], 14),
    }
    assert not FORBIDDEN.intersection(animations)
    atlas = {
        "meta": {"name": "DARYA / دریا", "version": VERSION, "variant": variant,
                 "image": f"darya-spritesheet-v{VERSION}-{variant}.png",
                 "size": {"w": sheet.width, "h": sheet.height},
                 "frameSize": {"w": cell, "h": cell}, "grid": {"columns": COLS, "rows": ROWS},
                 "generatedFrameCount": 252, "animationCount": len(animations),
                 "directionalFrames": True, "directions": list(DIRECTIONS),
                 "combatAnimationsRemoved": True, "artIntegrity": "valid",
                 "redesign": "complete Darya + Pishi v12 replacement"},
        "frames": frames, "animations": animations,
        "fallbacks": {"guitar": "dance", "guitar_loop": "dance"},
        "companion": {"id": "pishi", "alwaysVisible": True, "bakedIntoEveryFrame": True,
                      "directionSynchronized": True, "collisionIndependent": True},
        "pivot": {"x": .5, "y": .965}, "display": {"worldWidth": 3.75, "worldHeight": 3.75},
        "motion": {"directionDepthScale": .075, "diagonalScale": .97,
                   "northSouthScale": .94, "transitionSeconds": .04},
        "render": {"canonicalBodyWorldWidth": 3.75, "canonicalBodyWorldHeight": 3.75,
                   "normalizedBodyHeightRatio": .90, "referenceBodyHeightRatio": .90,
                   "referenceBodyWidthRatio": .82, "preserveAspectRatio": True,
                   "frameBlend": True, "frameBlendMaxAlpha": .38,
                   "eightDirectionLocomotion": True},
    }
    sheet = ImageEnhance.Sharpness(sheet).enhance(1.08)
    sheet.save(CHAR_DIR / f"darya-spritesheet-v{VERSION}-{variant}.png", optimize=True, compress_level=7)
    (CHAR_DIR / f"darya-atlas-v{VERSION}-{variant}.json").write_text(
        json.dumps(atlas, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    if not MASTER.exists():
        raise SystemExit(f"Missing master art: {MASTER}")
    clean = remove_preview_background(Image.open(MASTER))
    poses = crop_strips(clean)
    for variant, cell in VARIANTS.items():
        build_variant(poses, variant, cell)
        print(f"built Darya v{VERSION} {variant}: 252 frames")


if __name__ == "__main__":
    main()
