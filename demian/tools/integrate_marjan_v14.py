from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
SLUG = 'marjan'
LABEL = 'MARJAN / مرجان'
EXPECTED = 'dc1d7eab84f02572a76c7c69a98e86e3f6d68f57dbf018472563bd1d4d2ea649'
FILES = ('layout.json', 'master.png', 'reference.jpg', 'runner-motion.png', 'slides.png')


def run(*args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, check=True)


def read(path):
    return path.read_text(encoding='utf-8')


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def replace_once(value, old, new):
    if value.count(old) != 1:
        raise ValueError(f'Expected one occurrence of {old!r}; inspect the changed roster manually')
    return value.replace(old, new, 1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source_zip', type=Path)
    args = parser.parse_args()
    archive = args.source_zip.resolve()
    if hashlib.sha256(archive.read_bytes()).hexdigest() != EXPECTED:
        raise ValueError('Unexpected source ZIP SHA-256')
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=REPO, text=True).strip():
        raise ValueError('Run from a clean checkout on a dedicated integration branch')
    character = ROOT / 'public/assets/characters/marjan'
    if character.exists():
        raise ValueError('Marjan directory already exists; inspect before proceeding')
    motion_path = ROOT / 'resources/game/character-motion.json'
    motion = json.loads(read(motion_path))
    slugs = [item['slug'] for item in motion['characters']]
    if len(slugs) != 21 or SLUG in slugs or len(set(slugs)) != len(slugs):
        raise ValueError('Roster changed from the reviewed 21-character baseline')
    index = slugs.index('elaheh') + 1
    motion['characters'].insert(index, dict(slug=SLUG, displayName=LABEL, family='female-base-v1',
        packVersion=14, defaultActive=False, skin=SLUG, accessories=[],
        identityContract='assets/characters/marjan/manifests/marjan_identity_contract.json'))
    writes = {motion_path: dump(motion)}
    for name in ('config/demian-arcade.php', 'tests/js/CharacterCoreV4.test.js',
        'tests/js/CharacterVisualContract.test.js', 'tests/js/arcade/ArcadeRegistration.test.js'):
        path = ROOT / name
        writes[path] = replace_once(read(path), "'elaheh', 'tiam'", "'elaheh', 'marjan', 'tiam'")
    path = ROOT / 'tests/Feature/CharacterManagerTest.php'
    content = replace_once(read(path), "            ['elaheh', 'ELAHEH / الهه'],",
        "            ['elaheh', 'ELAHEH / الهه'],\n            ['marjan', 'MARJAN / مرجان'],")
    writes[path] = replace_once(content, "'elaheh' => 14, 'tiam' => 14", "'elaheh' => 14, 'marjan' => 14, 'tiam' => 14")
    path = ROOT / 'tests/js/MasterMotion.test.js'
    content = replace_once(read(path), "entry.family === 'female-base-v1').length, 10)", "entry.family === 'female-base-v1').length, 11)")
    writes[path] = replace_once(content, "    assert.equal(motionCharacter('elaheh').family, motionCharacter('darya').family);",
        "    assert.equal(motionCharacter('elaheh').family, motionCharacter('darya').family);\n    assert.equal(motionCharacter('marjan').family, motionCharacter('darya').family);")
    path = ROOT / 'tests/js/Phase0ReleaseGate.test.js'
    writes[path] = replace_once(read(path), 'BUILTIN_CHARACTER_SLUGS.length, 21,', 'BUILTIN_CHARACTER_SLUGS.length, 22,')
    path = ROOT / 'tests/js/Phase6Step31CharacterMenu.test.js'
    writes[path] = replace_once(read(path), "'mobina', 'elaheh', 'taher-db'", "'mobina', 'elaheh', 'marjan', 'taher-db'")
    path = REPO / 'README.fa.md'
    writes[path] = replace_once(read(path), 'فهرست ۲۰ کاراکتر', 'فهرست ۲۲ کاراکتر')
    path = ROOT / 'README.md'
    writes[path] = replace_once(read(path), '20-character manifest', '22-character manifest')
    with zipfile.ZipFile(archive) as z:
        expected_paths = {'source-v14/' + name for name in FILES}
        if set(z.namelist()) != expected_paths or len(z.namelist()) != len(expected_paths):
            raise ValueError('Unexpected archive members')
        sources = {name: z.read('source-v14/' + name) for name in FILES}
    destination = character / 'source-v14'
    destination.mkdir(parents=True)
    for name, data in sources.items():
        (destination / name).write_bytes(data)
    (character / 'marjan-character.json').write_text(dump({'name': LABEL}), encoding='utf-8')
    for path, content in writes.items():
        path.write_text(content, encoding='utf-8')
    import sys
    run(sys.executable, 'tools/build_character_pack_v14.py', '--characters', SLUG)
    run(sys.executable, 'tools/build_runtime_character_packs.py', '--characters', SLUG,
        '--report', 'docs/release-v14-marjan/runtime-packs.json')
    run('node', 'tools/compile_master_motion.mjs')
    run(sys.executable, 'tools/validate_character_pack_v14.py')
    run('npm', 'run', 'validate:motion')
    run('npm', 'run', 'test:ci')
    run('npm', 'run', 'build:static')
    run('npm', 'run', 'validate:static-assets')
    run('node', 'tools/export_static.mjs', '--out=../playable')
    print('Automated gates passed; inspect art, run browser and physical-device QA, then commit reviewed changes.')


if __name__ == '__main__':
    main()
