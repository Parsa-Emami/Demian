#!/usr/bin/env python3
"""MIT. Build the three reference-driven V14 packs from shipped RGBA masters.

Artwork is generated once, not at runtime. This deterministic packaging step
cuts real poses, calibrates one uniform body scale, and bakes motion in-betweens.
It never squeezes a standing sprite into a slide or dissolves two silhouettes.
Install tools/requirements-character-art.txt before rebuilding.
"""
from __future__ import annotations

import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ROOT / 'public/assets/characters'
VERSION, COLS, ROWS, WORK = 14, 24, 28, 224
VARIANTS = {'desktop': 144, 'mobile': 112, 'compact': 80}
DIRECTIONS = ('s', 'sw', 'w', 'nw', 'n', 'ne', 'e', 'se')
LABELS = {'darya': 'DARYA / دریا', 'setayesh': 'SETAYESH / ستایش', 'uzudi': 'UZUDI / اوزودی'}
COUNTS = {'idle': 40, 'walk': 64, 'run': 80, 'jump': 48, 'slide': 64, 'land': 24, 'celebrate': 64}
BODY_RATIO, FOOT_PIVOT = .70, .94
GUTTER = 12  # > maximum in-between displacement (14 * 0.5) + downsample filter


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def isolate(image):
    """Remove only tiny disconnected extraction fragments; preserve authored alpha."""
    pixels = np.asarray(image.convert('RGBA')).copy()
    labels, count = ndimage.label(pixels[:, :, 3] > 24)
    sizes = np.bincount(labels.ravel())
    keep = sizes >= max(12, sizes[1:].max(initial=0) * .0015)
    keep[0] = False
    retained = ndimage.binary_dilation(keep[labels], iterations=1)
    pixels[:, :, 3] = np.where(retained, pixels[:, :, 3], 0)
    output = Image.fromarray(pixels)
    bbox = output.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    if not bbox:
        raise ValueError('Empty source pose')
    return output.crop(bbox)


def extract(master, y_bounds, columns=8):
    # Source sheets are art, not runtime grids. A vertical grid cut can slice
    # a kitten or a wing, and can retain the preceding pose's shoe/face.
    # Segment the full authored silhouettes first, then assign them to rows.
    p = np.asarray(master).copy()
    labels, count = ndimage.label(p[:, :, 3] > 48)
    sizes = np.bincount(labels.ravel())
    boxes = ndimage.find_objects(labels)
    expected = (len(y_bounds) - 1) * columns
    bodies = sorted(range(1, count + 1), key=lambda i: sizes[i], reverse=True)[:expected]
    if len(bodies) != expected or min(sizes[i] for i in bodies) < 700:
        raise ValueError('Source sheet does not contain the expected full-body poses')
    def center(label):
        box = boxes[label - 1]
        return ((box[1].start + box[1].stop) / 2, (box[0].start + box[0].stop) / 2)
    bodies.sort(key=lambda i: center(i)[1])
    assignments = {i: [i] for i in bodies}
    # A disconnected companion belongs to the nearest full body in its row.
    for i in range(1, count + 1):
        if i in assignments or sizes[i] < np.median([sizes[j] for j in bodies]) * .065:
            continue
        x, y = center(i)
        nearest = min(bodies, key=lambda j: (center(j)[0] - x) ** 2 + 2 * (center(j)[1] - y) ** 2)
        nx, ny = center(nearest)
        if abs(nx - x) < master.width / columns * .8 and abs(ny - y) < master.height / (len(y_bounds) - 1) * .7:
            assignments[nearest].append(i)
    rows = []
    for row in range(len(y_bounds) - 1):
        selected = sorted(bodies[row * columns:(row + 1) * columns], key=lambda i: center(i)[0])
        poses = []
        for body in selected:
            retained = ndimage.binary_dilation(np.isin(labels, assignments[body]), iterations=1)
            pixels = p.copy(); pixels[:, :, 3] = np.where(retained, pixels[:, :, 3], 0)
            image = Image.fromarray(pixels)
            bbox = image.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
            poses.append(image.crop(bbox))
        rows.append(poses)
    return rows


def face_geometry(pose):
    p = np.asarray(pose)
    r, g, b, a = [p[:, :, i].astype(float) for i in range(4)]
    skin = (a > 160) & (r > 155) & (g > 80) & (b < 195) & (r > g * 1.12) & (g > b * 1.03)
    skin[round(pose.height * .65):] = False
    labels, count = ndimage.label(ndimage.binary_closing(skin, iterations=2))
    sizes = np.bincount(labels.ravel()); sizes[0] = 0
    if not count or sizes.max() < 24:
        return pose.width * .25, pose.width * .5
    ys, xs = np.where(labels == sizes.argmax())
    return float(xs.max() - xs.min() + 1), float(xs.mean())


