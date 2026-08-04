import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const sharedRoot = join(root, 'resources/js/game/shared');
const legacyPolicy = join(sharedRoot, 'cafe/CafeScenePolicy.js');
const threeImportPattern = /(?:\bfrom\s+|\bimport\s*\(\s*)['"]three['"]/;

function collectJavaScript(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolute = join(directory, entry.name);
        if (entry.isDirectory()) return collectJavaScript(absolute);
        return entry.isFile() && extname(entry.name) === '.js' ? [absolute] : [];
    });
}

test('shared game domain stays renderer-neutral', () => {
    assert.equal(
        existsSync(legacyPolicy),
        false,
        'CafeScenePolicy.js is a legacy Three.js renderer policy and must not exist in game/shared.'
    );

    for (const file of collectJavaScript(sharedRoot)) {
        const source = readFileSync(file, 'utf8');
        const name = relative(root, file);
        assert.doesNotMatch(source, threeImportPattern, `${name} imports Three.js`);
        assert.doesNotMatch(source, /\bTHREE\s*\./, `${name} references the Three.js namespace`);
    }
});
