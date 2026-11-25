#!/usr/bin/env python3
"""Validate the shipped runtime contract and alpha geometry without art-build dependencies."""
import json
import hashlib
from statistics import median
from pathlib import Path
from PIL import Image
from character_art_registry import ACTIVE_CHARACTER_ROSTER, ACTIVE_CHARACTER_DEFINITIONS

ROOT = Path(__file__).resolve().parents[1]
SLUGS = ACTIVE_CHARACTER_ROSTER
VARIANTS = {'desktop': 144, 'mobile': 112, 'compact': 80, 'runtime': 96, 'lite': 64, 'detail': 128}



def face_width(image):
    box = image.getchannel('A').point(lambda value: 255 if value > 32 else 0).getbbox()
    pose = image.crop(box).convert('RGBA')
    points = set()
    pixels = pose.load()
    for y in range(round(pose.height * .55)):
        for x in range(pose.width):
            r, g, b, a = pixels[x, y]
            if a > 160 and r > 155 and g > 80 and b < 195 and r > g * 1.1 and g > b * 1.03:
                points.add((x, y))
    largest = []
    while points:
        start = points.pop(); stack = [start]; component = [start]
        while stack:
            x, y = stack.pop()
            for point in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                if point in points:
                    points.remove(point); stack.append(point); component.append(point)
        if len(component) > len(largest): largest = component
    assert largest, 'Character face must be measurable'
    return max(x for x, _ in largest) - min(x for x, _ in largest) + 1


