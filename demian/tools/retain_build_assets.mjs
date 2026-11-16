/**
 * Preserve hashed Vite assets for previously opened tabs after a Pages deploy.
 * The latest two prior releases remain available without keeping unbounded
 * versions or changing the current Vite manifest. Fail closed if an expected
 * prior asset is missing; never overwrite a content-addressed filename.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_PRIOR_RELEASES = 2;
const MAX_RETAINED_BYTES = 64 * 1024 * 1024;
const SAFE_ASSET = /^assets\/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2|png|webp|svg|wasm)$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function guardedFile(root, relative) {
    if (!SAFE_ASSET.test(relative)) throw new Error('Unsafe Vite lineage path: ' + relative);
    const absolute = join(root, relative);
    if (!existsSync(absolute) || !lstatSync(absolute).isFile()) {
        throw new Error('Missing prior immutable build asset: ' + relative);
    }
    return absolute;
}
export function retainBuildAssets({ site, previous = null }) {
    const release = resolve(site);
    const build = join(release, 'build');
    const manifestFile = join(build, 'manifest.json');
    const manifestBytes = readFileSync(manifestFile);
    const manifest = JSON.parse(manifestBytes);
    if (!manifest['resources/js/app.js']?.file) throw new Error('Missing current app entry.');
    const assetsDir = join(build, 'assets');
    const currentFiles = readdirSync(assetsDir).map(name => 'assets/' + name)
        .filter(path => SAFE_ASSET.test(path)).sort();
    const currentId = hash(manifestBytes).slice(0, 16);
    if (!currentFiles.length) throw new Error('No immutable Vite assets found.');
    const lineage = [{ id: currentId, files: currentFiles }];
    let retainedBytes = 0;
    const old = previous ? resolve(previous) : null;
    const historyPath = old && join(old, 'asset-history.json');
    if (historyPath && existsSync(historyPath)) {
        const parsed = JSON.parse(readFileSync(historyPath, 'utf8'));
        if (parsed.schema !== 1 || !Array.isArray(parsed.releases)) {
            throw new Error('Invalid prior hashed-asset lineage manifest.');
        }
        const seen = new Set(currentFiles);
        for (const row of parsed.releases.slice(0, MAX_PRIOR_RELEASES)) {
            if (!/^[a-f0-9]{16}$/.test(row.id ?? '') || !Array.isArray(row.files)) {
                throw new Error('Invalid release in prior asset lineage.');
            }
            if (row.id === currentId) continue;
            const keep = [];
            for (const file of row.files) {
                const from = guardedFile(old, file);
                const to = join(build, file);
                if (!seen.has(file)) {
                    const size = statSync(from).size;
                    retainedBytes += size;
                    if (retainedBytes > MAX_RETAINED_BYTES) {
                        throw new Error('Immutable asset retention exceeds 64 MiB budget.');
                    }
                    cpSync(from, to, { errorOnExist: true, force: false });
                    seen.add(file);
                } else if (existsSync(to) && hash(readFileSync(from)) !== hash(readFileSync(to))) {
                    throw new Error('Content-hashed asset name collision: ' + file);
                }
                keep.push(file);
            }
            if (keep.length) lineage.push({ id: row.id, files: keep });
        }
    } else if (old && existsSync(join(old, 'assets'))) {
        throw new Error('Prior Vite assets exist without their lineage manifest.');
    }
    const result = { schema: 1, releases: lineage };
    writeFileSync(join(build, 'asset-history.json'), JSON.stringify(result, null, 2) + '\n');
    return { release: currentId, preservedReleases: lineage.length - 1,
        preservedBytes: retainedBytes, currentAssets: currentFiles.length };
}
const cliPath = process.argv[1] && resolve(process.argv[1]);
if (cliPath === fileURLToPath(import.meta.url)) {
    const args = Object.fromEntries(process.argv.slice(2).filter(arg => arg.startsWith('--'))
        .map(arg => arg.slice(2).split(/=(.*)/s).slice(0, 2)));
    const site = args.site ? resolve(args.site) : resolve(import.meta.dirname, '../_site');
    const result = retainBuildAssets({ site, previous: args.previous ?? null });
    console.log('Immutable Vite release lineage: ' + JSON.stringify(result));
}
