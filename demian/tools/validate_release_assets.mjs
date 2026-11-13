/** Mobile-02: fail the release when pruning drops any declared runtime dependency. */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { BUILTIN_CHARACTER_SLUGS, characterPackVersion } from '../resources/js/game/characters/CharacterVisualContract.js';
import { inventoryRelease } from './mobile_benchmark_metrics.mjs';
import { assetDecision, RELEASE_SPRITE_VARIANTS } from './release_asset_policy.mjs';

function walkFiles(directory) {
    const files = [];
    function visit(path) {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
            const target = join(path, entry.name);
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) visit(target);
            else if (entry.isFile()) files.push(target);
        }
    }
    visit(directory);
    return files;
}
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }

export function validateReleaseAssets({ root, sourceAssets = null, reportPath = null } = {}) {
    const release = resolve(root);
    const assetsRoot = join(release, 'assets');
    const errors = [];
    const required = new Set();
    function check(path) {
        const normalized = String(path).replaceAll('\\', '/');
        if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
            errors.push('Unsafe required path: ' + normalized);
            return;
        }
        required.add(normalized);
        if (!existsSync(join(release, normalized))) errors.push('Missing runtime asset: ' + normalized);
    }
    check('index.html'); check('characters.json'); check('manifest.webmanifest');
    check('assets/characters/character-manifest-v4.json');
    check('assets/characters/master-motion-v1.json');
    check('assets/environments/demian-fbx/polished-v1/preview.webp');
    check('build/manifest.json');

    const charactersJson = readJson(join(release, 'characters.json'));
    const rows = charactersJson?.data ?? [];
    const uniqueSlugs = [...new Set(rows.map(row => row.slug))];
    if (rows.length !== BUILTIN_CHARACTER_SLUGS.length ||
        uniqueSlugs.some(slug => !BUILTIN_CHARACTER_SLUGS.includes(slug))) {
        errors.push('Exported character roster diverged from live runtime contract.');
    }
    const registry = readJson(join(assetsRoot, 'characters/character-manifest-v4.json'));
    if (JSON.stringify(registry.characters.map(x => x.slug)) !== JSON.stringify(BUILTIN_CHARACTER_SLUGS)) {
        errors.push('Public character registry diverged from runtime roster.');
    }
    for (const row of registry.characters) {
        const slug = row.slug;
        const version = characterPackVersion(slug);
        const rootPath = 'assets/characters/' + slug + '/';
        check(rootPath + slug + '-preview-v' + version + '.png');
        check('assets/characters/' + row.manifest);
        for (const variant of RELEASE_SPRITE_VARIANTS) {
            const prefix = rootPath + slug + '-';
            const atlas = prefix + 'atlas-v' + version + '-' + variant + '.json';
            const sprite = prefix + 'spritesheet-v' + version + '-' + variant + '.png';
            check(atlas); check(sprite);
            if (existsSync(join(release, atlas))) {
                const data = readJson(join(release, atlas));
                if (data.meta?.image !== slug + '-spritesheet-v' + version + '-' + variant + '.png') {
                    errors.push('Atlas/PNG mismatch: ' + atlas);
                }
            }
        }
    }
    for (const row of rows) {
        check(row.sprite_url); check(row.atlas_url);
    }

    const manifest = readJson(join(release, 'build/manifest.json'));
    const entry = manifest['resources/js/app.js'];
    if (!entry?.isEntry) errors.push('Missing JavaScript entry in Vite manifest.');
    for (const item of Object.values(manifest)) {
        if (item.file) check('build/' + item.file);
        for (const path of [...(item.css ?? []), ...(item.assets ?? [])]) check('build/' + path);
    }
    // Keep tile resolution correct at all adaptive quality tiers.
    const artPath = join(release, 'assets/environments/demian-fbx/polished-v1');
    if (existsSync(artPath)) {
        const cafeArtPath = join(resolve(import.meta.dirname, '..'), 'resources/game/cafe-art.json');
        const art = readJson(cafeArtPath);
        for (const level of art.levels) {
            for (let r = 0; r < level.rows; r++) for (let c = 0; c < level.columns; c++) {
                check('assets/environments/demian-fbx/polished-v1/lod-' +
                    level.width + '/' + r + '-' + c + '.webp');
            }
        }
    }

    for (const filename of walkFiles(assetsRoot)) {
        const file = relative(assetsRoot, filename).split(sep).join('/');
        const decision = assetDecision(file);
        if (!decision.keep) errors.push('Forbidden build-only file shipped: ' + file + ' (' + decision.reason + ')');
    }
    const released = inventoryRelease(release);
    const src = sourceAssets ? resolve(sourceAssets) : null;
    const source = src ? inventoryRelease(src) : null;
    const omissions = {};
    if (src) {
        for (const filename of walkFiles(src)) {
            const name = relative(src, filename).split(sep).join('/');
            const decision = assetDecision(name);
            if (decision.keep && !existsSync(join(assetsRoot, name))) {
                errors.push('Unexpected missing source asset: ' + name);
            }
            if (!decision.keep) {
                const row = omissions[decision.reason] ?? { files: 0, bytes: 0 };
                row.files += 1;
                row.bytes += statSync(filename).size;
                omissions[decision.reason] = row;
            }
        }
    }
    const report = {
        schemaVersion: 1, status: errors.length ? 'failed' : 'passed',
        policy: { variants: RELEASE_SPRITE_VARIANTS, runtimeCharacters: BUILTIN_CHARACTER_SLUGS },
        requiredRuntimeFiles: required.size, sourceAssetBytes: source?.totalBytes ?? null,
        exportedAssetBytes: inventoryRelease(assetsRoot).totalBytes,
        removedAssetBytes: source ? source.totalBytes - inventoryRelease(assetsRoot).totalBytes : null,
        omissions, output: { fileCount: released.fileCount, totalBytes: released.totalBytes },
        errors,
    };
    if (reportPath) {
        mkdirSync(resolve(reportPath, '..'), { recursive: true });
        writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    }
    if (errors.length) throw new Error('Static asset validation failed (' + errors.length + '): ' + errors.slice(0, 12).join('; '));
    return report;
}
