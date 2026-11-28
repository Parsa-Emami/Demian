import argparse
import hashlib
import json
import math
from pathlib import Path
from statistics import median

import cv2
import numpy as np
from PIL import Image, ImageChops, ImageDraw

from build_character_pack_v14 import WORK, extract, grey, normalized, read_json, write_json
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


def separate_darya_world_art(keyframes, layout):
    motion = layout['companion_motion']
    ground = round(layout['pivot']['y'] * layout['cell'])
    cats = {}
    for direction in layout['directions']:
        default_side = 'left' if direction in ('s', 'sw', 'e', 'se') else 'right'
        overrides = motion['cat_screen_side_overrides'].get(direction, {})
        seams = motion['joined_pose_seams'][direction]
        for pose in layout['poses']:
            name = world_name(pose, direction)
            body, cat = split_companion(keyframes[name], overrides.get(pose, default_side), seams.get(pose))
            if pose not in ('tuck', 'descend'):
                baseline = ground - 2 if pose.startswith('run-float') else ground
                body = offset(body, 0, baseline - alpha_box(body)[3])
            keyframes[name] = body
            cats[name] = cat
    for pose in WALK:
        keyframes[world_name(pose, 'e')] = keyframes[world_name(pose, 'w')].transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    return cats


def build_pishi(cats, layout):
    directory = CHARACTERS.parent / 'companions/pishi'
    directory.mkdir(parents=True, exist_ok=True)
    directions = layout['directions']
    states = {'idle': (('idle', 'idle-breathe'), 3), 'walk': (WALK, 8), 'run': (RUN, 12)}
    images, animations = {}, {}
    source_poses = ('idle', *WALK, *RUN)
    sources = {direction: dict(zip(source_poses, sequence, strict=True))
               for direction, sequence in layout['companion_motion']['pishi_poses'].items()}
    for state, (poses, fps) in states.items():
        clips = {}
        for direction in directions:
            clips[direction] = []
            for pose in poses:
                spec = sources[direction]['idle' if pose == 'idle-breathe' else pose]
                source = cats['world_' + spec.removeprefix('~')]
                if spec.startswith('~'):
                    source = source.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                bounce = 3 if pose.startswith('run-float') else 2 if 'walk-pass' in pose else 0
                art = place_companion(source, 80, 149 - bounce)
                if pose == 'idle-breathe':
                    art = art.transform(art.size, Image.Transform.AFFINE, (1, 0, 0, 0, 1.028, -4.2),
                                        Image.Resampling.BICUBIC)
                name = f'{direction}_{pose}'
                images[name] = art.crop((54, 100, 106, 152)).resize((64, 64), Image.Resampling.LANCZOS)
                clips[direction].append(name)
        animations[state] = {'frames': clips['s'], 'framesByDirection': clips, 'fps': fps, 'loop': True}
    packed = Image.new('RGBA', (8 * 64, math.ceil(len(images) / 8) * 64))
    frames = {}
    for index, (name, frame) in enumerate(images.items()):
        x, y = index % 8 * 64, index // 8 * 64
        packed.paste(frame, (x, y))
        frames[name] = {'x': x, 'y': y, 'w': 64, 'h': 64}
    image_path = directory / 'pishi.webp'
    packed.save(image_path, lossless=True, exact=True, method=6)
    portrait = images['s_idle']
    portrait.crop(alpha_box(portrait)).save(directory / 'portrait.webp', lossless=True, exact=True)
    write_json(directory / 'atlas.json', {
        'meta': {'slug': 'pishi', 'image': image_path.name,
                 'imageRevision': hashlib.sha256(image_path.read_bytes()).hexdigest()},
        'pivot': {'x': .5, 'y': 49 / 52}, 'display': {'worldWidth': 1.3, 'worldHeight': 1.3},
        'render': {'lockBodyScale': True, 'smoothSampling': True, 'referenceBodyHeightRatio': .8},
        'motion': {'locomotionProfile': {'strideLengths': {'walk': 1.35, 'run': 2.4}, 'maxStrideHz': 3.5}},
        'frames': frames, 'animations': animations,
    })


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

    cats = separate_darya_world_art(keyframes, layout) if 'companion_motion' in layout else {}
    for direction in directions:
        if cats:
            tuck = keyframes[world_name('tuck', direction)]
            descend = keyframes[world_name('descend', direction)]
            keyframes[world_name('apex-release', direction)] = midpoint(tuck, descend)
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
                frame = midpoint(keyframes[first], keyframes[second])
                if cats and group == RUN:
                    min_foot_line = round(cell * layout['pivot']['y']) - 3
                    frame = offset(frame, 0, max(0, min_foot_line - alpha_box(frame)[3]))
                keyframes[between] = frame
                if i % 2 == 0:
                    sparse[between] = first
    return keyframes, sparse, cats


def world_animations(directions, darya=False):
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
    if darya:
        animations.update(jump=clip(('tuck', 'tuck', 'apex-release'), 12),
                          fall=clip(('apex-release', 'descend', 'descend'), 12))
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


