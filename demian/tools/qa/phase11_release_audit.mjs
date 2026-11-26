/**
 * F11-12/13: deterministic SHA-bound static PWA release audit.
 * This runs against the production export artifact, not a mock host.
 * It makes no claims about DNS, PHP-FPM, physical devices or real prizes.
 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePwaRelease } from '../validate_pwa_release.mjs';
import { OFFLINE_GAME_IDS } from '../offline_pack_manifest.mjs';

const essential = Object.freeze([
    '.htaccess', 'index.html', 'manifest.webmanifest', 'service-worker.js',
    'offline-packs.json', 'offline.html',
]);
const sha256 = value => createHash('sha256').update(value).digest('hex');

export function auditPhase11StaticRelease({
    siteRoot, sourceRoot, commitSha, validate = validatePwaRelease,
} = {}) {
    if (!/^[a-f0-9]{40}$/.test(commitSha ?? '')) {
        throw Error('F11-13 requires exact 40-character checked-out source SHA.');
    }
    if (!siteRoot || !sourceRoot) throw Error('Missing static artifact or source directory.');
    const site = resolve(siteRoot), source = resolve(sourceRoot);
    if (!existsSync(site) || lstatSync(site).isSymbolicLink()) {
        throw Error('Cannot audit absent or symlinked site root.');
    }
    const files = {};
    for (const path of essential) {
        const full = join(site, path);
        if (!existsSync(full) || !lstatSync(full).isFile() || lstatSync(full).isSymbolicLink()) {
            throw Error('Missing, nonregular or symlinked PWA release file: ' + path);
        }
        const bytes = readFileSync(full);
        if (bytes.byteLength === 0 || bytes.byteLength > 4 * 1048576) {
            throw Error('Invalid bounded PWA release file: ' + path);
        }
        files[path] = sha256(bytes);
    }
    // This validator independently checks all offline-pack assets, hashes,
    // local font URLs and the service worker versioned release contract.
    const validated = validate(site);
    if (validated?.status !== 'passed') throw Error('Static PWA policy did not pass.');
    const pack = JSON.parse(readFileSync(join(site, 'offline-packs.json'), 'utf8'));
    if (pack?.schema !== 1 || !/^[a-f0-9]{16}$/.test(pack.release ?? '')
        || !Array.isArray(pack.games)
        || pack.games.length !== OFFLINE_GAME_IDS.length
        || !OFFLINE_GAME_IDS.every(id => pack.games.some(game => game.id === id))) {
        throw Error('Offline game catalog does not exactly match the release rules.');
    }
    const sw = readFileSync(join(site, 'service-worker.js'), 'utf8');
    if (!sw.includes("const RELEASE_ID = '"+pack.release+"'")) {
        throw Error('The service worker and offline asset manifest disagree on release ID.');
    }
    const html = readFileSync(join(site, 'index.html'), 'utf8');
    if (!html.includes('name="demian-static-release" content="true"')) {
        throw Error('The release does not contain the expected static PWA marker.');
    }
    const gameRules = join(source, 'resources/game/runner-rules.json');
    if (!existsSync(gameRules) || !lstatSync(gameRules).isFile()) {
        throw Error('The server-authoritative Dino rule reference is missing.');
    }
    const runnerRules = JSON.parse(readFileSync(gameRules, 'utf8'));
    if (typeof runnerRules.version !== 'string' || runnerRules.version.length === 0) {
        throw Error('Missing authoritative runner rules version.');
    }
    const contentFingerprint = sha256(Object.entries(files)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([path, digest]) => path + ':' + digest).join('\n')
        + '\nrunner:' + sha256(readFileSync(gameRules)));
    return {
        schema: 1, phase: 11, status: 'passed', commitSha,
        pwaReleaseId: pack.release, runnerRulesVersion: runnerRules.version,
        bundleFingerprintSha256: contentFingerprint, criticalFileSha256: files,
        checkedGames: OFFLINE_GAME_IDS,
        artifactOrigin: 'local-immutable-CI-export',
        physicalDevicesVerified: false, productionHostVerified: false,
        realRewardCycleVerified: false, productionGoAuthorized: false,
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const pairs = Object.fromEntries(process.argv.slice(2).map(x => {
            const i = x.indexOf('=');
            return [x.slice(0, i), x.slice(i + 1)];
        }));
        const out = auditPhase11StaticRelease({
            siteRoot: pairs['--site'] ?? resolve(import.meta.dirname, '../../_site'),
            sourceRoot: pairs['--source'] ?? resolve(import.meta.dirname, '../..'),
            commitSha: pairs['--sha'] ?? process.env.GITHUB_SHA,
        });
        if (pairs['--output']) {
            const path = resolve(pairs['--output']);
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, JSON.stringify(out, null, 2) + '\n', { flag: 'w' });
        }
        console.log(JSON.stringify(out));
    } catch (error) {
        console.error('[F11-13] Release artifact audit failed: '+error.message);
        process.exitCode = 1;
    }
}
