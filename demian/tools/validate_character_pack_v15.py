import argparse
import hashlib
import json
from pathlib import Path
from statistics import median

from PIL import Image

from audit_dcs_v15_scale_directions import measure_frame
from character_art_registry import ACTIVE_CHARACTER_DEFINITIONS
from darya_v15_motion_art import CONTACTS, MOTION_REVISION, VARIANTS as DARYA_VARIANTS
from validate_character_pack_v14 import VARIANTS

ROOT = Path(__file__).resolve().parents[1] / 'public/assets/characters'
ACTIVE = tuple(slug for slug, profile in ACTIVE_CHARACTER_DEFINITIONS.items() if profile['pack_version'] == 15)
DIRECTIONS = ('s', 'sw', 'w', 'nw', 'n', 'ne', 'e', 'se')
BUDGETS = {'lite': 4, 'runtime': 12, 'detail': 34, 'compact': 12, 'mobile': 24, 'desktop': 34}
GAITS = {'idle': (.95, 1.05), 'walk': (.88, 1.05), 'run': (.82, 1.05), 'sprint': (.82, 1.05)}
DIRECTIONAL = ('idle', 'walk', 'run', 'sprint', 'start', 'stop', 'turn',
               'takeoff', 'jump', 'fall', 'land', 'crouch', 'wave')


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def names(clip):
    return [*clip['frames'], *(name for direction in clip.get('framesByDirection', {}).values() for name in direction)]


def validate_pishi(directory, companion):
    assert companion['id'] == 'pishi' and companion['alwaysVisible'] and companion['collisionIndependent']
    assert companion['bakedIntoEveryFrame'] is False
    assert companion['pivot'] == {'x': .5, 'y': 49 / 56}
    assert companion['worldSize'] == 1.74 and companion['runnerSize'] == 29
    path = directory / companion['meta']['image']
    assert path.name == 'pishi-spritesheet-v15-1.png'
    assert hashlib.sha256(path.read_bytes()).hexdigest() == companion['meta']['imageRevision']
    with Image.open(path) as art:
        image = art.convert('RGBA')
    assert image.size == (companion['meta']['size']['w'], companion['meta']['size']['h'])
    assert image.width * image.height * 4 <= 3 * 1024 ** 2
    expected = {'idle': 4, 'walk': 8, 'run': 10, 'takeoff': 2, 'jump': 3, 'fall': 2, 'land': 3, 'crouch': 2}
    assert expected.keys() == companion['animations'].keys()
    digests = {}
    for name, frame in companion['frames'].items():
        x, y, w, h = (frame[key] for key in ('x', 'y', 'w', 'h'))
        cropped = image.crop((x, y, x + w, y + h))
        bounds = measure_frame(image, frame, companion['pivot']['y'], 1, 1)
        assert not bounds['touches_edge'], name
        assert .58 <= bounds['height_cell_ratio'] <= .78, name
        digests[name] = hashlib.sha256(cropped.tobytes()).digest()
    for state, count in expected.items():
        clip = companion['animations'][state]
        assert tuple(clip['framesByDirection']) == DIRECTIONS
        for seq in clip['framesByDirection'].values():
            assert len(seq) == count
            assert len({digests[name] for name in seq}) >= min(count, 3), (state, seq)
        first_names = [clip['framesByDirection'][direction][0] for direction in DIRECTIONS]
        assert len({digests[name] for name in first_names}) == len(DIRECTIONS), state


