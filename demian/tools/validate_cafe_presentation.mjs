import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import art from '../resources/game/cafe-art.json' with { type: 'json' };
import { CAFE_FBX, CAFE_BOUNDS } from '../resources/js/game/shared/cafe/CafeWalkthroughScene.js';

const assetRoot = process.argv.find(arg => arg.startsWith('--asset-root='))?.slice(13);
const root = resolve(import.meta.dirname, '..', assetRoot ?? `public/${art.root}`);
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.sourceSha256, CAFE_FBX.sourceSha256);
assert.equal(manifest.version, art.version); assert.equal(manifest.geometryChanged, false);
assert.deepEqual(manifest.levels, art.levels);
assert(art.preview.width * art.preview.height * 4 < 5000000);
assert.equal(manifest.files.length, 1 + art.levels.reduce((sum, level) => sum + level.columns * level.rows, 0));
assert.equal(new Set(manifest.files.map(file => file.file)).size, manifest.files.length);
let total = 0;
for (const file of manifest.files) {
    assert(/^(preview\.webp|lod-(1024|1536|2048)\/\d+-\d+\.webp)$/.test(file.file));
    const bytes = readFileSync(resolve(root, file.file));
    assert.equal(bytes.length, file.bytes); assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    total += bytes.length;
}
for (const level of art.levels) {
    assert(Math.abs(level.height / level.width - (CAFE_BOUNDS.maxZ - CAFE_BOUNDS.minZ) / (CAFE_BOUNDS.maxX - CAFE_BOUNDS.minX)) <= 1 / level.width);
    for (let row = 0; row < level.rows; row++) for (let col = 0; col < level.columns; col++) {
        const file = manifest.files.find(f => f.file === `lod-${level.width}/${row}-${col}.webp`);
        assert.equal(file.width, Math.min(512, level.width - col * 512) + art.gutter * 2);
        assert.equal(file.height, Math.min(512, level.height - row * 512) + art.gutter * 2);
    }
}
assert(total < 2500000); assert.equal(total, manifest.totalDownloadBytes);
console.log(`Cafe presentation validated: ${manifest.files.length} images, ${total} bytes, three bounded levels and unchanged FBX geometry.`);
