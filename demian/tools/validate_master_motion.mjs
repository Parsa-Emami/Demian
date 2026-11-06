import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { MASTER_MOTION, MOTION_CHARACTERS, sampleMasterPose } from '../resources/js/game/characters/motion/MasterMotionLibrary.js';

const root = resolve(import.meta.dirname, '..');
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const hash = createHash('sha256').update(readFileSync(resolve(root, 'resources/game/character-motion.json'))).digest('hex');
const published = read('public/assets/characters/master-motion-v1.json');
assert.equal(published.sourceSha256, hash, 'Recompile the published motion contract');
assert.equal(published.version, MASTER_MOTION.version);
const roster = read('public/assets/characters/character-manifest-v4.json');
for (const entry of MOTION_CHARACTERS) {
    const profile = read(`public/assets/characters/${entry.slug}/manifests/${entry.slug}_motion_profile.json`);
    assert.equal(profile.master_motion.source_sha256, hash);
    assert.equal(profile.master_motion.family, entry.family);
    assert.equal(roster.characters.find(item => item.slug === entry.slug).motion_family, entry.family);
    assert.equal(profile.master_motion.art_status, 'authored-atlas');
    for (const state of ['idle', 'walk', 'run', 'sprint', 'takeoff', 'jump', 'fall', 'land', 'slide']) {
        for (let i = 0; i <= 48; i++) {
            const pose = sampleMasterPose(entry.family, { state, phase: i / 48, progress: i / 48 });
            assert(Object.values(pose.joints).every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), `${entry.slug}/${state}`);
        }
    }
}
const view = readFileSync(resolve(root, 'resources/views/demian.blade.php'), 'utf8');
assert(view.includes('class="boot-console__logo"'));
assert(view.includes('href="assets/environments/cafe-runner-v1/wordmark.png" fetchpriority="high"'));
assert(!view.includes('class="boot-console__mark"'));
assert(view.includes('data-screen="motion-comparison"'));
assert(view.includes('data-shell-action="motion-comparison"'));
console.log('Master motion validation passed: 12 characters, 2 families, shared rig, compiled profiles and branded boot.');
