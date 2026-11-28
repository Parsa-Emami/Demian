import argparse
import hashlib
import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from build_character_pack_v14 import grey, read_json, write_json
from darya_v15_motion_art import (build_darya_art, build_pishi_art, WALK as DARYA_WALK, RUN as DARYA_RUN,
                                 VARIANTS as DARYA_VARIANTS, MOTION_REVISION as DARYA_MOTION_REVISION)
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


def pack_images(images, cell, aliases=None):
    columns = math.ceil(math.sqrt(len(images)))
    rows = math.ceil(len(images) / columns)
    packed = Image.new('RGBA', (columns * cell, rows * cell))
    frames = {}
    for i, (name, frame) in enumerate(images.items()):
        x, y = i % columns * cell, i // columns * cell
        packed.paste(frame, (x, y))
        frames[name] = {'x': x, 'y': y, 'w': cell, 'h': cell}
    frames.update({name: frames[target] for name, target in (aliases or {}).items()})
    return packed, frames, columns, rows


def save_art(path, packed, *, use_palette=False):
    if use_palette:
        alpha = packed.getchannel('A')
        clear = alpha.point(lambda value: 255 if value < 60 else 0)
        opaque = Image.new('RGB', packed.size)
        opaque.paste(packed, mask=alpha.point(lambda value: 255 if value >= 60 else 0))
        indexed = opaque.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        palette = indexed.getpalette()
        indexed.putpalette(palette + [0] * (768 - len(palette)))
        indexed.paste(255, mask=clear)
        indexed.save(path, transparency=255, bits=8, optimize=True)
    else:
        packed.save(path, optimize=True)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def unique_images(images):
    physical, aliases, seen = {}, {}, {}
    for name, image in images.items():
        key = hashlib.sha256(image.tobytes()).digest()
        if key in seen:
            aliases[name] = seen[key]
        else:
            seen[key] = name
            physical[name] = image
    return physical, aliases


def build_companion(directory, source, layout):
    art, animations = build_pishi_art(source, layout)
    cell = 48
    images, aliases = unique_images({name: image.resize((cell, cell), Image.Resampling.LANCZOS)
                                     for name, image in art.items()})
    sheet, frames, _, _ = pack_images(images, cell, aliases)
    path = directory / 'pishi-spritesheet-v15-1.png'
    revision = save_art(path, sheet, use_palette=True)
    art['s_idle-00'].resize((112, 112), Image.Resampling.LANCZOS).save(
        directory / 'pishi-preview-v15-1.png', optimize=True,
    )
    return {'id': 'pishi', 'alwaysVisible': True, 'collisionIndependent': True,
            'bakedIntoEveryFrame': False, 'pivot': {'x': .5, 'y': 49 / 56}, 'worldSize': 1.74,
            'runnerSize': 29, 'frames': frames, 'animations': animations,
            'meta': {'image': path.name, 'imageRevision': revision,
                     'size': {'w': sheet.width, 'h': sheet.height}}}


def build_variant(directory, slug, variant, cell, layout, art, sparse, animations, side, *,
                  animation_offsets=None, companion=None):
    legacy = read_json(directory / f'{slug}-atlas-v14-{variant}.json')
    images = {name: frame.resize((cell, cell), Image.Resampling.LANCZOS)
              for name, frame in art.items() if variant != 'lite' or name not in sparse}
    aliases = dict(sparse) if variant == 'lite' else {}
    if companion:
        images, aliases = unique_images(images)
    else:
        side_names = dict.fromkeys(name for clip in side.values()
                                  for frames in [clip['frames'], *clip.get('framesByDirection', {}).values()]
                                  for name in frames)
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

    packed, frames, columns, rows = pack_images(images, cell, aliases)
    path = directory / f'{slug}-spritesheet-v15-{variant}.png'
    revision = save_art(path, packed, use_palette=bool(companion))
    meta = {
        'slug': slug, 'name': legacy['meta']['name'], 'version': 15,
        'variant': variant, 'image': path.name, 'imageRevision': revision,
        'size': {'w': packed.width, 'h': packed.height}, 'frameSize': {'w': cell, 'h': cell},
        'grid': {'columns': columns, 'rows': rows}, 'decodedBytes': packed.width * packed.height * 4,
        'directions': layout['directions'], 'sourceKeyPoseCount': len(layout['directions']) * len(layout['poses']),
        'generatedFrameCount': len(frames), 'packedPhysicalFrameCount': len(images),
        'animationCount': len(animations), 'artIntegrity': 'valid', 'license': legacy['meta']['license'],
    }
    render = dict(legacy['render'])
    render.pop('bodyScaleCalibration', None)
    motion = legacy['motion']
    if companion:
        meta['motionRevision'] = DARYA_MOTION_REVISION
        meta['sourceKeyPoseCount'] = len(layout['directions'])
        render.update(referenceBodyWidthRatio=.46, frameOffsetsY=animation_offsets, directionStepSeconds=.046)
        motion['locomotionProfile'].update(strideLengths={
            'walk': DARYA_WALK[1], 'run': DARYA_RUN[1], 'sprint': DARYA_RUN[1],
        }, maxStrideHz=2.8, preserveStridePhaseOnResume=True)
    result = {
        'meta': meta, 'frames': frames, 'animations': animations, 'sideViewAnimations': side,
        'pivot': layout['pivot'], 'display': legacy['display'], 'render': render,
        'motion': motion, 'movement': legacy['movement'],
        **({'speech': legacy['speech']} if 'speech' in legacy else {}),
        'fallbacks': legacy['fallbacks'],
    }
    if companion:
        result['companion'] = companion
    elif 'companion' in legacy:
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
    options = {}
    if slug == 'darya':
        for key, expected in layout['motion_art_sha256'].items():
            if hashlib.sha256((source / layout['motion_art'][key]).read_bytes()).hexdigest() != expected:
                raise ValueError(f'{source}: invalid {key} turnaround revision')
        art, offsets, animations, side = build_darya_art(source, layout)
        options.update(animation_offsets=offsets, companion=build_companion(directory, source, layout))
        sparse = {}
        preview = art['world_s_idle-00']
    else:
        art, sparse = load_world_art(source, layout)
        animations = world_animations(layout['directions'])
        side = side_animations(read_json(directory / f'{slug}-atlas-v14-mobile.json')['animations'])
        preview = art['world_s_idle']
    variants = DARYA_VARIANTS if slug == 'darya' else VARIANTS
    targets = {variant: build_variant(directory, slug, variant, cell, layout, art, sparse, animations, side, **options)
               for variant, cell in variants.items()}
    preview.resize((224, 224), Image.Resampling.LANCZOS).save(
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
        'directions': layout['directions'],
        **({'motion_revision': DARYA_MOTION_REVISION, 'companion': 'pishi', 'side_view_art': 'dedicated'}
           if slug == 'darya' else {'side_view_previous_art': 'V14'}),
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
