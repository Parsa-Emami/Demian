import { readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const testsRoot = resolve(projectRoot, 'tests/js');

function collectTests(directory) {
    return readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const path = resolve(directory, entry.name);

            if (entry.isDirectory()) {
                return collectTests(path);
            }

            return entry.isFile() && entry.name.endsWith('.test.js')
                ? [relative(projectRoot, path)]
                : [];
        })
        .sort((left, right) => left.localeCompare(right));
}

if (!statSync(testsRoot).isDirectory()) {
    console.error(`JavaScript test directory is missing: ${testsRoot}`);
    process.exit(1);
}

const testFiles = collectTests(testsRoot);

if (testFiles.length === 0) {
    console.error(`No JavaScript test files were found below ${testsRoot}`);
    process.exit(1);
}

console.log(`Running ${testFiles.length} JavaScript test files...`);

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
});

if (result.error) {
    console.error(result.error);
    process.exit(1);
}

process.exit(result.status ?? 1);
