import argparse
import hashlib
import json
import math
from pathlib import Path
from statistics import median

import cv2
import numpy as np
from PIL import Image

from build_character_pack_v14 import grey, read_json, write_json
from validate_character_pack_v14 import VARIANTS

ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ROOT / 'public/assets/characters'
REFERENCES = ('arsal', 'darya')
WALK = ('walk-a', 'walk-pass-a', 'walk-b', 'walk-pass-b')
RUN = ('run-a', 'run-float-a', 'run-b', 'run-float-b')
SIDE_COUNTS = {
    'idle': 5, 'walk': 8, 'run': 12, 'sprint': 12,
    'takeoff': 3, 'jump': 4, 'fall': 3, 'land': 4, 'slide': 8, 'crouch': 1,
    'wave': 5, 'celebrate': 8, 'win': 8,
}
ALIASES = {
    'breathe': 'idle', 'blink': 'idle', 'ready': 'idle', 'tiptoe': 'walk',
    'hop': 'jump', 'hover': 'jump', 'dodge': 'slide', 'salute': 'wave',
}


def world_name(pose, direction):
    return f'world_{direction}_{pose}'


def midpoint(first, second):
    first, second = np.array(first), np.array(second)
    flow = cv2.calcOpticalFlowFarneback(grey(first), grey(second), None, .5, 4, 23, 5, 7, 1.5, 0)
    flow = np.clip(flow, -11, 11) * .5
    x, y = np.meshgrid(np.arange(first.shape[1], dtype=np.float32), np.arange(first.shape[0], dtype=np.float32))
    frame = cv2.remap(first, x - flow[:, :, 0], y - flow[:, :, 1], cv2.INTER_LINEAR,
                      borderMode=cv2.BORDER_CONSTANT)
    frame[frame[:, :, 3] < 20] = 0
    return Image.fromarray(frame)


def alpha_box(frame):
    return frame.getchannel('A').point(lambda alpha: 255 if alpha > 32 else 0).getbbox()


def largest_component(mask):
    _, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
    if len(stats) < 2:
        raise ValueError('Darya and Pishi both need visible pixels')
    component = labels == (1 + stats[1:, cv2.CC_STAT_AREA].argmax())
    return cv2.dilate(component.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)


