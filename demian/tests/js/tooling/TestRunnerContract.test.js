import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { testRunnerCoversGroup } from '../../../tools/validation/testRunnerContract.mjs';

function withFixture(callback) {
    const root = mkdtempSync(join(tmpdir(), 'demian-test-runner-'));

    try {
        mkdirSync(join(root, 'tools'), { recursive: true });
        mkdirSync(join(root, 'tests/js/collision'), { recursive: true });
        writeFileSync(join(root, 'tests/js/collision/Collision.test.js'), '');
        callback(root);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}

test('test runner contract accepts the recursive cross-platform runner', () => {
    withFixture((root) => {
        writeFileSync(join(root, 'tools/run_js_tests.mjs'), `
            import { resolve } from 'node:path';
            const projectRoot = process.cwd();
            const testsRoot = resolve(projectRoot, 'tests/js');
            function collectTests(directory) {
                const path = directory;
                collectTests(path);
                return 'example.test.js'.endsWith('.test.js');
            }
            const testFiles = collectTests(testsRoot);
            console.log('--test', testFiles);
        `);

        const packageJson = { scripts: { 'test:js': 'node tools/run_js_tests.mjs' } };
        assert.equal(testRunnerCoversGroup(root, packageJson, 'collision'), true);
    });
});

test('test runner contract rejects a runner that does not recurse through tests/js', () => {
    withFixture((root) => {
        writeFileSync(join(root, 'tools/run_js_tests.mjs'), `
            const testFiles = ['tests/js/example.test.js'];
            console.log('--test', testFiles);
        `);

        const packageJson = { scripts: { 'test:js': 'node tools/run_js_tests.mjs' } };
        assert.equal(testRunnerCoversGroup(root, packageJson, 'collision'), false);
    });
});