def main():
    base = ROOT / 'public/assets/characters'
    roster = json.loads((base / 'character-manifest-v4.json').read_text())
    assert [c['slug'] for c in roster['characters']] == list(SLUGS)
    assert all(c['pack_version'] == 14 and c['has_shipped_assets'] for c in roster['characters'])
    results = []
    for character in roster['characters']:
        slug = character['slug']
        directory = base / slug
        manifest_path = directory / 'manifests/character_manifest_v4.json'
        assert base / character['manifest'] == manifest_path, f'{slug}: incorrect roster manifest path'
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        assert manifest.get('character_key') == slug, f'{slug}: incorrect manifest character_key'
        targets = manifest.get('runtime', {}).get('atlas_targets')
        assert isinstance(targets, dict), f'{slug}: missing runtime.atlas_targets'
        missing = VARIANTS.keys() - targets.keys()
        unexpected = targets.keys() - VARIANTS.keys()
        assert not (missing or unexpected), (
            f'{slug}: atlas targets missing={sorted(missing)}, unexpected={sorted(unexpected)}'
        )
        source_layout = json.loads((directory / 'source-v14/layout.json').read_text())
        authored_turns = 'idleLoopDirections' in source_layout
        animation_manifest = json.loads((directory / f'manifests/{slug}_animation_manifest.json').read_text())
        for variant, cell in VARIANTS.items():
            atlas_path = directory / f'{slug}-atlas-v14-{variant}.json'
            image_path = directory / f'{slug}-spritesheet-v14-{variant}.png'
            target = targets[variant]
            assert isinstance(target, dict), f'{slug}/{variant}: invalid atlas target'
            assert target.get('atlas') == f'../{atlas_path.name}', f'{slug}/{variant}: incorrect manifest atlas path'
            assert target.get('image') == f'../{image_path.name}', f'{slug}/{variant}: incorrect manifest image path'
            atlas = json.loads(atlas_path.read_text())
            assert atlas['meta']['image'] == image_path.name, f'{slug}/{variant}: atlas image differs from manifest'
            with Image.open(image_path) as packed:
                if source_layout.get('indexedPalette'):
                    assert packed.mode == 'P' and 'transparency' in packed.info
                else:
                    assert packed.mode == 'RGBA'
                image = packed.convert('RGBA')
            assert atlas['meta']['imageRevision'] == hashlib.sha256(image_path.read_bytes()).hexdigest()
            grid = atlas['meta']['grid']
            assert image.mode == 'RGBA' and image.size == (grid['columns'] * cell, grid['rows'] * cell)
            if variant in ('runtime', 'lite', 'detail'):
                assert atlas['meta']['decodedBytes'] == image.width * image.height * 4
                assert atlas['meta']['packedPhysicalFrameCount'] <= {'runtime': 320, 'lite': 256, 'detail': 544}[variant]
                assert atlas['meta']['decodedBytes'] <= {'runtime': 12, 'lite': 4, 'detail': 34}[variant] * 1024**2
                assert atlas['animations'] == json.loads((directory / f'{slug}-atlas-v14-mobile.json').read_text())['animations']
            else:
                assert grid == {'columns': 24, 'rows': 28}
            assert max(image.size) <= 4096
            assert len(atlas['frames']) == atlas['meta']['generatedFrameCount'] == 672
            assert atlas['meta']['version'] == 14 and atlas['render']['dedicatedSlide']
            assert atlas['motion']['timingVersion'] == 'natural-locomotion-v2'
            assert atlas['motion']['locomotionProfile']['phaseDriver'] == 'travelled-distance'
            assert atlas['render']['lockBodyScale'] and not atlas['render']['frameBlend']
            assert atlas['pivot'] == {'x': .5, 'y': .94}
            visible_heights = {}
            for name, frame in atlas['frames'].items():
                x, y, w, h = [frame[k] for k in ('x', 'y', 'w', 'h')]
                assert w == h == cell and 0 <= x <= image.width - w and 0 <= y <= image.height - h
                alpha = image.crop((x, y, x + w, y + h)).getchannel('A')
                box = alpha.point(lambda v: 255 if v > 32 else 0).getbbox()
                assert box is not None, f'{slug}/{variant}: empty {name}'
                assert box[0] > 0 and box[1] > 0 and box[2] < cell and box[3] < cell, f'{slug}/{variant}: clipped {name}'
                visible_heights[name] = (box[3] - box[1]) / cell
            # Validate visible artwork, rather than trusting the square texture
            # cell or display.worldHeight: the latter stayed unchanged when
            # Ainaz's original walk/run silhouettes shrank to 60% of standing.
            canonical_ratio = atlas['render']['referenceBodyHeightRatio']
            calibrated = atlas['render'].get('bodyScaleCalibration', {}).get('referencePoseIndices', {})
            gait_heights = {}
            for state in ('idle', 'walk', 'run', 'sprint'):
                height_ratio = median(visible_heights[name] for name in atlas['animations'][state]['frames']) / canonical_ratio
                family = 'run' if state == 'sprint' else state
                low, high = (.96, 1.05) if family in calibrated else (.84, 1.16)
                assert low <= height_ratio <= high, f'{slug}/{variant}: {state} visible body scale {height_ratio:.3f} is outside {low}..{high}'
                gait_heights[state] = round(height_ratio * 3.75, 3)
            if authored_turns or slug in ('arsal', 'iman', 'amin', 'hossein'):
                recovery_ratio = visible_heights['jump_e_047'] / canonical_ratio
                airborne_ratio = median(visible_heights[name] for name in atlas['animations']['jump']['frames']) / canonical_ratio
                assert .96 <= recovery_ratio <= 1.05, f'{slug}/{variant}: jump recovery changes the canonical body size'
                if authored_turns or source_layout.get('locomotionSource'):
                    if not authored_turns or variant == 'desktop':
                        widths = {}
                        for state in ('walk', 'jump'):
                            measurements = []
                            for frame_name in atlas['animations'][state]['frames']:
                                f = atlas['frames'][frame_name]
                                measurements.append(face_width(image.crop((f['x'], f['y'], f['x']+cell, f['y']+cell))))
                            widths[state] = median(measurements)
                        assert .80 <= widths['jump'] / widths['walk'] <= 1.20, f'{slug}/{variant}: jump changes head volume'
                    assert .65 <= airborne_ratio <= 1.05, f'{slug}/{variant}: jump tuck is outside the authored range'
                else:
                    assert .85 <= airborne_ratio <= 1.05, f'{slug}/{variant}: airborne body shrinks below the shared size'
                assert atlas['render']['bodyScaleCalibration']['referencePoseIndices']['jump'] == [7]
            if authored_turns and variant == 'mobile':
                views = set()
                for direction in atlas['meta']['directions']:
                    frame_id = atlas['animations']['idle']['framesByDirection'][direction][0]
                    x, y, w, h = (atlas['frames'][frame_id][key] for key in ('x', 'y', 'w', 'h'))
                    views.add(image.crop((x, y, x + w, y + h)).getchannel('A').tobytes())
                assert len(views) == len(atlas['meta']['directions']), f'{slug}: direction art repeats'
            for name, animation in atlas['animations'].items():
                assert name not in ('attack', 'guitar', 'dance', 'spin', 'taunt', 'sleep')
                assert animation_manifest['states'][name]['frames'] == len(animation['frames'])
                for frames in [animation['frames'], animation.get('framesLeft', []), animation.get('framesRight', []),
                    *animation.get('framesByDirection', {}).values()]:
                    assert all(frame in atlas['frames'] for frame in frames)
            assert len(atlas['animations']['run']['frames']) == 80
            assert len(atlas['animations']['walk']['frames']) == 64
            slide = atlas['animations']['slide']; assert len(slide['frames']) == 64 and slide['loop']
            assert not set(slide['frames']).intersection(atlas['animations']['run']['frames'])
            slide_heights = []
            for name in slide['frames']:
                f = atlas['frames'][name]
                alpha = image.crop((f['x'], f['y'], f['x'] + cell, f['y'] + cell)).getchannel('A')
                box = alpha.point(lambda v: 255 if v > 32 else 0).getbbox()
                slide_heights.append((box[3] - box[1]) / cell / atlas['render']['referenceBodyHeightRatio'] * 58)
            assert max(slide_heights) < 46, f'{slug}: slide visually reaches the bird at {max(slide_heights):.2f}px'
            if slug == 'darya': assert atlas['companion']['bakedIntoEveryFrame']
            if slug == 'tiam':
                assert atlas['companion']['id'] == 'homayoun'
                assert atlas['companion']['anchor'] == 'shoulder'
                assert atlas['companion']['bakedIntoEveryFrame'] and atlas['companion']['collisionIndependent']
            expected_style = ACTIVE_CHARACTER_DEFINITIONS[slug]['locomotion_style']
            assert atlas['movement']['style'] == expected_style
            if expected_style == 'wing-assisted':
                assert atlas['movement']['wingPoweredStates'] == ['run', 'sprint', 'takeoff', 'jump', 'fall', 'slide']
                assert all(atlas['animations'][state]['locomotionStyle'] == expected_style
                    for state in atlas['movement']['wingPoweredStates'])
            if ability := source_layout.get('signatureAbility'):
                assert atlas['abilities'] == [ability] and ability['cooldown'] >= ability['duration']
                assert atlas['animations'][ability['animation']]['loop'] is False
                assert atlas['animations'][ability['animation']]['frames'] == atlas['animations']['celebrate']['frames']
            if slug == 'dandelox':
                companion = atlas['companion']
                assert companion['id'] == 'black-cat' and companion['anchor'] == 'ground'
                assert companion['bakedIntoEveryFrame'] and companion['collisionIndependent']
            results.append({'character': slug, 'variant': variant, 'frames': 672, 'image': atlas['meta']['image'],
                'dimensions': list(image.size), 'decodedMiB': round(image.width * image.height * 4 / 2**20, 2),
                'maxSlideHeight': round(max(slide_heights), 2), 'visibleWorldHeights': gait_heights, 'geometry': 'passed'})
        assert (directory / f'{slug}-preview-v14.png').is_file()
    for slug in ('ronak',):
        assert not (base / slug).exists() and not (base / '_legacy_archive' / slug).exists()
    out = ROOT / 'docs/release-v14'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'asset-validation.json').write_text(json.dumps({'status': 'passed', 'variants': results}, indent=2) + '\n')
    print(f'V14 asset validation passed: {len(SLUGS)} characters / {len(results)} manifest atlas/image pairs; 672 animation frame names each (runtime cells share sampled poses).')


if __name__ == '__main__':
    main()
