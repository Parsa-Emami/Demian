import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { MASTER_MOTION, MOTION_CHARACTERS, motionFamily } from '../resources/js/game/characters/motion/MasterMotionLibrary.js';

const root = resolve(import.meta.dirname, '..');
const write = (path, value) => writeFileSync(resolve(root, path), JSON.stringify(value, null, 2) + '\n');
assert.equal(new Set(MOTION_CHARACTERS.map(entry => entry.slug)).size, 12);
assert(MOTION_CHARACTERS.every(entry => motionFamily(entry.family)));
const source = readFileSync(resolve(root, 'resources/game/character-motion.json'));
const hash = createHash('sha256').update(source).digest('hex');
write('public/assets/characters/master-motion-v1.json', { ...MASTER_MOTION, sourceSha256: hash });
const rosterPath = 'public/assets/characters/character-manifest-v4.json';
const roster = JSON.parse(readFileSync(resolve(root, rosterPath), 'utf8'));
roster.master_motion = { version: MASTER_MOTION.version, source_sha256: hash, url: 'assets/characters/master-motion-v1.json' };
for (const definition of MOTION_CHARACTERS) {
    const entry = roster.characters.find(item => item.slug === definition.slug);
    assert(entry, `Missing roster entry: ${definition.slug}`);
    entry.motion_family = definition.family;
    entry.master_skin = { version: MASTER_MOTION.rollout.art, url: `assets/characters/master-skins-v2/${definition.slug}/runtime.json` };
    entry.motion_accessories = definition.accessories;
    const path = `public/assets/characters/${definition.slug}/manifests/${definition.slug}_motion_profile.json`;
    const profile = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
    profile.master_motion = { version: MASTER_MOTION.version, rig_version: MASTER_MOTION.rigVersion,
        family: definition.family, source_sha256: hash, art_status: MASTER_MOTION.rollout.art,
        accessories: definition.accessories };
    write(path, profile);
}
write(rosterPath, roster);
console.log(`Master motion compiled: ${MOTION_CHARACTERS.length} characters, 2 families, ${hash.slice(0, 12)}`);

const artSource = readFileSync(resolve(root, 'resources/game/art-direction.json'));
write('public/assets/environments/art-direction-v1.json', { ...JSON.parse(artSource), sourceSha256: createHash('sha256').update(artSource).digest('hex') });
