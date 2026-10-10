"""Pack sparse V14 samples for gameplay; keep the complete authored sheets intact.

Every original frame name, animation duration, direction and foot pivot survives.
Consecutive interpolated names share a physical cell, avoiding 672 decoded cells.
Run/sprint remain at least 24 distinct poses per second in the lite pack.
"""
from collections import defaultdict
from copy import deepcopy
import json
import math
from pathlib import Path
from PIL import Image
from character_art_registry import ACTIVE_CHARACTER_ROSTER

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/assets/characters'
VARIANTS = {'runtime': (96, 3), 'lite': (64, 4)}


def build(slug, variant, cell, stride):
    directory = ASSETS / slug
    source_path = directory / f'{slug}-atlas-v14-mobile.json'
    source = json.loads(source_path.read_text())
    atlas = deepcopy(source)
    families = defaultdict(list)
    for name in source['frames']:
        families[name.rsplit('_', 1)[0]].append(name)
    aliases, selected = {}, []
    for family, names in families.items():
        step = 1 if family == 'turn' else 2 if family == 'idle' else stride
        indices = set(range(0, len(names), step)) | {len(names) - 1}
        # Preserve action phase endpoints, especially takeoff/jump/fall.
        for animation in source['animations'].values():
            sequences = [animation['frames'], *animation.get('framesByDirection', {}).values()]
            for sequence in sequences:
                for name in [sequence[0], sequence[-1]]:
                    if name in names:
                        indices.add(names.index(name))
        samples = sorted(indices)
        selected.extend(names[i] for i in samples)
        for i, name in enumerate(names):
            nearest = min(samples, key=lambda index: abs(index - i))
            aliases[name] = names[nearest]
    columns = 16
    rows = math.ceil(len(selected) / columns)
    sheet = Image.new('RGBA', (columns * cell, rows * cell))
    rectangles = {}
    with Image.open(directory / source['meta']['image']) as image:
        for i, name in enumerate(selected):
            frame = source['frames'][name]
            pose = image.crop((frame['x'], frame['y'], frame['x'] + frame['w'], frame['y'] + frame['h']))
            pose = pose.resize((cell, cell), Image.Resampling.LANCZOS)
            x, y = i % columns * cell, i // columns * cell
            sheet.paste(pose, (x, y))
            rectangles[name] = {'x': x, 'y': y, 'w': cell, 'h': cell}
    filename = f'{slug}-spritesheet-v14-{variant}.png'
    temporary = directory / f'.{filename}.tmp'
    sheet.save(temporary, format='PNG', optimize=True)
    temporary.replace(directory / filename)
    atlas['frames'] = {name: rectangles[target] for name, target in aliases.items()}
    atlas['meta'].update(variant=variant, image=filename, size={'w': sheet.width, 'h': sheet.height},
        frameSize={'w': cell, 'h': cell}, grid={'columns': columns, 'rows': rows},
        packedPhysicalFrameCount=len(selected), runtimeSamplingStride=stride,
        decodedBytes=sheet.width * sheet.height * 4,
        runtimeSource=source_path.name)
    atlas_path = directory / f'{slug}-atlas-v14-{variant}.json'
    temporary = atlas_path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(atlas, ensure_ascii=False, separators=(',', ':')) + '\n')
    temporary.replace(atlas_path)
    return {'slug': slug, 'variant': variant, 'physicalFrames': len(selected),
        'animationFrameNames': len(aliases), 'decodedBytes': sheet.width * sheet.height * 4,
        'downloadBytes': (directory / filename).stat().st_size,
        'sourceDecodedBytes': source['meta']['size']['w'] * source['meta']['size']['h'] * 4}


if __name__ == '__main__':
    reports = [build(slug, variant, *settings) for slug in ACTIVE_CHARACTER_ROSTER for variant, settings in VARIANTS.items()]
    output = ROOT / 'docs/release-v14-negar/runtime-packs.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(reports, ensure_ascii=False, indent=2) + '\n')
    for item in reports:
        print(f"{item['slug']}/{item['variant']}: {item['physicalFrames']} cells, {item['decodedBytes'] / 1048576:.2f} MiB decoded, {item['downloadBytes'] / 1048576:.2f} MiB transfer")
