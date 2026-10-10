#!/usr/bin/env python3
"""Validate the shipped runtime contract and alpha geometry without art-build dependencies."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SLUGS = ('darya', 'setayesh', 'uzudi', 'negar')
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
            grid = atlas['meta']['grid']
            assert image.mode == 'RGBA' and image.size == (grid['columns'] * cell, grid['rows'] * cell)
            if variant in ('runtime', 'lite'):
                assert atlas['meta']['decodedBytes'] == image.width * image.height * 4
                assert atlas['meta']['packedPhysicalFrameCount'] < 270
                assert atlas['animations'] == json.loads((directory / f'{slug}-atlas-v14-mobile.json').read_text())['animations']
            else:
                assert grid == {'columns': 24, 'rows': 28}
            assert max(image.size) <= 4096
            assert len(atlas['frames']) == atlas['meta']['generatedFrameCount'] == 672
            assert atlas['meta']['version'] == 14 and atlas['render']['dedicatedSlide']
            assert atlas['render']['lockBodyScale'] and not atlas['render']['frameBlend']
            assert atlas['pivot'] == {'x': .5, 'y': .94}
            for name, frame in atlas['frames'].items():
                x, y, w, h = [frame[k] for k in ('x', 'y', 'w', 'h')]
                assert w == h == cell and 0 <= x <= image.width - w and 0 <= y <= image.height - h
                alpha = image.crop((x, y, x + w, y + h)).getchannel('A')
                box = alpha.point(lambda v: 255 if v > 32 else 0).getbbox()
                assert box is not None, f'{slug}/{variant}: empty {name}'
                assert box[0] > 0 and box[1] > 0 and box[2] < cell and box[3] < cell, f'{slug}/{variant}: clipped {name}'
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
            if slug == 'uzudi': assert 'slide' in atlas['movement']['wingPoweredStates']
            if slug == 'negar':
                ability = atlas['abilities'][0]
                assert ability['id'] == 'smile-bloom' and ability['cooldown'] >= ability['duration']
                assert atlas['animations'][ability['animation']]['loop'] is False
                assert atlas['animations'][ability['animation']]['frames'] == atlas['animations']['celebrate']['frames']
            results.append({'character': slug, 'variant': variant, 'frames': 672, 'image': atlas['meta']['image'],
                'dimensions': list(image.size), 'decodedMiB': round(image.width * image.height * 4 / 2**20, 2),
                'maxSlideHeight': round(max(slide_heights), 2), 'geometry': 'passed'})
        assert (directory / f'{slug}-preview-v14.png').is_file()
    for slug in ('tiam', 'ronak'):
        assert not (base / slug).exists() and not (base / '_legacy_archive' / slug).exists()
    out = ROOT / 'docs/release-v14'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'asset-validation.json').write_text(json.dumps({'status': 'passed', 'variants': results}, indent=2) + '\n')
    print(f'V14 asset validation passed: {len(SLUGS)} characters / {len(results)} atlas variants; 672 animation frame names each (runtime cells share sampled poses).')


if __name__ == '__main__':
    main()
