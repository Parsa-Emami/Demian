import test from 'node:test';
import assert from 'node:assert/strict';
import WorldManifest, { validateWorldManifest } from '../../../resources/js/game/games/open-world/world/WorldManifest.js';
import manifest, { DEMIAN_CITY_MANIFEST_DEFINITION } from '../../../resources/js/game/games/open-world/data/DemianCityManifest.js';

test('Demian City manifest is normalized, immutable and internally consistent', () => {
    assert.equal(validateWorldManifest(DEMIAN_CITY_MANIFEST_DEFINITION).length, 0);
    assert.equal(manifest.chunks.length, 24);
    assert.equal(manifest.districts.length, 6);
    assert.equal(manifest.savePoints.length, 6);
    assert.ok(Object.isFrozen(manifest.serialize()));
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
