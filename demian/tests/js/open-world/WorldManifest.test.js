import test from 'node:test';
import assert from 'node:assert/strict';
import WorldManifest, { validateWorldManifest } from '../../../resources/js/game/games/open-world/world/WorldManifest.js';
import manifest, { DEMIAN_CITY_MANIFEST_DEFINITION } from '../../../resources/js/game/games/open-world/data/DemianCityManifest.js';

// The legacy DemianCity import must resolve to the reference café so an old
// code path can never bring the retired neon city back.
test('legacy Demian City manifest resolves to the immutable reference café', () => {
    assert.equal(validateWorldManifest(DEMIAN_CITY_MANIFEST_DEFINITION).length, 0);
    assert.equal(manifest.id, 'demian-reference-cafe');
    assert.equal(manifest.chunks.length, 14);
    assert.equal(manifest.districts.length, 5);
    assert.equal(manifest.savePoints.length, 5);
    assert.ok(Object.isFrozen(manifest.serialize()));
    assert.ok(manifest.chunks.every((chunk) => chunk.theme === 'cafe'));
    assert.equal(manifest.version, 3);
    for (const point of manifest.savePoints) {
        assert.equal(manifest.chunk(point.chunkId)?.id, point.chunkId);
        assert.equal(manifest.district(point.districtId)?.id, point.districtId);
    }
});

test('manifest validator rejects duplicate coordinates and dangling references', () => {
    const invalid = structuredClone(DEMIAN_CITY_MANIFEST_DEFINITION);
    invalid.chunks[1].grid = { ...invalid.chunks[0].grid };
    invalid.savePoints[0].chunkId = 'missing';
    invalid.origin = { x: Number.NaN, z: 0 };
    const errors = validateWorldManifest(invalid);
    assert.ok(errors.some((error) => error.includes('Duplicate chunk coordinate')));
    assert.ok(errors.some((error) => error.includes('missing chunk')));
    assert.ok(errors.some((error) => error.includes('World origin')));
    assert.throws(() => new WorldManifest(invalid));
});
