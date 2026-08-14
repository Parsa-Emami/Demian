// Shared traversal + PHP linting helpers used by every validate_phaseN.mjs
// and validate_final.mjs script.
//
// Why this file exists:
// Every phase validator used to define its own local `walk()` and then call
// `walk(root, ...)` to find every *.php file in the whole project so it could
// run `php -l` on each one. That local `walk()` never excluded generated /
// third-party directories, so as soon as `composer install` had populated
// `vendor/` in CI, each phase script ended up synchronously spawning a PHP
// process for every file inside vendor/ as well - thousands of extra
// `php -l` calls per phase, repeated independently by phase4, phase5,
// phase6, phase7, phase8 and validate_final. That is what was blowing the
// GitHub Actions job past its 30 minute timeout and getting the workflow
// cancelled during Phase 8.
//
// The fix has two parts:
//   1. `walk()` here skips directories that never contain project source
//      (vendor, node_modules, .git, storage, bootstrap/cache, ...).
//   2. `lintPhpFiles()` centralizes the "find PHP files + php -l them"
//      behaviour so it exists in exactly one place instead of being copied
//      into six different files.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

// Directories that are never part of this project's own PHP/JS source and
// must be skipped during traversal. Matched against the directory's
// basename, so this applies no matter how deep the directory lives.
export const DEFAULT_EXCLUDED_DIRECTORY_NAMES = new Set([
    'vendor',        // Composer dependencies - can be tens of thousands of files.
    'node_modules',  // npm dependencies.
    '.git',          // Git internals.
    '.github',       // Workflow metadata, not project source.
    'storage',       // Laravel runtime/log/cache output, not source.
    'cache',         // Catches bootstrap/cache and any other generated cache dir.
    'dist',          // Build output.
    'build',         // Build output.
]);

/**
 * Recursively collect files under `directory` that satisfy `predicate`,
 * skipping any directory whose basename is in `excludedDirectoryNames`.
 *
 * @param {string} directory
 * @param {(absolutePath: string) => boolean} predicate
 * @param {{ excludedDirectoryNames?: Set<string> }} [options]
 * @returns {string[]}
 */
export function walk(directory, predicate = () => true, options = {}) {
    const excludedDirectoryNames = options.excludedDirectoryNames ?? DEFAULT_EXCLUDED_DIRECTORY_NAMES;
    if (!existsSync(directory)) return [];

    const results = [];
    for (const entry of readdirSync(directory)) {
        if (excludedDirectoryNames.has(entry)) continue;

        const absolute = join(directory, entry);
        const stat = statSync(absolute);
        if (stat.isDirectory()) {
            results.push(...walk(absolute, predicate, options));
        } else if (predicate(absolute)) {
            results.push(absolute);
        }
    }
    return results;
}

/**
 * Find every *.php file under `root` (excluding vendor/node_modules/etc.)
 * and run `php -l` on each one, returning the list of files checked.
 * Any syntax error is reported through `assert(condition, message)`, which
 * matches the `assert` helper each validate_phaseN.mjs script already
 * defines (push a message onto a `failures` array when the condition is
 * false).
 *
 * @param {string} root
 * @param {(condition: boolean, message: string) => void} assert
 * @returns {string[]} the PHP files that were linted
 */
export function lintPhpFiles(root, assert) {
    const phpFiles = walk(root, (file) => extname(file) === '.php');
    for (const file of phpFiles) {
        const check = spawnSync('php', ['-l', file], { encoding: 'utf8' });
        assert(check.status === 0, `PHP syntax error: ${file}\n${check.stderr}`);
    }
    return phpFiles;
}
