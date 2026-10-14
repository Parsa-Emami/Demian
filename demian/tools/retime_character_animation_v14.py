"""Update existing V14 motion metadata without regenerating sprite artwork."""
import json
import hashlib
from pathlib import Path
from character_art_registry import ACTIVE_CHARACTER_ROSTER
from character_animation_timing import apply_animation_timing

ROOT = Path(__file__).resolve().parents[1]
VARIANTS = ('desktop', 'mobile', 'compact', 'runtime', 'lite')


def write(path, data, compact=False):
    formatting = {'separators': (',', ':')} if compact else {'indent': 2}
    path.write_text(json.dumps(data, ensure_ascii=False, **formatting) + '\n', encoding='utf-8')


def main():
    for slug in ACTIVE_CHARACTER_ROSTER:
        directory = ROOT / 'public/assets/characters' / slug
        layout = json.loads((directory / 'source-v14/layout.json').read_text())
        counts = layout.get('locomotionCycleCounts', {})
        for variant in VARIANTS:
            path = directory / f'{slug}-atlas-v14-{variant}.json'
            atlas = apply_animation_timing(json.loads(path.read_text()), counts, layout.get('locomotionProfile'))
            atlas['meta']['imageRevision'] = hashlib.sha256((directory / atlas['meta']['image']).read_bytes()).hexdigest()
            write(path, atlas, compact=variant in ('runtime', 'lite'))
        path = directory / 'manifests' / f'{slug}_animation_manifest.json'
        manifest = json.loads(path.read_text())
        manifest['states'] = {name: {'frames': len(a['frames']), 'fps': a['fps'], 'loop': a['loop'],
                                    **({'cycleCount': a['cycleCount']} if 'cycleCount' in a else {})}
                              for name, a in atlas['animations'].items()}
        manifest['timingVersion'] = atlas['motion']['timingVersion']
        write(path, manifest)
        path = directory / 'manifests' / f'{slug}_motion_profile.json'
        profile = json.loads(path.read_text())
        profile['locomotion_profile'] = atlas['motion']['locomotionProfile']
        write(path, profile)
        print(f'{slug}: {len(VARIANTS)} atlas variants retimed')


if __name__ == '__main__':
    main()
