import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const project = resolve(import.meta.dirname, '../..');
const python = process.env.DEMIAN_PYTHON_BIN || 'python3';

test('Step 18: production WebP transcode is lossless, atomic for a release and actually reduces bytes', t => {
    const available = spawnSync(python, ['-c', 'import PIL; print(PIL.__version__)'],
        { encoding: 'utf8' });
    if (available.error || available.status !== 0) {
        // Production GitHub Actions installs Pillow explicitly. Local JS
        // contributors without Python can still run the other JS tests.
        t.skip('Pillow is not installed in this local JS test environment');
        return;
    }
    const root = mkdtempSync(join(tmpdir(), 'demian-step18-'));
    try {
        const slug = 'darya';
        const dir = join(root, 'assets', 'characters', slug);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(root, 'characters.json'),
            JSON.stringify({ data: [{ slug }] }));
        mkdirSync(join(dir, 'manifests'), { recursive: true });
        writeFileSync(join(dir, 'manifests', 'character_manifest_v4.json'),
            JSON.stringify({ character_key: slug, runtime: { atlas_targets: {
                runtime: { image: '../darya-spritesheet-v14-runtime.png' },
                detail: { image: '../darya-spritesheet-v14-detail.png' },
            } } }));
        for (const variant of ['runtime', 'detail']) {
            const prefix = slug + '-spritesheet-v14-' + variant;
            const png = join(dir, prefix + '.png');
            // An RGBA image with complex transparency and stable visible RGB
            // exercises exact=True: do not assume a lossy WebP visual match.
            const create = spawnSync(python, ['-c',
                "from PIL import Image; import sys; img=Image.new('RGBA',(256,256),(20,120,220,128)); img.save(sys.argv[1])", png,
            ], { encoding: 'utf8' });
            assert.equal(create.status, 0, create.stderr);
            writeFileSync(join(dir, slug + '-atlas-v14-' + variant + '.json'),
                JSON.stringify({ meta: { image: prefix + '.png',
                    size: { w: 256, h: 256 },
                    imageRevision: '0'.repeat(64) },
                    frames: { idle: { frame: { x: 0, y: 0, w: 16, h: 16 } } } }));
        }
        const run = spawnSync(python, ['tools/optimize_sprite_release.py',
            '--release', root], { cwd: project, encoding: 'utf8', timeout: 30000 });
        assert.equal(run.status, 0, run.stderr);
        const report = JSON.parse(readFileSync(join(root,
            'sprite-optimization-report.json'), 'utf8'));
        assert.equal(report.candidates, 2);
        assert.equal(report.converted, 2, JSON.stringify(report));
        assert.ok(report.savedBytes > 0);
        assert.equal(report.inputBytes - report.outputBytes, report.savedBytes);
        for (const variant of ['runtime', 'detail']) {
            const base = slug + '-spritesheet-v14-' + variant;
            assert.equal(existsSync(join(dir, base + '.png')), false);
            const webp = readFileSync(join(dir, base + '.webp'));
            const atlas = JSON.parse(readFileSync(join(dir, slug +
                '-atlas-v14-' + variant + '.json'), 'utf8'));
            assert.equal(atlas.meta.image, base + '.webp');
            assert.equal(atlas.meta.imageRevision,
                createHash('sha256').update(webp).digest('hex'));
            assert.ok(atlas.frames.idle);
            assert.deepEqual(atlas.meta.size, { w: 256, h: 256 });
            const manifest = JSON.parse(readFileSync(join(dir, 'manifests',
                'character_manifest_v4.json'), 'utf8'));
            assert.equal(manifest.runtime.atlas_targets[variant].image,
                '../' + base + '.webp');
        }
    } finally { rmSync(root, { recursive: true, force: true }); }
});
