/** MIT. Build a portable static release without PHP or a database. */
import { mkdirSync, readFileSync, writeFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { BUILTIN_CHARACTER_SLUGS, characterPackVersion } from '../resources/js/game/characters/CharacterVisualContract.js';
const root = resolve(import.meta.dirname, '..');
const out = resolve(root, process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? '_site');
if (out === root || out === join(root, 'public')) throw new Error('Output must be a separate release folder.');
const entry = JSON.parse(readFileSync(join(root, 'public/build/manifest.json'), 'utf8'))['resources/js/app.js'];
if (!entry?.file) throw new Error('Run npm run build first.');
mkdirSync(out, { recursive: true });
cpSync(join(root, 'public/assets'), join(out, 'assets'), { recursive: true });
// Only this build owns the bundle directory. Do not remove unrelated user files.
rmSync(join(out, 'build'), { recursive: true, force: true });
cpSync(join(root, 'public/build'), join(out, 'build'), { recursive: true });
for (const file of ['manifest.webmanifest', 'favicon.ico', 'robots.txt']) {
    if (existsSync(join(root, 'public', file))) cpSync(join(root, 'public', file), join(out, file));
}
cpSync(join(root, 'public/icons'), join(out, 'icons'), { recursive: true });
let html = readFileSync(join(root, 'resources/views/demian.blade.php'), 'utf8');
html = html.replace(/\{\{--[\s\S]*?--\}\}/g, '')
    .replace(/@vite\([\s\S]*?\)/, `${(entry.css ?? []).map((c) => `<link rel="stylesheet" href="build/${c}">`).join('\n')}\n<script type="module" src="build/${entry.file}"></script>`)
    .replace(/\{\{\s*csrf_token\(\)\s*\}\}/g, '')
    .replace(/\{\{\s*route\('characters.index'\)\s*\}\}/g, 'characters.json')
    .replace(/\{\{\s*url\('\/api\/v1\/events'\)\s*\}\}/g, 'api/v1/events');
if (/@(?:vite|php|foreach|if)|\{\{/.test(html)) throw new Error('Unsupported template directive in static export.');
writeFileSync(join(out, 'index.html'), html);
const labels = { darya: 'DARYA / دریا', tiam: 'TIAM / تیام', ronak: 'RONAK / روناک' };
writeFileSync(join(out, 'characters.json'), JSON.stringify({ data: BUILTIN_CHARACTER_SLUGS.map((slug) => ({
    id: `builtin-${slug}`, name: labels[slug], slug, is_builtin: true, is_active: slug === 'darya',
    sprite_url: `assets/characters/${slug}/${slug}-spritesheet-v${characterPackVersion(slug)}-mobile.png`,
    atlas_url: `assets/characters/${slug}/${slug}-atlas-v${characterPackVersion(slug)}-mobile.json`,
    settings: { scale: 1, walk_speed: 3.55, run_speed: 6.9, jump_force: 6.8 },
})) }, null, 2));
writeFileSync(join(out, '.nojekyll'), '');
console.log(`Static release: ${out}`);
