import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { firstCollisionReplay } from '../../../tools/load/runner_first_collision.js';

const rules = JSON.parse(readFileSync(new URL('../../../resources/game/runner-rules.json', import.meta.url), 'utf8'));
const load = readFileSync(new URL('../../../tools/load/cpanel_50_verified_replays_staging.js', import.meta.url), 'utf8');
const view = readFileSync(new URL('../../../resources/views/demian.blade.php', import.meta.url), 'utf8');
const game = readFileSync(new URL('../../../resources/js/game/application/GameApplication.js', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../../../resources/js/app.js', import.meta.url), 'utf8');
const roster = readFileSync(new URL('../../../resources/js/game/managers/CharacterManager.js', import.meta.url), 'utf8');
const rosterPolicy = readFileSync(new URL('../../../resources/js/game/performance/CharacterRosterStartup.js', import.meta.url), 'utf8');

test('Step 30 independent staging proof generator reproduces authoritative known PHP fixtures', () => {
    const sample = [
        { seed: 7, width: 420, ticks: 65 },
        { seed: 127, width: 960, ticks: 75 },
    ];
    for (const item of sample) {
        const proof = firstCollisionReplay(rules, item.seed, item.width);
        assert.equal(proof.ticks, item.ticks, 'Replay mismatch with stored server fixture for seed '+item.seed);
        assert.deepEqual(proof.transitions, [{tick: 0, mask: 3}, {tick: 1, mask: 2}]);
        assert.deepEqual(proof, firstCollisionReplay(rules, item.seed, item.width));
    }
});

test('Step 30 varied server seeds produce finite deterministic terminal evidence with strict bounds', () => {
    for (const seed of [1, 2, 4, 8, 64, 100, 118, 9832, 65537, 2147483647, 4294967295]) {
        for (const width of [420, 960]) {
            const proof = firstCollisionReplay(rules, seed, width);
            assert.ok(proof.ticks > 1 && proof.ticks < 2000, 'No bounded collision for seed '+seed);
            assert.ok(proof.elapsedSeconds <= 34);
            assert.equal(proof.transitions.at(-1).tick, 1);
            assert.ok(proof.transitions.every(row => row.tick < proof.ticks));
        }
    }
    assert.throws(() => firstCollisionReplay(rules, 0, 420));
    assert.throws(() => firstCollisionReplay(rules, 4294967296, 420));
    assert.throws(() => firstCollisionReplay(rules, 7, 200));
});

test('Step 30 real replay load is staging only, explicitly approved and credential-isolated', () => {
    assert.match(load, /DEMIAN_REPLAY_LOAD_APPROVED/);
    assert.match(load, /DEMIAN_STAGING_IDENTITIES_FILE/);
    assert.match(load, /DEMIAN_TARGET === 'staging'/);
    assert.match(load, /vus: 50/);
    assert.match(load, /firstCollisionReplay/);
    assert.match(load, /server-replay/);
    assert.match(load, /idempotent verified replay/);
    assert.match(load, /sleep\(replay\.elapsedSeconds/);
    assert.doesNotMatch(load, /http\.del\(|http\.put\(|http\.patch\(/);
    assert.doesNotMatch(load, /console\.log\(.*token/);
});

test('Static early menu is visible before the engine and early click stays single-use', () => {
    assert.match(view, /root\.dataset\.shellScreen = 'cafe-menu'/);
    assert.match(view, /root\.dataset\.instantMenu = 'true'/);
    assert.match(view, /root\.dataset\.pendingMenuAction = action/);
    assert.match(view, /demian:menu-hydrated/);
    assert.match(game, /const instantMenu = this\.root\.dataset\.instantMenu === 'true'/);
    assert.match(entry, /const pending = managerRoot\.dataset\.pendingMenuAction/);
    assert.match(entry, /delete managerRoot\.dataset\.pendingMenuAction/);
    assert.match(rosterPolicy, /staticBuiltinsOnly/);
    assert.match(rosterPolicy, /if \(staticBuiltinsOnly\) return Promise\.resolve\(\{ characters: \[\], error: null \}\)/);
    assert.match(roster, /return preloadCharacterRoster\(repository, options\)/);
    assert.match(roster, /rosterPromise \?\? CharacterManager\.preloadRoster\(this\.repository\)/);
});