def split_companion(frame, side, seam):
    pixels = np.array(frame)
    alpha = pixels[:, :, 3]
    if seam is None:
        count, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 32).astype(np.uint8))
        components = sorted(range(1, count), key=lambda label: stats[label, cv2.CC_STAT_AREA], reverse=True)
        if len(components) < 2 or stats[components[1], cv2.CC_STAT_AREA] < 500:
            raise ValueError('Pishi overlaps Darya and needs an authored seam')
        cat = cv2.dilate((labels == components[1]).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
        cat &= labels != components[0]
    else:
        y, x = np.ogrid[:frame.height, :frame.width]
        boundary = np.interp(y, [106, 120, 135, 150], seam)
        cat = (y >= 106) & ((x < boundary) if side == 'left' else (x >= boundary))
    main_cat = largest_component(cat & (alpha > 32))
    main_body = largest_component(~cat & (alpha > 32))
    cat_mask = main_cat & (~main_body | cat)
    body_mask = main_body & (~main_cat | ~cat)
    return tuple(Image.fromarray(np.where(mask[:, :, None], pixels, 0))
                 for mask in (body_mask, cat_mask))


def offset(frame, x, y):
    translated = Image.new('RGBA', frame.size)
    translated.paste(frame, (x, y))
    return translated


def place_companion(companion, center, baseline):
    left, _, right, bottom = alpha_box(companion)
    return offset(companion, round(center - (left + right) / 2), baseline - bottom)


def darya_world_layers(keyframes, layout):
    motion = layout['companion_motion']
    ground = round(layout['pivot']['y'] * layout['cell'])
    result = {}
    for direction, anchor in motion['anchors'].items():
        default_side = 'left' if anchor < layout['cell'] / 2 else 'right'
        overrides = motion['cat_screen_side_overrides'].get(direction, {})
        seams = motion['joined_pose_seams'][direction]
        for pose in dict.fromkeys((*RUN, *overrides)):
            name = world_name(pose, direction)
            body, cat = split_companion(keyframes[name], overrides.get(pose, default_side), seams.get(pose))
            airborne = pose.startswith('run-float')
            baseline = ground - 2 if airborne else ground
            if pose in RUN:
                body = offset(body, 0, baseline - alpha_box(body)[3])
            follow_through = (2 if default_side == 'left' else -2) if airborne else 0
            cat = place_companion(cat, anchor + follow_through, baseline - 1)
            result[name] = body, cat
            keyframes[name] = Image.alpha_composite(cat, body)
    return result


def load_world_art(source, layout):
    path = source / layout['source']
    if hashlib.sha256(path.read_bytes()).hexdigest() != layout['source_sha256']:
        raise ValueError(f'{path}: source revision differs from layout')
    directions, poses, cell = layout['directions'], layout['poses'], layout['cell']
    keyframes, sparse = {}, {}
    with Image.open(path) as image:
        if image.size != (len(directions) * cell, len(poses) * cell):
            raise ValueError(f'{path}: source dimensions differ from layout')
        for row, pose in enumerate(poses):
            for col, direction in enumerate(directions):
                rect = (col * cell, row * cell, (col + 1) * cell, (row + 1) * cell)
                keyframes[world_name(pose, direction)] = image.crop(rect).convert('RGBA')

    layers = darya_world_layers(keyframes, layout) if 'companion_motion' in layout else {}
    for direction in directions:
        idle = keyframes[world_name('idle', direction)]
        keyframes[world_name('breath', direction)] = idle.transform(
            idle.size, Image.Transform.AFFINE, (1, 0, 0, 0, 1.012, -1.012 * cell * .012 * .94),
            Image.Resampling.BICUBIC,
        )
        for group in (WALK, RUN):
            for i, pose in enumerate(group):
                first = world_name(pose, direction)
                second = world_name(group[(i + 1) % len(group)], direction)
                between = world_name(pose + '-mid', direction)
                if first in layers and second in layers:
                    body_a, cat_a = layers[first]
                    body_b, cat_b = layers[second]
                    keyframes[between] = Image.alpha_composite(midpoint(cat_a, cat_b), midpoint(body_a, body_b))
                else:
                    keyframes[between] = midpoint(keyframes[first], keyframes[second])
                if i % 2 == 0:
                    sparse[between] = first
    return keyframes, sparse


def world_animations(directions):
    def clip(poses, fps, loop=False, **metadata):
        by_direction = {
            direction: [world_name(pose, direction) for pose in poses]
            for direction in directions
        }
        return {'frames': by_direction['e'], 'framesByDirection': by_direction,
                'fps': fps, 'loop': loop, **metadata}

    walk = [p for pose in WALK for p in (pose, pose + '-mid')]
    run = [p for pose in RUN for p in (pose, pose + '-mid')]
    stop = clip(('run-b', 'impact', 'walk-pass-b', 'idle'), 16)
    wave = clip(('idle', 'greet', 'greet', 'greet', 'idle'), 6)
    animations = {
        'idle': clip(('idle', 'idle', 'breath', 'breath'), 4, True),
        'walk': clip(walk, 9, True, cycleCount=1, contactFrames=[0, 4]),
        'run': clip(run, 13, True, cycleCount=1, contactFrames=[0, 4]),
        'sprint': clip(run, 15, True, cycleCount=1, contactFrames=[0, 4]),
        'start': clip(('idle', 'walk-a', 'walk-pass-a'), 15),
        'stop': stop,
        'turn': clip(('breath', 'idle'), 12),
        'takeoff': clip(('impact', 'launch'), 12),
        'jump': clip(('launch', 'tuck', 'tuck'), 12),
        'fall': clip(('tuck', 'descend', 'descend'), 12),
        'land': clip(('impact', 'walk-pass-a', 'breath', 'idle'), 25),
        'crouch': clip(('impact',), 1),
        'slide': clip(('impact', 'impact', 'impact', 'walk-pass-a'), 9),
        'wave': wave,
        'celebrate': {**wave, 'sharedFrameSource': 'wave'},
        'win': {**wave, 'sharedFrameSource': 'wave'},
        'skid': {**stop, 'sharedFrameSource': 'stop'},
        'dash': clip(run, 19, True, cycleCount=1, contactFrames=[0, 4]),
    }
    animations.update({alias: {**animations[target], 'sharedFrameSource': target}
                       for alias, target in ALIASES.items()})
    return animations


def side_animations(legacy):
    def sample(sequence, count, loop):
        span = len(sequence) if loop else len(sequence) - 1
        divisor = count if loop else max(1, count - 1)
        return [f'side_{sequence[round(i * span / divisor)]}' for i in range(count)]

    animations = {}
    for state, count in SIDE_COUNTS.items():
        old = legacy[state]
        loop = old['loop']
        frames = sample(old['frames'], count, loop)
        clip = {'frames': frames, 'fps': round(old['fps'] * count / len(old['frames']), 6), 'loop': loop}
        if 'cycleCount' in old:
            clip['cycleCount'] = old['cycleCount']
        if 'framesByDirection' in old:
            clip['framesByDirection'] = {
                d: sample(old['framesByDirection'][d], count, loop) for d in ('e', 'w')
            }
        animations[state] = clip

    for alias, state in {**ALIASES, 'skid': 'run', 'dash': 'run', 'turn': 'idle'}.items():
        animations[alias] = {**animations[state], 'sharedFrameSource': state}
    return animations


def use_darya_runner_gait(side, art, reference, layout):
    phases = ('run-a', 'run-a-mid', 'run-float-a', 'run-b', 'run-b-mid', 'run-float-b')
    cycles = reference['run']['cycleCount']
    cell = layout['cell']
    pivot_x, pivot_y = (layout['pivot'][axis] * cell for axis in ('x', 'y'))
    silhouettes = [alpha_box(art[world_name(phase, direction)])
                   for direction in ('e', 'w') for phase in phases]
    calibration = read_json(ROOT / 'resources/game/character-visual-standard-v2.json')
    target_height = calibration['characters']['darya']['standingHeightRatios']['sideView'] * cell
    inverse_scale = median(bottom - top for _, top, _, bottom in silhouettes) / target_height
    transform = (inverse_scale, 0, pivot_x * (1 - inverse_scale),
                 0, inverse_scale, pivot_y * (1 - inverse_scale))
    by_direction, aliases = {}, {}
    for direction in ('e', 'w'):
        sequence = [f'side_run_{direction}_{phase}' for phase in phases]
        for name, phase in zip(sequence, phases):
            frame = art[world_name(phase, direction)]
            art[name] = frame.transform(frame.size, Image.Transform.AFFINE, transform, Image.Resampling.BICUBIC)
        by_direction[direction] = list(sequence)
        for cycle in range(1, cycles):
            repeat = [f'{name}_{cycle + 1}' for name in sequence]
            aliases.update(zip(repeat, sequence))
            by_direction[direction].extend(repeat)
    for state in ('run', 'sprint'):
        timing = reference[state]
        if len(timing['frames']) != len(phases) * cycles or timing['cycleCount'] != cycles:
            raise ValueError(f'{state}: Arsal runner timing no longer matches the authored Darya gait')
        side[state] = {'frames': by_direction['e'], 'framesByDirection': by_direction,
                       'fps': timing['fps'], 'loop': timing['loop'], 'cycleCount': cycles}
    for state in ('skid', 'dash'):
        side[state] = {**side['run'], 'sharedFrameSource': 'run'}
    return aliases


def build_variant(directory, slug, variant, cell, layout, art, sparse, animations, side, runner_aliases):
    legacy = read_json(directory / f'{slug}-atlas-v14-{variant}.json')
    side_names = dict.fromkeys(name for clip in side.values()
                              for frames in [clip['frames'], *clip.get('framesByDirection', {}).values()]
                              for name in frames if name not in art and name not in runner_aliases)
    images = {name: frame.resize((cell, cell), Image.Resampling.LANCZOS)
              for name, frame in art.items() if variant != 'lite' or name not in sparse}
    aliases = {**runner_aliases, **(sparse if variant == 'lite' else {})}
    with Image.open(directory / legacy['meta']['image']) as atlas:
        seen = {}
        for name in side_names:
            rect = legacy['frames'][name.removeprefix('side_')]
            box = (rect['x'], rect['y'], rect['x'] + rect['w'], rect['y'] + rect['h'])
            if box in seen:
                aliases[name] = seen[box]
            else:
                seen[box] = name
                images[name] = atlas.crop(box).convert('RGBA')

    columns = math.ceil(math.sqrt(len(images)))
    rows = math.ceil(len(images) / columns)
    packed = Image.new('RGBA', (columns * cell, rows * cell))
    frames = {}
    for i, (name, frame) in enumerate(images.items()):
        x, y = i % columns * cell, i // columns * cell
        packed.paste(frame, (x, y))
        frames[name] = {'x': x, 'y': y, 'w': cell, 'h': cell}
    frames.update({name: frames[target] for name, target in aliases.items()})
    path = directory / f'{slug}-spritesheet-v15-{variant}.png'
    packed.save(path, optimize=True)
    meta = {
        'slug': slug, 'name': legacy['meta']['name'], 'version': 15,
        'variant': variant, 'image': path.name, 'imageRevision': hashlib.sha256(path.read_bytes()).hexdigest(),
        'size': {'w': packed.width, 'h': packed.height}, 'frameSize': {'w': cell, 'h': cell},
        'grid': {'columns': columns, 'rows': rows}, 'decodedBytes': packed.width * packed.height * 4,
        'directions': layout['directions'], 'sourceKeyPoseCount': len(layout['directions']) * len(layout['poses']),
        'generatedFrameCount': len(frames), 'packedPhysicalFrameCount': len(images),
        'animationCount': len(animations), 'artIntegrity': 'valid', 'license': legacy['meta']['license'],
    }
    render = dict(legacy['render'])
    render.pop('bodyScaleCalibration', None)
    result = {
        'meta': meta, 'frames': frames, 'animations': animations, 'sideViewAnimations': side,
        'pivot': layout['pivot'], 'display': legacy['display'], 'render': render,
        'motion': legacy['motion'], 'movement': legacy['movement'],
        **({'speech': legacy['speech']} if 'speech' in legacy else {}),
        'fallbacks': legacy['fallbacks'],
    }
    if 'companion' in legacy:
        result['companion'] = legacy['companion']
    target = directory / f'{slug}-atlas-v15-{variant}.json'
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{slug}/{variant}: {len(images)} physical cells, {meta["decodedBytes"] / 1048576:.2f} MiB decoded')
    return {'atlas': f'../{target.name}', 'image': f'../{path.name}'}


def build(slug):
    directory = CHARACTERS / slug
    source = directory / 'source-v15'
    layout = read_json(source / 'layout.json')
    if layout['character'] != slug or layout['version'] != 15:
        raise ValueError(f'{source}: incorrect character or pack version')
    art, sparse = load_world_art(source, layout)
    animations = world_animations(layout['directions'])
    side = side_animations(read_json(directory / f'{slug}-atlas-v14-mobile.json')['animations'])
    runner_aliases = {}
    if slug == 'darya':
        reference = read_json(CHARACTERS / 'arsal/arsal-atlas-v15-mobile.json')['sideViewAnimations']
        runner_aliases = use_darya_runner_gait(side, art, reference, layout)
        animations['companion'] = {**animations['idle'], 'sharedFrameSource': 'idle'}
        side['companion'] = {**side['idle'], 'sharedFrameSource': 'idle'}
    targets = {variant: build_variant(directory, slug, variant, cell, layout, art, sparse, animations, side, runner_aliases)
               for variant, cell in VARIANTS.items()}
    art['world_s_idle'].resize((224, 224), Image.Resampling.LANCZOS).save(
        directory / f'{slug}-preview-v15.png', optimize=True,
    )
    manifests = directory / 'manifests'
    manifest_path = manifests / 'character_manifest_v4.json'
    animation_filename = f'{slug}_animation_manifest_v15.json'
    manifest = read_json(manifest_path)
    manifest.update(pack_version=15, animations=list(animations))
    manifest['runtime'].update(atlas_targets=targets, animation_manifest=animation_filename)
    write_json(manifest_path, manifest)
    write_json(manifests / animation_filename, {
        'character_key': slug, 'pack_version': 15, 'source': '../source-v15/layout.json',
        'directions': layout['directions'], 'side_view_previous_art': 'V14',
        **({'side_view_run_art': 'V15', 'side_view_run_timing_reference': 'arsal'} if slug == 'darya' else {}),
        'states': {name: {key: clip[key] for key in ('fps', 'loop') } |
                   {'frames': len(clip['frames'])} for name, clip in animations.items()},
    })


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--characters', nargs='+', choices=REFERENCES, default=REFERENCES)
    cv2.setNumThreads(1)
    for slug in parser.parse_args().characters:
        build(slug)


if __name__ == '__main__':
    main()
