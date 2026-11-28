import argparse
import hashlib
import json
from pathlib import Path
from statistics import median

from PIL import Image

from audit_dcs_v15_scale_directions import measure_frame
from character_art_registry import ACTIVE_CHARACTER_DEFINITIONS
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
        assert 'companion' not in atlas and 'companion' not in atlas['animations']
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
            if state == 'land':
                assert len(chain) / clip['fps'] == atlas['motion']['locomotionProfile']['landingSeconds']
                heights = [frame['height_cell_ratio'] / ratio for frame in measured]
                assert .72 <= heights[0] <= .90, (variant, state, heights)
                assert min(heights[1:]) >= .88 and min(heights[-2:]) >= .95, (variant, state, heights)

    for state in ('idle', 'walk', 'run', 'takeoff', 'jump', 'fall', 'land', 'slide'):
        assert set(side[state]['framesByDirection']) == {'e', 'w'}
        assert all(name.startswith('side_') for name in names(side[state]))
        assert side[state]['framesByDirection']['e'] != side[state]['framesByDirection']['w']
    if slug == 'darya':
        reference = load(ROOT / 'arsal' / f'arsal-atlas-v15-{variant}.json')['sideViewAnimations']
        for state in ('run', 'sprint'):
            clip = side[state]
            for key in ('fps', 'loop', 'cycleCount'):
                assert clip[key] == reference[state][key], (variant, state, key)
            for direction, sequence in clip['framesByDirection'].items():
                assert len(sequence) == len(reference[state]['framesByDirection'][direction])
                cycle = len(sequence) // clip['cycleCount']
                first = [rect(name) for name in sequence[:cycle]]
                assert len(set(first)) == cycle
                assert [rect(name) for name in sequence] == first * clip['cycleCount']
        reference_atlas = load(ROOT / 'arsal' / f'arsal-atlas-v15-{variant}.json')
        with Image.open(ROOT / 'arsal' / reference_atlas['meta']['image']) as reference_image:
            reference_idle = reference_atlas['animations']['idle']['framesByDirection']
            for direction, sequence in world['idle']['framesByDirection'].items():
                theirs = measure_frame(reference_image, reference_atlas['frames'][reference_idle[direction][0]],
                                       atlas['pivot']['y'], ratio, world_height)
                ours = measures[rect(sequence[0])]
                assert abs(ours['silhouette_height_px'] - theirs['silhouette_height_px']) <= 2, (variant, direction)
            reference_side_heights = [
                measure_frame(reference_image, reference_atlas['frames'][frame], atlas['pivot']['y'], ratio, world_height)
                ['silhouette_height_px'] for frame in reference['idle']['frames']
            ]
        side_heights = [measures[rect(frame)]['silhouette_height_px'] for frame in side['idle']['frames']]
        assert abs(median(side_heights) - median(reference_side_heights)) <= 2, variant
    slide = side['slide']
    assert set(names(slide)).isdisjoint(names(side['run']))
    assert max(measures[rect(name)]['height_cell_ratio'] / ratio * 58 for name in names(slide)) < 46
    assert world['stop']['loop'] is False and world['skid']['loop'] is False
    return world, side


def validate_character(slug, entry):
    assert entry['pack_version'] == 15
    manifest = load(ROOT / entry['manifest'])
    assert manifest['character_key'] == slug and manifest['pack_version'] == 15
    source = ROOT / slug / 'source-v15'
    layout = load(source / 'layout.json')
    assert layout['character'] == slug and layout['version'] == 15
    assert hashlib.sha256((source / layout['source']).read_bytes()).hexdigest() == layout['source_sha256']
    assert len(layout['poses']) * len(layout['directions']) == 112
    targets = manifest['runtime']['atlas_targets']
    assert targets.keys() == VARIANTS.keys()
    expected_world, expected_side = None, None
    for variant, cell in VARIANTS.items():
        world, side = validate(slug, variant, cell, targets[variant])
        if expected_world is None:
            expected_world, expected_side = world, side
        assert world == expected_world and side == expected_side, variant
    assert set(manifest['animations']) == expected_world.keys()
    print(f'{slug} V15: six variants, eight distinct directional views, stable pivots, runner slide and decoded budgets verified.')


def validate_pishi():
    directory = ROOT.parent / 'companions/pishi'
    atlas = load(directory / 'atlas.json')
    image_path = directory / atlas['meta']['image']
    assert atlas['meta']['imageRevision'] == hashlib.sha256(image_path.read_bytes()).hexdigest()
    assert set(atlas['animations']) == {'idle', 'walk', 'run'}
    assert all(tuple(clip['framesByDirection']) == DIRECTIONS for clip in atlas['animations'].values())
    assert set(atlas['frames']) == {frame for clip in atlas['animations'].values() for frame in names(clip)}
    with Image.open(image_path) as image:
        assert image.width * image.height * 4 <= 2 * 1024 ** 2
        for frame in atlas['frames'].values():
            metrics = measure_frame(image, frame, atlas['pivot']['y'], .8, 1.3)
            assert not metrics['touches_edge'] and abs(metrics['ground_offset_cell']) < .1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--characters', nargs='+', choices=ACTIVE, default=ACTIVE)
    roster = {entry['slug']: entry for entry in load(ROOT / 'character-manifest-v4.json')['characters']}
    args = parser.parse_args()
    for slug in args.characters:
        validate_character(slug, roster[slug])
    if 'darya' in args.characters:
        validate_pishi()


if __name__ == '__main__':
    main()
