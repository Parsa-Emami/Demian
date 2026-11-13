/** MIT. Build a portable static release without PHP or a database. */
import { mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { BUILTIN_CHARACTER_SLUGS, RETIRED_CHARACTER_SLUGS, characterPackVersion } from '../resources/js/game/characters/CharacterVisualContract.js';
import { BUILTIN_CHARACTER_LABELS as labels } from '../resources/js/game/characters/manifests/CharacterManifestRegistry.js';
import { renderStaticTemplate } from './static_template.mjs';
import { shouldExportAsset } from './release_asset_policy.mjs';
import { validateReleaseAssets } from './validate_release_assets.mjs';
const root = resolve(import.meta.dirname, '..');
const out = resolve(root, process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? '_site');
const arcadeApi = process.env.DEMIAN_ARCADE_API_URL?.trim() ?? '';
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
const html = renderStaticTemplate(readFileSync(join(root, 'resources/views/demian.blade.php'), 'utf8'), { entry, arcadeApi });
writeFileSync(join(out, 'index.html'), html);
// A content-derived service-worker version makes installs deterministic and
// avoids activating an incompatible cached shell during a live ranked run.
const releaseId = createHash('sha256').update(JSON.stringify({
    entry: entry.file, css: entry.css ?? [],
})).digest('hex').slice(0, 16);
const workerTemplate = readFileSync(join(root, 'tools/templates/service-worker.js'), 'utf8');
if (!workerTemplate.includes('__DEMIAN_RELEASE_ID__')) throw new Error('PWA worker version placeholder missing.');
writeFileSync(join(out, 'service-worker.js'),
    workerTemplate.replaceAll('__DEMIAN_RELEASE_ID__', releaseId));
cpSync(join(root, 'tools/templates/offline.html'), join(out, 'offline.html'));
writeFileSync(join(out, 'characters.json'), JSON.stringify({ data: BUILTIN_CHARACTER_SLUGS.map((slug) => ({
    id: `builtin-${slug}`, name: labels[slug], slug, is_builtin: true, is_active: slug === 'darya',
    sprite_url: `assets/characters/${slug}/${slug}-spritesheet-v${characterPackVersion(slug)}-mobile.png`,
    atlas_url: `assets/characters/${slug}/${slug}-atlas-v${characterPackVersion(slug)}-mobile.json`,
    settings: { scale: 1, walk_speed: 3.55, run_speed: 6.9, jump_force: 6.8 },
})) }, null, 2));
writeFileSync(join(out, '.nojekyll'), '');
const report = validateReleaseAssets({
    root: out,
    sourceAssets,
    reportPath: join(root, 'docs/mobile-02/release-asset-report.json'),
});
console.log('Mobile-02 release: ' + report.output.fileCount + ' files, ' +
    report.output.totalBytes + ' bytes (' + report.removedAssetBytes + ' asset bytes pruned).');
console.log(`Static release: ${out}`);
