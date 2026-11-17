import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
});
const imports = source => [...source.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)['"]([^'"]+)['"]/g)].map(match => match[1]);

test('deterministic game models cannot depend on rendering, UI, transport or another game', () => {
    const files = walk(resolve(root, 'resources/js/game/games')).filter(path => /Model\.js$/.test(path));
    assert.ok(files.length >= 5);
    for (const file of files) {
        for (const dependency of imports(readFileSync(file, 'utf8'))) {
            assert.doesNotMatch(dependency, /(?:application|rendering|managers|shell|services|input)\//, relative(root, file));
            assert.ok(!dependency.includes('../..') || !dependency.includes('/games/'), file);
        }
        assert.doesNotMatch(readFileSync(file, 'utf8'), /\b(?:fetch|XMLHttpRequest|localStorage|document)\b/, file);
    }
});

test('Arcade domain cannot import framework, infrastructure or browser concerns', () => {
    for (const file of walk(resolve(root, 'src/Domain/Arcade'))) {
        const source = readFileSync(file, 'utf8');
        assert.doesNotMatch(source, /\b(?:Illuminate|App|Symfony|Carbon)\\/, relative(root, file));
        assert.doesNotMatch(source, /\b(?:app|config|request|response|now|env)\s*\(/, relative(root, file));
    }
});

test('performance modules cannot form circular imports', () => {
    const files = walk(resolve(root, 'resources/js/game/performance')).filter(file => file.endsWith('.js'));
    const graph = new Map(files.map(file => [file, imports(readFileSync(file, 'utf8'))
        .filter(path => path.startsWith('.')).map(path => resolve(file, '..', path)).filter(path => files.includes(path))]));
    const done = new Set();
    function visit(file, ancestors = []) {
        assert.ok(!ancestors.includes(file), `Import cycle: ${[...ancestors, file].map(path => relative(root, path)).join(' -> ')}`);
        if (done.has(file)) return;
        for (const dependency of graph.get(file)) visit(dependency, [...ancestors, file]);
        done.add(file);
    }
    for (const file of files) visit(file);
});
