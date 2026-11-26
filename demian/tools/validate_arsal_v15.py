import hashlib
import json
from pathlib import Path
from statistics import median

from PIL import Image

from audit_dcs_v15_scale_directions import measure_frame
from validate_character_pack_v14 import VARIANTS

ROOT = Path(__file__).resolve().parents[1] / 'public/assets/characters'
ARSAL = ROOT / 'arsal'
DIRECTIONS = ('s', 'sw', 'w', 'nw', 'n', 'ne', 'e', 'se')
BUDGETS = {'lite': 4, 'runtime': 12, 'detail': 34, 'compact': 12, 'mobile': 24, 'desktop': 34}
GAITS = {'idle': (.95, 1.05), 'walk': (.88, 1.05), 'run': (.82, 1.05), 'sprint': (.82, 1.05)}
DIRECTIONAL = ('idle', 'walk', 'run', 'sprint', 'start', 'stop', 'turn',
               'takeoff', 'jump', 'fall', 'land', 'crouch', 'wave')


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def names(clip):
    return [*clip['frames'], *(name for direction in clip.get('framesByDirection', {}).values() for name in direction)]


def validate(variant, cell, target):
    atlas_path = ARSAL / f'arsal-atlas-v15-{variant}.json'
    image_path = ARSAL / f'arsal-spritesheet-v15-{variant}.png'
    atlas = load(atlas_path)
    meta = atlas['meta']
    assert target == {'atlas': f'../{atlas_path.name}', 'image': f'../{image_path.name}'}, variant
    assert meta['version'] == 15 and meta['variant'] == variant and meta['image'] == image_path.name
    assert meta['imageRevision'] == hashlib.sha256(image_path.read_bytes()).hexdigest()
    assert meta['frameSize'] == {'w': cell, 'h': cell}
    assert tuple(meta['directions']) == DIRECTIONS
    assert atlas['pivot'] == {'x': .5, 'y': .94}
    assert atlas['render']['lockBodyScale'] and not atlas['render']['frameBlend']
    assert atlas['render']['physicsOwnsJumpHeight']
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
                assert low <= height <= high, (variant, state, height)
                assert max(abs(frame['ground_offset_cell']) for frame in measured) <= .055
            if state in ('walk', 'run', 'sprint'):
                assert len({pixels[rect(name)] for name in chain}) >= (6 if variant == 'lite' else 8)
                for index in clip['contactFrames']:
                    assert abs(measured[index]['ground_offset_cell']) <= .025, (variant, state, index)

    for state in ('idle', 'walk', 'run', 'takeoff', 'jump', 'fall', 'land', 'slide'):
        assert set(side[state]['framesByDirection']) == {'e', 'w'}
        assert all(name.startswith('side_') for name in names(side[state]))
        assert side[state]['framesByDirection']['e'] != side[state]['framesByDirection']['w']
    slide = side['slide']
    assert set(names(slide)).isdisjoint(names(side['run']))
    assert max(measures[rect(name)]['height_cell_ratio'] / ratio * 58 for name in names(slide)) < 46
    assert world['stop']['loop'] is False and world['skid']['loop'] is False
    return world, side


def main():
    roster = load(ROOT / 'character-manifest-v4.json')
    entry = next(item for item in roster['characters'] if item['slug'] == 'arsal')
    assert entry['pack_version'] == 15
    manifest = load(ROOT / entry['manifest'])
    assert manifest['pack_version'] == 15
    layout = load(ARSAL / 'source-v15/layout.json')
    assert hashlib.sha256((ARSAL / 'source-v15' / layout['source']).read_bytes()).hexdigest() == layout['source_sha256']
    assert len(layout['poses']) * len(layout['directions']) == 112
    targets = manifest['runtime']['atlas_targets']
    assert targets.keys() == VARIANTS.keys()
    expected_world, expected_side = None, None
    for variant, cell in VARIANTS.items():
        world, side = validate(variant, cell, targets[variant])
        if expected_world is None:
            expected_world, expected_side = world, side
        assert world == expected_world and side == expected_side, variant
    assert set(manifest['animations']) == expected_world.keys()
    print('Arsal V15: six variants, eight distinct directional views, stable pivots, runner slide and decoded budgets verified.')


if __name__ == '__main__':
    main()
