import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, symlinkSync,
  readFileSync, existsSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const script = new URL('../../../ops/cpanel/package_release.sh', import.meta.url).pathname;
const release = 'c'.repeat(40);
const runtimeFiles = [
  'artisan', 'public/index.php', 'public/.htaccess',
  'vendor/autoload.php', 'resources/legal/policy.json',
  'resources/js/game/games/cafe-drift/CafeDriftModel.js',
  'resources/js/game/games/cafe-drift/CafeDriftGame.js',
  'resources/js/game/games/cafe-drift/CafeDriftRenderer.js',
  'resources/css/cafe-drift.css',
  'ops/cpanel/host_preflight.php', 'ops/cpanel/cron.sh',
  'ops/cpanel/rollback.sh', 'ops/cpanel/backup_offsite.sh',
  'ops/cpanel/restore_drill.sh', 'ops/cpanel/staging_acceptance.sh', 'ops/cpanel/install_webroot_bridge.php',
  'composer.json', 'composer.lock',
];
const dirs = [
  'app', 'bootstrap/cache', 'config', 'database', 'routes',
  'resources/game', 'resources/legal', 'resources/views', 'src', 'vendor',
];
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'demian-pr06-'));
  const workspace = join(home, 'api');
  const output = join(home, 'artifact');
  for (const dir of dirs) mkdirSync(join(workspace, dir), { recursive: true });
  mkdirSync(output);
  for (const entry of runtimeFiles) {
    const path = join(workspace, entry);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, 'safe fixture\n');
  }
  writeFileSync(join(workspace, 'bootstrap/cache/config.php'), 'should not ship');
  return {
    home, workspace, output,
    run: (sha = release) => spawnSync('bash', [script, output, sha], {
      cwd: workspace, encoding: 'utf8', timeout: 20000,
    }),
    dispose: () => rmSync(home, { recursive: true, force: true }),
  };
}
test('PR06 package is content-addressed, backend-only and tied to exact commit', () => {
  const f = fixture();
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const tar = join(f.output, 'demian-cpanel.tar.gz');
    const manifest = JSON.parse(readFileSync(join(f.output, 'demian-cpanel.manifest.json')));
    const digest = createHash('sha256').update(readFileSync(tar)).digest('hex');
    assert.equal(readFileSync(join(f.output, 'demian-cpanel.sha256'), 'utf8').trim(), digest);
    assert.equal(manifest.commit, release);
    assert.equal(manifest.archiveSha256, digest);
    assert.equal(manifest.productionAuthorized, false);
    assert.equal(manifest.hostDeployed, false);
    const listing = spawnSync('tar', ['-tzf', tar], { encoding: 'utf8' });
    assert.equal(listing.status, 0, listing.stderr);
    for (const name of runtimeFiles) assert.ok(listing.stdout.split('\n').includes(name), name);
    assert.doesNotMatch(listing.stdout, /bootstrap\/cache\/config\.php|\.env|node_modules|storage\/logs/);
  } finally { f.dispose(); }
});
test('PR06 refuses missing required files before publishing an artifact', () => {
  const f = fixture();
  try {
    rmSync(join(f.workspace, 'vendor/autoload.php'));
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(f.output, 'demian-cpanel.tar.gz')), false);
  } finally { f.dispose(); }
});
test('PR06 refuses any source .env even when not in explicit package allowlist', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.workspace, '.env'), 'APP_KEY=private');
    assert.notEqual(f.run().status, 0);
    assert.equal(existsSync(join(f.output, 'demian-cpanel.manifest.json')), false);
  } finally { f.dispose(); }
});
test('PR06 rejects a symlink in transitive Composer runtime and does not emit release', () => {
  const f = fixture();
  try {
    symlinkSync('autoload.php', join(f.workspace, 'vendor', 'insecure-link'));
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /symlink|special|linked/i);
    assert.equal(existsSync(join(f.output, 'demian-cpanel.tar.gz')), false);
  } finally { f.dispose(); }
});
test('PR06 refuses invalid source identity', () => {
  const f = fixture();
  try {
    assert.notEqual(f.run('not-a-real-sha').status, 0);
    assert.equal(existsSync(join(f.output, 'demian-cpanel.tar.gz')), false);
  } finally { f.dispose(); }
});
