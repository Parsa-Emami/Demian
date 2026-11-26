import hashlib
import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from build_character_pack_v14 import grey, read_json, write_json
from validate_character_pack_v14 import VARIANTS

ROOT = Path(__file__).resolve().parents[1]
ARSAL = ROOT / 'public/assets/characters/arsal'
SOURCE = ARSAL / 'source-v15'
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


def load_world_art(layout):
    path = SOURCE / layout['source']
    if hashlib.sha256(path.read_bytes()).hexdigest() != layout['source_sha256']:
        raise ValueError('Arsal V15 source revision differs from layout')
    directions, poses, cell = layout['directions'], layout['poses'], layout['cell']
    keyframes, sparse = {}, {}
    with Image.open(path) as image:
        if image.size != (len(directions) * cell, len(poses) * cell):
            raise ValueError('Arsal V15 source dimensions differ from layout')
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
        'land': clip(('impact', 'walk-pass-a', 'idle'), 18.75),
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


def build_variant(variant, cell, layout, art, sparse, animations, side):
    legacy = read_json(ARSAL / f'arsal-atlas-v14-{variant}.json')
    side_names = dict.fromkeys(name for clip in side.values()
                              for frames in [clip['frames'], *clip.get('framesByDirection', {}).values()]
                              for name in frames)
    images = {name: frame.resize((cell, cell), Image.Resampling.LANCZOS)
              for name, frame in art.items() if variant != 'lite' or name not in sparse}
    aliases = dict(sparse) if variant == 'lite' else {}
    with Image.open(ARSAL / legacy['meta']['image']) as atlas:
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
    path = ARSAL / f'arsal-spritesheet-v15-{variant}.png'
    packed.save(path, optimize=True)
    meta = {
        'slug': 'arsal', 'name': legacy['meta']['name'], 'version': 15,
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
        'motion': legacy['motion'], 'movement': legacy['movement'], 'speech': legacy['speech'],
        'fallbacks': legacy['fallbacks'],
    }
    target = ARSAL / f'arsal-atlas-v15-{variant}.json'
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{variant}: {len(images)} physical cells, {meta["decodedBytes"] / 1048576:.2f} MiB decoded')
    return {'atlas': f'../{target.name}', 'image': f'../{path.name}'}


def main():
    layout = read_json(SOURCE / 'layout.json')
    cv2.setNumThreads(1)
    art, sparse = load_world_art(layout)
    animations = world_animations(layout['directions'])
    side = side_animations(read_json(ARSAL / 'arsal-atlas-v14-mobile.json')['animations'])
    targets = {variant: build_variant(variant, cell, layout, art, sparse, animations, side)
               for variant, cell in VARIANTS.items()}
    art['world_s_idle'].resize((224, 224), Image.Resampling.LANCZOS).save(
        ARSAL / 'arsal-preview-v15.png', optimize=True,
    )
    manifests = ARSAL / 'manifests'
    manifest_path = manifests / 'character_manifest_v4.json'
    manifest = read_json(manifest_path)
    manifest.update(pack_version=15, animations=list(animations))
    manifest['runtime'].update(atlas_targets=targets, animation_manifest='arsal_animation_manifest_v15.json')
    write_json(manifest_path, manifest)
    write_json(manifests / 'arsal_animation_manifest_v15.json', {
        'character_key': 'arsal', 'pack_version': 15, 'source': '../source-v15/layout.json',
        'directions': layout['directions'], 'side_view_previous_art': 'V14',
        'states': {name: {key: clip[key] for key in ('fps', 'loop') } |
                   {'frames': len(clip['frames'])} for name, clip in animations.items()},
    })


if __name__ == '__main__':
    main()
