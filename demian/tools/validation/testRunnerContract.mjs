import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function containsTestFile(directory) {
    if (!existsSync(directory)) return false;

    return readdirSync(directory, { withFileTypes: true }).some((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory()
            ? containsTestFile(path)
            : entry.isFile() && entry.name.endsWith('.test.js');
    });
}

/**
 * Supports both the historical explicit glob command and the cross-platform
 * recursive runner introduced in 8.1.4. The recursive runner is validated by
 * contract rather than by a brittle package.json substring check.
 */
export function testRunnerCoversGroup(root, packageJson, group) {
    const script = packageJson.scripts?.['test:js'] ?? '';
    const explicitPattern = `tests/js/${group}/*.test.js`;

    if (script.includes(explicitPattern)) return true;
    if (!script.includes('tools/run_js_tests.mjs')) return false;

    const runnerPath = join(root, 'tools/run_js_tests.mjs');
    if (!existsSync(runnerPath)) return false;

    const runner = readFileSync(runnerPath, 'utf8');
    const scansTestsRoot = /resolve\(\s*projectRoot\s*,\s*['"]tests\/js['"]\s*\)/.test(runner)
        || /resolve\(\s*projectRoot\s*,\s*['"]tests['"]\s*,\s*['"]js['"]\s*\)/.test(runner);
    const recursesDirectories = /collectTests\(\s*path\s*\)/.test(runner);
    const selectsNodeTests = /endsWith\(\s*['"]\.test\.js['"]\s*\)/.test(runner);
    const invokesNodeTestRunner = /['"]--test['"]/.test(runner);
    const groupHasTests = containsTestFile(join(root, 'tests/js', group));

    return scansTestsRoot
        && recursesDirectories
        && selectsNodeTests
        && invokesNodeTestRunner
        && groupHasTests;
}