def separate_darya_runner_art(directory, layout, art, side):
    legacy = read_json(directory / 'darya-atlas-v14-desktop.json')
    cuts = layout['companion_motion']['runner_seams']
    groups = {
        'idle': side['idle']['frames'],
        'walk': side['walk']['frames'],
        'jump': [frame for state in ('takeoff', 'jump', 'fall') for frame in side[state]['frames']],
        'land': side['land']['frames'],
        'celebrate': list(dict.fromkeys(frame for state in ('wave', 'celebrate', 'win') for frame in side[state]['frames'])),
    }
    cell = layout['cell']
    ground = round(layout['pivot']['y'] * cell)
    walk_scale = 1 / 1.022
    walk_transform = (walk_scale, 0, cell * .5 * (1 - walk_scale),
                      0, walk_scale, ground * (1 - walk_scale))
    with Image.open(directory / legacy['meta']['image']) as image:
        for state, names in groups.items():
            for name, seam in zip(names, cuts[state], strict=True):
                x, y, w, h = (legacy['frames'][name.removeprefix('side_')][key] for key in ('x', 'y', 'w', 'h'))
                frame = image.crop((x, y, x + w, y + h)).convert('RGBA').resize((cell, cell), Image.Resampling.LANCZOS)
                body, _ = split_companion(frame, 'left', seam)
                if state != 'jump':
                    body = offset(body, 0, ground - alpha_box(body)[3])
                if state == 'walk':
                    body = body.transform(body.size, Image.Transform.AFFINE, walk_transform, Image.Resampling.BICUBIC)
                if name == side['land']['frames'][-1]:
                    body = art[side['idle']['frames'][0]]
                art[name] = body
                if '_e_' in name:
                    art[name.replace('_e_', '_w_')] = body.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    art['side_turn_002'] = art[world_name('idle', 'w')]


def build_darya_runner_slide(source, layout, art, side):
    spec = layout['runner_slide']
    path = source / spec['source']
    if hashlib.sha256(path.read_bytes()).hexdigest() != spec['sha256']:
        raise ValueError(f'{path}: slide source revision differs from layout')
    with Image.open(path) as image:
        poses = extract(image.convert('RGBA'), [0, image.height // 2, image.height], columns=4)[1]

    keyframes = []
    for pose, contour in zip(poses, spec['companion_masks'], strict=True):
        frame = Image.fromarray(normalized(pose, spec['scale']))
        top_line = [(0, contour[0][1]), *contour, (contour[-1][0], WORK), (0, WORK)]
        mask = Image.new('L', (WORK * 4, WORK * 4), 255)
        ImageDraw.Draw(mask).polygon([(x * 4, y * 4) for x, y in top_line], fill=0)
        alpha = ImageChops.multiply(frame.getchannel('A'), mask.resize(frame.size, Image.Resampling.LANCZOS))
        frame.putalpha(alpha)
        clean = Image.new('RGBA', frame.size)
        clean.alpha_composite(frame)
        keyframes.append(clean)

    sequence = [frame for i, pose in enumerate(keyframes)
                for frame in (pose, midpoint(pose, keyframes[(i + 1) % len(keyframes)]))]
    standard = read_json(ROOT / 'resources/game/character-visual-standard-v2.json')
    height_ratio = standard['characters']['darya']['standingHeightRatios']['sideView']
    runner = read_json(ROOT / 'resources/game/runner-rules.json')
    pivot_x, pivot_y = (layout['pivot'][axis] * WORK for axis in ('x', 'y'))
    max_height = (pivot_y - min(alpha_box(frame)[1] for frame in sequence)) / WORK
    inverse_scale = max(1, max_height * runner['bodyHeight'] / (height_ratio * spec['runner_height']))
    transform = (inverse_scale, 0, pivot_x * (1 - inverse_scale),
                 0, inverse_scale, pivot_y * (1 - inverse_scale))
    cell = layout['cell']
    east, west = (side['slide']['framesByDirection'][direction] for direction in ('e', 'w'))
    for east_name, west_name, frame in zip(east, west, sequence, strict=True):
        frame = frame.transform(frame.size, Image.Transform.AFFINE, transform, Image.Resampling.BICUBIC)
        frame = frame.resize((cell, cell), Image.Resampling.LANCZOS)
        art[east_name] = frame
        art[west_name] = frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)


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
    if slug != 'darya' and 'companion' in legacy:
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
    art, sparse, cats = load_world_art(source, layout)
    animations = world_animations(layout['directions'], darya=slug == 'darya')
    side = side_animations(read_json(directory / f'{slug}-atlas-v14-mobile.json')['animations'])
    runner_aliases = {}
    if slug == 'darya':
        reference = read_json(CHARACTERS / 'arsal/arsal-atlas-v15-mobile.json')['sideViewAnimations']
        runner_aliases = use_darya_runner_gait(side, art, reference, layout)
        separate_darya_runner_art(directory, layout, art, side)
        build_darya_runner_slide(source, layout, art, side)
        build_pishi(cats, layout)
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
        **({'side_view_run_art': 'V15', 'side_view_run_timing_reference': 'arsal',
            'side_view_slide_art': 'V15 contour reconstruction'} if slug == 'darya' else {}),
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
