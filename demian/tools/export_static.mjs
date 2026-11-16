/** MIT. Build a portable static release without PHP or a database. */
import { mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { BUILTIN_CHARACTER_SLUGS, RETIRED_CHARACTER_SLUGS, characterPackVersion } from '../resources/js/game/characters/CharacterVisualContract.js';
import { BUILTIN_CHARACTER_LABELS as labels } from '../resources/js/game/characters/manifests/CharacterManifestRegistry.js';
import { renderStaticTemplate } from './static_template.mjs';
import { shouldExportAsset } from './release_asset_policy.mjs';
import { validateReleaseAssets } from './validate_release_assets.mjs';
import { buildOfflinePackManifest } from './offline_pack_manifest.mjs';
const root = resolve(import.meta.dirname, '..');
const out = resolve(root, process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? '_site');
const arcadeApi = process.env.DEMIAN_ARCADE_API_URL?.trim() ?? '';
const publicOrigin = process.env.DEMIAN_PUBLIC_ORIGIN?.trim() ?? '';
const pagesCustomDomain = process.env.DEMIAN_PAGES_CUSTOM_DOMAIN?.trim() ?? '';
if (pagesCustomDomain && (pagesCustomDomain !== 'demiancafe.ir' || publicOrigin !== 'https://demiancafe.ir')) {
    throw new Error('Pages CNAME requires the exact verified demiancafe.ir public origin.');
}
if (arcadeApi && !/^https:\/\/[^\s<>"']+\/api\/v1\/arcade\/?$/.test(arcadeApi)) throw new Error('DEMIAN_ARCADE_API_URL must be an HTTPS arcade API URL.');
if (out === root || out === join(root, 'public')) throw new Error('Output must be a separate release folder.');
const entry = JSON.parse(readFileSync(join(root, 'public/build/manifest.json'), 'utf8'))['resources/js/app.js'];
if (!entry?.file) throw new Error('Run npm run build first.');
mkdirSync(out, { recursive: true });
rmSync(join(out, 'assets'), { recursive: true, force: true });
// Keep source art and historical sprite packs in Git, never in the deploy artifact.
const sourceAssets = join(root, 'public/assets');
cpSync(sourceAssets, join(out, 'assets'), { recursive: true,
    filter: source => shouldExportAsset(sourceAssets, source) });
for (const slug of RETIRED_CHARACTER_SLUGS) {
    rmSync(join(out, 'assets/characters', slug), { recursive: true, force: true });
    rmSync(join(out, 'assets/characters/_legacy_archive', slug), { recursive: true, force: true });
}
for (const slug of BUILTIN_CHARACTER_SLUGS) {
    rmSync(join(out, 'assets/characters/_legacy_archive', slug), { recursive: true, force: true });
}
// Only this build owns the bundle directory. Do not remove unrelated user files.
rmSync(join(out, 'build'), { recursive: true, force: true });
cpSync(join(root, 'public/build'), join(out, 'build'), { recursive: true });
rmSync(join(out, 'about.html'), { force: true });
for (const file of ['manifest.webmanifest', 'favicon.ico', 'robots.txt', 'game-info.json', 'llms.txt']) {
    if (existsSync(join(root, 'public', file))) cpSync(join(root, 'public', file), join(out, file));
}
cpSync(join(root, 'public/icons'), join(out, 'icons'), { recursive: true });
const html = renderStaticTemplate(readFileSync(join(root, 'resources/views/demian.blade.php'), 'utf8'), { entry, arcadeApi, publicOrigin });
writeFileSync(join(out, 'index.html'), html);
// Do not claim the custom domain or change old Pages routing before DNS is verified.
rmSync(join(out, 'CNAME'), { force: true });
if (pagesCustomDomain) writeFileSync(join(out, 'CNAME'), pagesCustomDomain + '\n');
if (publicOrigin) {
    writeFileSync(join(out, 'sitemap.xml'),
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        '<url><loc>' + publicOrigin + '/</loc></url></urlset>\n');
    writeFileSync(join(out, 'robots.txt'),
        'User-agent: *\nAllow: /\nSitemap: ' + publicOrigin + '/sitemap.xml\n');
} else rmSync(join(out, 'sitemap.xml'), { force: true });
// A content-derived service-worker version makes installs deterministic and
// avoids activating an incompatible cached shell during a live ranked run.
writeFileSync(join(out, 'characters.json'), JSON.stringify({ data: BUILTIN_CHARACTER_SLUGS.map((slug) => ({
    id: `builtin-${slug}`, name: labels[slug], slug, is_builtin: true, is_active: slug === 'darya',
    sprite_url: `assets/characters/${slug}/${slug}-spritesheet-v${characterPackVersion(slug)}-mobile.png`,
    atlas_url: `assets/characters/${slug}/${slug}-atlas-v${characterPackVersion(slug)}-mobile.json`,
    settings: { scale: 1, walk_speed: 3.55, run_speed: 6.9, jump_force: 6.8 },
})) }, null, 2));
// Transform ONLY release copies of active runtime/detail PNGs. The Python
// gate verifies exact decoded pixels and discards every non-saving WebP.
// Missing Pillow, conversion errors and malformed atlases fail the build.
const optimized = JSON.parse(execFileSync(process.env.DEMIAN_PYTHON_BIN || 'python3', [
    'tools/optimize_sprite_release.py', '--release', out,
], { cwd: root, encoding: 'utf8', timeout: 240000, maxBuffer: 1024 * 1024 }));
console.log('Phase 4 Step 18 pixel-exact sprites: ' + optimized.converted +
    '/' + optimized.candidates + ' WebP, ' + optimized.savedBytes + ' bytes saved.');
const provisional = buildOfflinePackManifest({ release: out, entry,
    releaseId: '0000000000000000' });
// Hash the actual offline-critical assets as well as the atomic app bundle.
// Art-only changes now force a new offline release instead of mixing packs.
const resourcePaths = [...new Set([
    ...provisional.core.map(row => row.path),
    ...provisional.games.flatMap(game => game.files.map(row => row.path)),
])].sort();
const fingerprint = createHash('sha256');
for (const path of resourcePaths) {
    fingerprint.update(path);
    fingerprint.update(createHash('sha256').update(readFileSync(join(out, path))).digest());
}
const releaseId = fingerprint.digest('hex').slice(0, 16);
const offlinePacks = { ...provisional, release: releaseId };
writeFileSync(join(out, 'offline-packs.json'), JSON.stringify(offlinePacks, null, 2) + '\n');
const workerTemplate = readFileSync(join(root, 'tools/templates/service-worker.js'), 'utf8');
if (!workerTemplate.includes('__DEMIAN_RELEASE_ID__')) throw new Error('PWA worker version placeholder missing.');
writeFileSync(join(out, 'service-worker.js'),
    workerTemplate.replaceAll('__DEMIAN_RELEASE_ID__', releaseId));
cpSync(join(root, 'tools/templates/offline.html'), join(out, 'offline.html'));
cpSync(join(root, 'tools/templates/static-host.htaccess'), join(out, '.htaccess'));
writeFileSync(join(out, '.nojekyll'), '');
const report = validateReleaseAssets({
    root: out,
    sourceAssets,
    reportPath: join(root, 'docs/mobile-02/release-asset-report.json'),
});
console.log('Mobile-02 release: ' + report.output.fileCount + ' files, ' +
    report.output.totalBytes + ' bytes (' + report.removedAssetBytes + ' asset bytes pruned).');
console.log(`Static release: ${out}`);
