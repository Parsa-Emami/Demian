import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export const MAX_COMPAT_GENERATIONS = 6;
export const MAX_COMPAT_BYTES = 64 * 1024 * 1024;
const NAME = /^assets\/[a-zA-Z0-9][a-zA-Z0-9._/-]*\.(?:js|css|woff2|woff|ttf|svg|png|webp)$/;
const ID = /^[a-f0-9]{16}$/;
const SHA = /^[a-f0-9]{64}$/;

function safe(path) {
    return typeof path === 'string' && NAME.test(path) &&
        !path.split('/').includes('..') && !path.split('/').includes('.');
}
function files(directory) {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const name = join(directory, entry.name);
        if (entry.isSymbolicLink()) throw Error('Symlink in compatibility archive');
        return entry.isDirectory() ? files(name) : entry.isFile() ? [name] : [];
    });
}
function digest(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function inventory(build) {
    const root = join(build, 'assets');
    const found = files(root).map(absolute => {
        const path = 'assets/' + relative(root, absolute).split(sep).join('/');
        if (!safe(path)) throw Error('Unsafe generated chunk name: ' + path);
        return { path, bytes: lstatSync(absolute).size, sha256: digest(absolute) };
    }).sort((a, b) => a.path.localeCompare(b.path));
    if (found.length === 0) throw Error('No generated build assets');
    return found;
}
function validateGeneration(generation) {
    if (!ID.test(generation?.id ?? '') || !Array.isArray(generation.assets)
        || generation.assets.length > 1000) throw Error('Invalid build compatibility generation');
    const seen = new Set();
    let bytes = 0;
    for (const file of generation.assets) {
        if (!safe(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes < 0
            || !SHA.test(file.sha256 ?? '') || seen.has(file.path)) {
            throw Error('Invalid compatibility asset metadata');
        }
        seen.add(file.path);
        bytes += file.bytes;
    }
    return bytes;
}
function readArchive(path) {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (data.schema !== 1 || !Array.isArray(data.generations)
        || data.generations.length > MAX_COMPAT_GENERATIONS) {
        throw Error('Invalid compatibility archive schema');
    }
    const ids = new Set();
    let bytes = 0;
    for (const generation of data.generations) {
        if (ids.has(generation.id)) throw Error('Duplicate retained release ID');
        ids.add(generation.id);
        bytes += validateGeneration(generation);
    }
    if (bytes > MAX_COMPAT_BYTES) throw Error('Compatibility asset archive exceeds budget');
    return data;
}

export function mergeCompatibleAssets({ release, archive = null, releaseId, requireArchive = false } = {}) {
    if (!ID.test(releaseId ?? '')) throw Error('Invalid release ID');
    const build = resolve(release, 'build');
    const current = { id: releaseId, assets: inventory(build) };
    const archiveRoot = archive && resolve(archive);
    const hasArchive = archiveRoot && existsSync(join(archiveRoot, 'compat.json'));
    if (requireArchive && !hasArchive) throw Error('Previous hashed chunks are required for this release');
    const previous = hasArchive ? readArchive(join(archiveRoot, 'compat.json')) : { generations: [] };
    const generations = [current, ...previous.generations.filter(g => g.id !== releaseId)
        .slice(0, MAX_COMPAT_GENERATIONS - 1)];
    if (generations.reduce((sum, g) => sum + validateGeneration(g), 0) > MAX_COMPAT_BYTES) {
        throw Error('Compatibility history exceeds 64 MiB, aborting publish');
    }
    for (const generation of generations.slice(1)) {
        for (const asset of generation.assets) {
            const destination = join(build, asset.path);
            const original = join(archiveRoot, asset.path);
            if (!existsSync(original) || !lstatSync(original).isFile()
                || lstatSync(original).size !== asset.bytes || digest(original) !== asset.sha256) {
                throw Error('Missing or corrupt previous-release chunk: ' + asset.path);
            }
            if (existsSync(destination)) {
                if (digest(destination) !== asset.sha256) {
                    throw Error('Content hash collision across releases: ' + asset.path);
                }
            } else {
                mkdirSync(resolve(destination, '..'), { recursive: true });
                copyFileSync(original, destination);
            }
        }
    }
    const result = { schema: 1, generations };
    writeFileSync(join(build, 'compat.json'), JSON.stringify(result, null, 2) + '\n');
    return { generations: generations.length, currentAssets: current.assets.length,
        retainedAssets: [...new Set(generations.slice(1).flatMap(g => g.assets.map(a => a.path)))].length };
}

export function validateCompatibleAssets(release) {
    const build = resolve(release, 'build');
    const compat = readArchive(join(build, 'compat.json'));
    if (!compat.generations.length) throw Error('Compatibility history is empty');
    for (const generation of compat.generations) {
        for (const asset of generation.assets) {
            const path = join(build, asset.path);
            if (!existsSync(path) || !lstatSync(path).isFile()
                || lstatSync(path).size !== asset.bytes || digest(path) !== asset.sha256) {
                throw Error('Invalid retained chunk: ' + asset.path);
            }
        }
    }
    return { status: 'passed', generations: compat.generations.length };
}
