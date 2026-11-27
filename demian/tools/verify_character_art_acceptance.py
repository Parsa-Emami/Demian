import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/assets/characters'
EVIDENCE = ROOT / 'docs/character-standards/production-art-acceptance.json'
VARIANTS = ('desktop', 'mobile', 'compact', 'runtime', 'lite', 'detail')
REQUIRED = {'anatomy', 'head_body', 'limbs', 'outline', 'pixel_quality',
            'identity', 'motion', 'crawl_dodge', 'desktop_mobile'}
STANDARDS = (
    'public/assets/characters/character-manifest-v4.json',
    'resources/game/character-visual-standard-v2.json',
    'resources/game/character-animation-standard-v2.json',
)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def files_for(slug, version):
    directory = ASSETS / slug
    source = directory / f'source-v{version}'
    if not source.is_dir():
        raise SystemExit(f'PRODUCTION BLOCKED: missing authored source: {slug}')
    paths = [*sorted(path for path in source.rglob('*') if path.is_file()),
             directory / f'{slug}-preview-v{version}.png',
             directory / 'manifests' / f'{slug}_identity_contract.json']
    for variant in VARIANTS:
        paths.extend([directory / f'{slug}-atlas-v{version}-{variant}.json',
                      directory / f'{slug}-spritesheet-v{version}-{variant}.png'])
    return {str(path.relative_to(ROOT)): sha(path) for path in paths}

def main():
    roster = json.loads((ASSETS/'character-manifest-v4.json').read_text())['characters']
    evidence = json.loads(EVIDENCE.read_text())
    if evidence.get('schema') != 1 or evidence.get('status') != 'approved':
        raise SystemExit('PRODUCTION BLOCKED: complete V2 authored artwork review first.')
    if evidence.get('standards_sha256') != {path: sha(ROOT / path) for path in STANDARDS}:
        raise SystemExit('PRODUCTION BLOCKED: the roster or art standards changed after review.')
    records = evidence.get('characters',{})
    slugs = {c['slug'] for c in roster}
    if set(records) != slugs:
        raise SystemExit('PRODUCTION BLOCKED: art approval must cover exactly the current roster.')
    for character in roster:
        slug, version = character['slug'], character['pack_version']
        r = records[slug]
        if not r.get('reviewer') or not r.get('reviewed_at') or set(r.get('checks',{})) != REQUIRED or not all(v is True for v in r['checks'].values()):
            raise SystemExit(f'PRODUCTION BLOCKED: incomplete art review: {slug}')
        if r.get('sha256') != files_for(slug, version):
            raise SystemExit(f'PRODUCTION BLOCKED: art changed since acceptance: {slug}')
        proof = r.get('evidence',{})
        if not proof:
            raise SystemExit(f'PRODUCTION BLOCKED: missing visual evidence: {slug}')
        for relative, digest in proof.items():
            path = (ROOT/relative).resolve()
            if not path.is_relative_to(ROOT/'docs') or not path.is_file() or sha(path) != digest:
                raise SystemExit(f'PRODUCTION BLOCKED: invalid review evidence: {slug}')
    print(f'Art acceptance verified against {len(slugs)} current characters.')

if __name__ == '__main__':
    main()