def normalized(pose, scale):
    # Scale uniformly using the identity's face calibration, never per-pose height.
    _, face_x = face_geometry(pose)
    w, h = max(1, round(pose.width * scale)), max(1, round(pose.height * scale))
    resized = pose.resize((w, h), Image.Resampling.LANCZOS)
    x, y = round(WORK * .5 - face_x * scale), round(WORK * FOOT_PIVOT - h)
    x = max(GUTTER, min(WORK - GUTTER - w, x))
    if w > WORK - GUTTER * 2 or h > WORK * FOOT_PIVOT - GUTTER + 1:
        # An extended wing must fit without clipping. Recalibrate the entire
        # source sequence in build_character(), rather than shrinking this frame.
        raise ValueError(f'Pose does not fit uniform body scale: {w}x{h}')
    output = Image.new('RGBA', (WORK, WORK))
    output.alpha_composite(resized, (x, max(GUTTER, y)))
    return np.asarray(output).copy()


def grey(pixels):
    alpha = pixels[:, :, 3:4] / 255
    rgb = (pixels[:, :, :3] * alpha + 230 * (1 - alpha)).astype(np.uint8)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)


def dense(poses, count, scale, loop=True):
    """Single-owner optical-flow in-betweens, so there is no double face/limb."""
    source = [normalized(p, scale) for p in poses]
    pairs = len(source) if loop else len(source) - 1
    fields = []
    for i in range(pairs):
        a, b = grey(source[i]), grey(source[(i + 1) % len(source)])
        forward = cv2.calcOpticalFlowFarneback(a, b, None, .5, 4, 27, 5, 7, 1.5, 0)
        backward = cv2.calcOpticalFlowFarneback(b, a, None, .5, 4, 27, 5, 7, 1.5, 0)
        fields.append((np.clip(forward, -14, 14), np.clip(backward, -14, 14)))
    gx, gy = np.meshgrid(np.arange(WORK, dtype=np.float32), np.arange(WORK, dtype=np.float32))
    output = []
    for i in range(count):
        position = i / (count if loop else max(count - 1, 1)) * pairs
        k = min(pairs - 1, int(position)); t = position - k
        base, flow, amount = (source[k], fields[k][0], t) if t < .5 else (source[(k + 1) % len(source)], fields[k][1], 1 - t)
        pixels = cv2.remap(base, gx - flow[:, :, 0] * amount, gy - flow[:, :, 1] * amount,
            cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
        pixels[:, :, 3][pixels[:, :, 3] < 20] = 0
        output.append(Image.fromarray(pixels))
    return output


def anim(frames, fps, loop=True, **extra):
    return {'frames': list(frames), 'fps': fps, 'loop': loop, **extra}


def build_character(slug):
    directory = CHARACTERS / slug
    layout = read_json(directory / 'source-v14/layout.json')
    main = Image.open(directory / 'source-v14/master.png').convert('RGBA')
    motion = Image.open(directory / 'source-v14/runner-motion.png').convert('RGBA')
    slides = Image.open(directory / 'source-v14/slides.png').convert('RGBA')
    assert np.asarray(main)[:, :, 3].min() == 0 and np.asarray(motion)[:, :, 3].min() == 0
    main_rows = extract(main, layout['mainRowBounds'])
    top = motion.crop((0, 0, motion.width, round(motion.height * .62)))
    run_poses = extract(top, [0, top.height])[0]
    slide_rows = extract(slides, [0, round(slides.height * .5), slides.height], columns=4)
    poses = dict(zip(('turn', 'idle', 'walk', 'jump', 'crouch', 'land', 'celebrate'), main_rows))
    poses.update(run=run_poses, slide=slide_rows[0] + slide_rows[1])
    if slug == 'darya':
        # The first row is a seated entry gesture. The second row is the
        # authored low slide; only this low cycle can clear the runner birds.
        # Keep its face and cat at the same scale instead of shrinking the body.
        poses['slide'] = slide_rows[1]
    base_scale = WORK * BODY_RATIO / np.median([p.height for p in poses['idle']])
    main_face = np.median([face_geometry(p)[0] for p in poses['idle']])
    motion_face = np.median([face_geometry(p)[0] for p in poses['run']])
    motion_scale = base_scale * main_face / motion_face
    slide_scale = base_scale * main_face / np.median([face_geometry(p)[0] for p in poses['slide']])
    # Whole-sequence width cap keeps long wings/extended slide legs inside gutters.
    def cap_scale(keys, factor):
        selected = [p for key in keys for p in poses[key]]
        return min(factor, (WORK - GUTTER * 2) / max(p.width for p in selected), (WORK * FOOT_PIVOT - GUTTER) / max(p.height for p in selected))
    base_scale = cap_scale(('turn', 'idle', 'walk', 'jump', 'land', 'celebrate'), base_scale)
    motion_scale = cap_scale(('run',), motion_scale)
    slide_scale = cap_scale(('slide',), slide_scale)
    body_ratio = float(np.median([p.height * base_scale for p in poses['idle']]) / WORK)
    sequences = {'idle': dense(poses['idle'], COUNTS['idle'], base_scale)}
    for key in ('walk', 'run', 'jump', 'slide', 'land'):
        sequence = dense(poses[key], COUNTS[key], slide_scale if key == 'slide' else motion_scale if key == 'run' else base_scale, key not in ('jump', 'land'))
        sequences[key + '_e'] = sequence
        sequences[key + '_w'] = [p.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for p in sequence]
    sequences['celebrate'] = dense(poses['celebrate'], COUNTS['celebrate'], base_scale)
    sequences['turn'] = [Image.fromarray(normalized(p, base_scale)) for p in poses['turn']]
    assert sum(map(len, sequences.values())) == COLS * ROWS == 672
    names = {key: [f'{key}_{i:03}' for i in range(len(frames))] for key, frames in sequences.items()}
    sequences['turn'][0].save(directory / f'{slug}-preview-v14.png', optimize=True)
    def directional(key, fps, loop=True, start=None, end=None):
        east, west = names[key + '_e'][start:end], names[key + '_w'][start:end]
        return anim(east, fps, loop, framesRight=east, framesLeft=west,
            framesByDirection={d: west if 'w' in d else east for d in DIRECTIONS}, motion=key,
            locomotionStyle='wing-assisted' if slug == 'uzudi' else 'ground-runner')
    idle_map = {d: names['idle'] if d in ('e', 'se') else [names['turn'][i]] * COUNTS['idle'] for i, d in enumerate(DIRECTIONS)}
    animations = {
        'idle': anim(names['idle'], 24, framesByDirection=idle_map),
        'breathe': anim(names['idle'], 24, framesByDirection=idle_map),
        'blink': anim(names['idle'], 24, framesByDirection=idle_map),
        'ready': anim(names['idle'], 24, framesByDirection=idle_map),
        'walk': directional('walk', 72), 'run': directional('run', 96), 'sprint': directional('run', 112),
        'takeoff': directional('jump', 96, False, 0, 16),
        'jump': directional('jump', 32, False, 16, 32),
        'fall': directional('jump', 64, False, 32, 48),
        'land': directional('land', 150, False), 'slide': directional('slide', 80),
        'crouch': directional('slide', 1, False, 0, 1),
        'turn': anim(names['turn'], 12, False),
        'wave': anim(names['celebrate'][:32], 32, False),
        'celebrate': anim(names['celebrate'], 64, False), 'win': anim(names['celebrate'], 48, False),
    }
    if slug == 'darya':
        animations['companion'] = anim(names['idle'], 24)
    for variant, cell in VARIANTS.items():
        sheet = Image.new('RGBA', (COLS * cell, ROWS * cell)); frames = {}; index = 0
        for key, sequence in sequences.items():
            for i, pose in enumerate(sequence):
                x, y = index % COLS * cell, index // COLS * cell
                sheet.paste(pose.resize((cell, cell), Image.Resampling.LANCZOS), (x, y))
                frames[names[key][i]] = {'x': x, 'y': y, 'w': cell, 'h': cell}; index += 1
        image_name = f'{slug}-spritesheet-v14-{variant}.png'
        atlas = {'meta': {'name': LABELS[slug], 'version': VERSION, 'variant': variant, 'image': image_name,
            'size': {'w': sheet.width, 'h': sheet.height}, 'frameSize': {'w': cell, 'h': cell},
            'grid': {'columns': COLS, 'rows': ROWS}, 'generatedFrameCount': len(frames),
            'animationCount': len(animations), 'directions': list(DIRECTIONS), 'artIntegrity': 'valid',
            'interpolation': 'single-owner-optical-flow',
            'sourceKeyPoseCount': sum(len(poses[key]) for key in ('turn', 'idle', 'walk', 'run', 'jump', 'slide', 'land', 'celebrate')),
            'license': 'MIT'},
            'frames': frames, 'animations': animations,
            'fallbacks': {'tiptoe': 'walk', 'hop': 'jump', 'hover': 'jump', 'dash': 'run', 'dodge': 'slide'},
            'pivot': {'x': .5, 'y': FOOT_PIVOT}, 'display': {'worldWidth': 3.75, 'worldHeight': 3.75},
            'motion': {'directionDepthScale': 0, 'northSouthScale': 1, 'diagonalScale': 1},
            'render': {'referenceBodyHeightRatio': body_ratio, 'referenceBodyWidthRatio': .78,
                'preserveAspectRatio': True, 'frameBlend': False, 'lockBodyScale': True,
                'singleSilhouette': True, 'physicsOwnsJumpHeight': True, 'dedicatedSlide': True, 'smoothSampling': True},
            'movement': {'style': 'wing-assisted' if slug == 'uzudi' else 'ground-runner',
                'wingPoweredStates': ['run', 'sprint', 'takeoff', 'jump', 'fall', 'slide'] if slug == 'uzudi' else []},
        }
        if slug == 'darya':
            atlas['companion'] = {'id': 'pishi', 'alwaysVisible': True, 'bakedIntoEveryFrame': True, 'collisionIndependent': True}
        sheet.save(directory / image_name, optimize=True)
        write_json(directory / f'{slug}-atlas-v14-{variant}.json', atlas)
        print(f'{slug} / {variant}: {len(frames)} frames, {sheet.width}x{sheet.height}', flush=True)
    animation_manifest = {'character_key': slug, 'pack_version': VERSION,
        'source_atlas': {'pack_version': VERSION, 'files': [f'{slug}-atlas-v14-{v}.json' for v in VARIANTS]},
        'grid': {'columns': COLS, 'rows': ROWS},
        'variant_frame_size': {v: {'w': c, 'h': c} for v, c in VARIANTS.items()},
        'states': {key: {'frames': len(a['frames']), 'fps': a['fps'], 'loop': a['loop']} for key, a in animations.items()}}
    manifest = {'character_key': slug, 'display_name': LABELS[slug], 'production_status': 'gold_standard_production',
        'pack_version': VERSION, 'source_of_truth': {'reference_manifest': f'{slug}_reference_manifest.json'},
        'identity_contract': f'{slug}_identity_contract.json', 'animations': list(animations),
        'runtime': {'identity_manifest': f'{slug}_identity_contract.json', 'asset_manifest': 'character_manifest_v4.json',
            'animation_manifest': f'{slug}_animation_manifest.json', 'motion_profile': f'{slug}_motion_profile.json',
            'ability_profile': f'{slug}_ability_profile.json', 'qa_status': f'{slug}_qa_status.json',
            'atlas_targets': {v: {'atlas': f'../{slug}-atlas-v14-{v}.json', 'image': f'../{slug}-spritesheet-v14-{v}.png'} for v in VARIANTS}},
    }
    md = directory / 'manifests'
    write_json(md / 'character_manifest_v4.json', manifest)
    write_json(md / f'{slug}_animation_manifest.json', animation_manifest)
    write_json(md / f'{slug}_identity_contract.json', {'character_key': slug, 'reference': '../source-v14/reference.jpg',
        'invariants': layout['identity'], 'pack_version': VERSION})
    write_json(md / f'{slug}_reference_manifest.json', {'character_key': slug, 'pack_version': VERSION,
        'reference': '../source-v14/reference.jpg', 'master': '../source-v14/master.png', 'runner_motion': '../source-v14/runner-motion.png', 'slide_master': '../source-v14/slides.png'})
    write_json(md / f'{slug}_motion_profile.json', {'character_key': slug, 'pack_version': VERSION,
        'physics_owns_jump_height': True, 'dedicated_slide': True, 'uniform_body_scale': True,
        'style': atlas['movement']['style'], 'wing_powered_states': atlas['movement']['wingPoweredStates']})
    write_json(md / f'{slug}_ability_profile.json', {'character_key': slug, 'pack_version': VERSION,
        'runner_physics': 'shared', 'combat': False, 'companion_collision_independent': slug == 'darya'})


def main():
    cv2.setNumThreads(4)
    for slug in LABELS:
        build_character(slug)
    write_json(CHARACTERS / 'character-manifest-v4.json', {'manifest_version': 'v4',
        'production_character': 'darya', 'release': 'mobile-runner-v14',
        'characters': [{'slug': slug, 'display_name': label, 'production_status': 'gold_standard_production',
            'is_default_active': slug == 'darya', 'pack_version': VERSION,
            'manifest': f'{slug}/manifests/character_manifest_v4.json', 'has_shipped_assets': True}
            for slug, label in LABELS.items()]})


if __name__ == '__main__':
    main()
