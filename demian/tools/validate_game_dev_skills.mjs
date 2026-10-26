import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '../..');
const lock = JSON.parse(await readFile(resolve(root, 'third_party/game-dev-skills/skills-lock.json'), 'utf8'));
assert.equal(lock.repository, 'https://github.com/gamedev-skills/awesome-gamedev-agent-skills');
assert.match(lock.commit, /^[a-f0-9]{40}$/); assert.equal(lock.license, 'Apache-2.0'); assert.equal(lock.skillCount, 77);
let count = 0; const paths = new Set();
for (const file of lock.files) {
    assert.ok(file.path.startsWith('.agents/skills/') && !file.path.includes('..')); assert.ok(!paths.has(file.path)); paths.add(file.path);
    const data = await readFile(resolve(root, file.path)); assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256, file.path);
    if (file.path.endsWith('/SKILL.md')) count++;
}
assert.equal(count, lock.skillCount); assert.ok(paths.has('.agents/skills/router/SKILL.md'));
for (const name of ['LICENSE', 'NOTICE']) assert.ok((await readFile(resolve(root, 'third_party/game-dev-skills', name))).length > 0);
assert.ok((await readFile(resolve(root, 'AGENTS.md'), 'utf8')).includes('.agents/skills/router/SKILL.md'));
console.log(`Verified ${count} skills and ${paths.size} pinned files at ${lock.commit}.`);
