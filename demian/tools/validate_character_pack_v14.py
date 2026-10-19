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
VARIANTS = {'desktop': 144, 'mobile': 112, 'compact': 80, 'runtime': 96, 'lite': 64}


def main():
    base = ROOT / 'public/assets/characters'
    roster = json.loads((base / 'character-manifest-v4.json').read_text())
    assert [c['slug'] for c in roster['characters']] == list(SLUGS)
    assert all(c['pack_version'] == 14 and c['has_shipped_assets'] for c in roster['characters'])
    results = []
    for slug in SLUGS:
        directory = base / slug
        animation_manifest = json.loads((directory / f'manifests/{slug}_animation_manifest.json').read_text())
        for variant, cell in VARIANTS.items():
            atlas = json.loads((directory / f'{slug}-atlas-v14-{variant}.json').read_text())
            image = Image.open(directory / atlas['meta']['image'])
            assert atlas['meta']['imageRevision'] == hashlib.sha256((directory / atlas['meta']['image']).read_bytes()).hexdigest()
            grid = atlas['meta']['grid']
            assert image.mode == 'RGBA' and image.size == (grid['columns'] * cell, grid['rows'] * cell)
            if variant in ('runtime', 'lite'):
                assert atlas['meta']['decodedBytes'] == image.width * image.height * 4
                assert atlas['meta']['packedPhysicalFrameCount'] <= (320 if variant == 'runtime' else 256)
                assert atlas['meta']['decodedBytes'] <= (12 if variant == 'runtime' else 4) * 1024**2
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
            if slug == 'negar':
                ability = atlas['abilities'][0]
                assert ability['id'] == 'smile-bloom' and ability['cooldown'] >= ability['duration']
                assert atlas['animations'][ability['animation']]['loop'] is False
                assert atlas['animations'][ability['animation']]['frames'] == atlas['animations']['celebrate']['frames']
            results.append({'character': slug, 'variant': variant, 'frames': 672, 'image': atlas['meta']['image'],
                'dimensions': list(image.size), 'decodedMiB': round(image.width * image.height * 4 / 2**20, 2),
                'maxSlideHeight': round(max(slide_heights), 2), 'visibleWorldHeights': gait_heights, 'geometry': 'passed'})
        assert (directory / f'{slug}-preview-v14.png').is_file()
    for slug in ('ronak',):
        assert not (base / slug).exists() and not (base / '_legacy_archive' / slug).exists()
    out = ROOT / 'docs/release-v14'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'asset-validation.json').write_text(json.dumps({'status': 'passed', 'variants': results}, indent=2) + '\n')
    print(f'V14 asset validation passed: {len(SLUGS)} characters / {len(results)} atlas variants; 672 animation frame names each (runtime cells share sampled poses).')


if __name__ == '__main__':
    main()