def validate(slug, variant, cell, target):
    directory = ROOT / slug
    atlas_path = directory / f'{slug}-atlas-v15-{variant}.json'
    image_path = directory / f'{slug}-spritesheet-v15-{variant}.png'
    atlas = load(atlas_path)
    meta = atlas['meta']
    assert target == {'atlas': f'../{atlas_path.name}', 'image': f'../{image_path.name}'}, variant
    assert meta['slug'] == slug and meta['version'] == 15 and meta['variant'] == variant and meta['image'] == image_path.name
    assert meta['imageRevision'] == hashlib.sha256(image_path.read_bytes()).hexdigest()
    assert meta['frameSize'] == {'w': cell, 'h': cell}
    assert tuple(meta['directions']) == DIRECTIONS
    assert atlas['pivot'] == {'x': .5, 'y': .94}
    assert atlas['render']['lockBodyScale'] and not atlas['render']['frameBlend']
    assert atlas['render']['physicsOwnsJumpHeight']
    if slug == 'darya':
        assert meta['motionRevision'] == MOTION_REVISION
        assert atlas['render']['directionStepSeconds'] > 0
        assert atlas['motion']['locomotionProfile']['strideLengths'] == {'walk': 2.45, 'run': 3.85, 'sprint': 3.85}
    ratio = atlas['render']['referenceBodyHeightRatio']
    world_height = atlas['display']['worldHeight']
    with Image.open(image_path) as packed:
        image = packed.convert('RGBA')
    assert image.size == (meta['size']['w'], meta['size']['h'])
    assert meta['decodedBytes'] == image.width * image.height * 4 <= BUDGETS[variant] * 1024 ** 2
    measures, pixels = {}, {}
    for name, bounds in atlas['frames'].items():
        x, y, w, h = (bounds[key] for key in ('x', 'y', 'w', 'h'))
        assert w == h == cell and x % cell == y % cell == 0, (variant, name)
        rect = (x, y, x + w, y + h)
        if rect not in measures:
            measures[rect] = measure_frame(image, bounds, atlas['pivot']['y'], ratio, world_height)
            pixels[rect] = hashlib.sha256(image.crop(rect).tobytes()).hexdigest()
        assert not measures[rect]['touches_edge'], (variant, name)
    assert len(measures) == meta['packedPhysicalFrameCount']
    assert len(atlas['frames']) == meta['generatedFrameCount']

    def rect(name):
        x, y, w, h = (atlas['frames'][name][key] for key in ('x', 'y', 'w', 'h'))
        return (x, y, x + w, y + h)

    world, side = atlas['animations'], atlas['sideViewAnimations']
    assert all(name in atlas['frames'] for clip in [*world.values(), *side.values()] for name in names(clip))
    for state in DIRECTIONAL:
        clip = world[state]
        assert tuple(clip['framesByDirection']) == DIRECTIONS
        sequences = [clip['framesByDirection'][direction] for direction in DIRECTIONS]
        assert {len(chain) for chain in sequences} == {len(clip['frames'])}
        for i in range(len(clip['frames'])):
            assert len({pixels[rect(chain[i])] for chain in sequences}) == len(DIRECTIONS), (variant, state, i)
        for chain in sequences:
            measured = [measures[rect(name)] for name in chain]
            if state in GAITS:
                height = median(frame['height_cell_ratio'] for frame in measured) / ratio
                low, high = GAITS[state]
                if slug == 'darya' and state != 'idle':
                    high = 1.15
                assert low <= height <= high, (variant, state, height)
                assert max(abs(frame['ground_offset_cell']) for frame in measured) <= .055
            if state in ('walk', 'run', 'sprint'):
                distinct = len({pixels[rect(name)] for name in chain})
                if slug == 'darya':
                    spec = CONTACTS['walk' if state == 'walk' else 'run']
                    assert distinct == len(chain) == spec['count'], (variant, state, distinct)
                    assert clip['groundContact'] == spec and clip['contactFrames'] == [0, distinct // 2]
                    assert set(chain) <= atlas['render']['frameOffsetsY'].keys(), (variant, state)
                else:
                    assert distinct >= (6 if variant == 'lite' else 8)
                    for index in clip['contactFrames']:
                        assert abs(measured[index]['ground_offset_cell']) <= .025, (variant, state, index)
            if state == 'land':
                assert len(chain) / clip['fps'] == atlas['motion']['locomotionProfile']['landingSeconds']
                heights = [frame['height_cell_ratio'] / ratio for frame in measured]
                assert .72 <= heights[0] <= .90, (variant, state, heights)
                assert min(heights[1:]) >= .88 and min(heights[-2:]) >= .95, (variant, state, heights)

    for state in ('idle', 'walk', 'run', 'takeoff', 'jump', 'fall', 'land', 'slide'):
        assert set(side[state]['framesByDirection']) == {'e', 'w'}
        assert all(name.startswith('side_') for name in names(side[state]))
        assert side[state]['framesByDirection']['e'] != side[state]['framesByDirection']['w']
    slide = side['slide']
    assert set(names(slide)).isdisjoint(names(side['run']))
    assert max(measures[rect(name)]['height_cell_ratio'] / ratio * 58 for name in names(slide)) < 46
    assert world['stop']['loop'] is False and world['skid']['loop'] is False
    if slug == 'darya':
        for state, expected in [('walk', 12), ('run', 16), ('jump', 4), ('land', 4), ('slide', 6)]:
            for direction, frames in side[state]['framesByDirection'].items():
                assert len(frames) == expected
                assert len({pixels[rect(name)] for name in frames}) == expected, (variant, direction, state)
    return world, side, atlas.get('companion')


def validate_character(slug, entry):
    assert entry['pack_version'] == 15
    manifest = load(ROOT / entry['manifest'])
    assert manifest['character_key'] == slug and manifest['pack_version'] == 15
    source = ROOT / slug / 'source-v15'
    layout = load(source / 'layout.json')
    assert layout['character'] == slug and layout['version'] == 15
    assert hashlib.sha256((source / layout['source']).read_bytes()).hexdigest() == layout['source_sha256']
    assert len(layout['poses']) * len(layout['directions']) == 112
    if slug == 'darya':
        for key, filename in layout['motion_art'].items():
            assert hashlib.sha256((source / filename).read_bytes()).hexdigest() == layout['motion_art_sha256'][key]
    targets = manifest['runtime']['atlas_targets']
    assert targets.keys() == VARIANTS.keys()
    expected = None
    for variant, cell in (DARYA_VARIANTS if slug == 'darya' else VARIANTS).items():
        clips = validate(slug, variant, cell, targets[variant])
        if expected is None:
            expected = clips
        assert clips == expected, variant
    assert set(manifest['animations']) == expected[0].keys()
    if slug == 'darya':
        validate_pishi(ROOT / slug, expected[2])
    print(f'{slug} V15: six variants, eight distinct directional views, stable pivots, runner slide and decoded budgets verified.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--characters', nargs='+', choices=ACTIVE, default=ACTIVE)
    roster = {entry['slug']: entry for entry in load(ROOT / 'character-manifest-v4.json')['characters']}
    for slug in parser.parse_args().characters:
        validate_character(slug, roster[slug])


if __name__ == '__main__':
    main()
