import test from 'node:test';
import assert from 'node:assert/strict';
import { CRITTERS, CRITTER_RULES, TABLE_FIELDS, cluesFor } from '../../../resources/js/game/games/cafe-critters/CafeCrittersData.js';
import CafeCrittersModel from '../../../resources/js/game/games/cafe-critters/CafeCrittersModel.js';
import CafeCrittersGame from '../../../resources/js/game/games/cafe-critters/CafeCrittersGame.js';
import CafeCrittersStore from '../../../resources/js/game/games/cafe-critters/CafeCrittersStore.js';
import { guestIcon, tableIcon } from '../../../resources/js/game/games/cafe-critters/CafeCrittersArt.js';
import ArcadeWorld from '../../../resources/js/game/world/ArcadeWorld.js';
import { createCafeGround } from '../../../resources/js/game/shared/cafe/CafeGround.js';
import { CAFE_CHARACTER_SPAWNS } from '../../../resources/js/game/shared/cafe/CafeWalkthroughScene.js';
import { CONTROL_LAYOUTS } from '../../../resources/js/game/controls/ControlLayoutService.js';

function arrange(model, settings) {
    for (const [field, option] of Object.entries(settings)) model.select(field, option);
}

function inviteGuest(model) {
    arrange(model, model.guest.setting);
    const visit = model.invite();
    assert.equal(visit.type, 'discovery');
    return visit;
}

test('eight individually illustrated guests have unique solutions using the agreed option counts', () => {
    assert.equal(CRITTERS.length, 8);
    assert.deepEqual(TABLE_FIELDS.map((field) => Object.keys(field.options).length), [2, 3, 3]);
    const signatures = new Set();
    const souvenirs = new Set();
    for (const guest of CRITTERS) {
        const signature = TABLE_FIELDS.map((field) => {
            const value = guest.setting[field.id];
            assert.ok(Object.hasOwn(field.options, value));
            assert.match(tableIcon(value), /<path|<circle/);
            return value;
        }).join('/');
        assert.match(guestIcon(guest.id), /<path/);
        signatures.add(signature);
        souvenirs.add(guest.souvenir);
    }
    assert.equal(signatures.size, 8);
    assert.equal(souvenirs.size, 8);
    assert.deepEqual(CRITTERS[0].setting, { light: 'moon', food: 'cardamom', decor: 'vase' });
});

test('the three difficulty grades use direct, behavioral and combined clues', () => {
    const guest = CRITTERS[0];
    assert.deepEqual(Object.values(CRITTER_RULES).filter(({ seconds }) => seconds !== null).map(({ level, seconds }) => [level, seconds]), [[2, 300], [4, 240], [6, 180]]);
    assert.match(cluesFor(guest, 'easy').journal, /مهتاب، هل و گلدان/);
    assert.match(cluesFor(guest, 'standard').journal, /مهتاب.*هل/);
    assert.doesNotMatch(cluesFor(guest, 'standard').journal, /گلدان/);
    assert.equal(cluesFor(guest, 'standard').pishi, guest.decorClue);
    assert.equal(cluesFor(guest, 'hard').journal, guest.lightClue);
    assert.deepEqual(cluesFor(guest, 'hard').art, ['cardamom', 'vase']);
});

test('the entry guide freezes the clock, selection and invites until the turn starts', () => {
    const model = new CafeCrittersModel('standard');
    model.advance(60);
    assert.equal(model.remaining, 240);
    assert.equal(model.select('light', 'moon'), false);
    assert.equal(model.invite(), null);
    model.start();
    model.advance(1);
    assert.equal(model.remaining, 239);
});

test('partial or invalid table settings cannot submit an invitation', () => {
    const model = new CafeCrittersModel();
    model.start();
    assert.equal(model.select('light', 'night'), false);
    assert.equal(model.select('other', 'sun'), false);
    assert.equal(model.select('light', 'moon'), true);
    assert.equal(model.select('light', 'moon'), false);
    assert.equal(model.canInvite, false);
    assert.equal(model.invite(), null);
    assert.equal(model.result().misses, 0);
});

test('two distinct misses reveal one accurate component and duplicate guesses do not count', () => {
    const model = new CafeCrittersModel('hard');
    model.start();
    arrange(model, { light: 'sun', food: 'cardamom', decor: 'book' });
    assert.deepEqual(model.invite(), { type: 'miss', matches: 1 });
    assert.equal(model.hint, null);
    assert.deepEqual(model.invite(), { type: 'repeat' });
    assert.equal(model.hint, null);
    assert.equal(model.misses, 1);
    model.select('light', 'moon');
    assert.deepEqual(model.invite(), { type: 'miss', matches: 2 });
    assert.deepEqual(model.hint, { field: 'decor', value: 'vase' });
    assert.equal(inviteGuest(model).guest.id, 'hali');
    assert.equal(model.next(), true);
    assert.equal(model.hint, null);
    assert.equal(model.attempts.size, 0);
});

test('a visiting guest freezes the turn, cannot be counted twice and gives a lasting souvenir', () => {
    const model = new CafeCrittersModel('standard');
    model.start();
    assert.equal(inviteGuest(model).first, true);
    assert.equal(model.guest.souvenir, 'مهر برگ نقره‌ای');
    assert.equal(model.invite(), null);
    assert.equal(model.select('light', 'sun'), false);
    model.advance(40);
    assert.equal(model.remaining, 240);
    assert.equal(model.result().newPages, 1);
    assert.equal(model.next(), true);
    assert.equal(model.guest.id, 'rosha');
});

test('time expires at the selected limit and retains discoveries from the incomplete turn', () => {
    const model = new CafeCrittersModel('hard');
    model.start();
    inviteGuest(model);
    model.next();
    model.advance(Number.NaN);
    model.advance(-2);
    assert.equal(model.remaining, 180);
    model.advance(179.99);
    assert.equal(model.status, 'playing');
    model.advance(1 / 60);
    assert.equal(model.remaining, 0);
    assert.deepEqual(model.result(), { won: false, found: 1, goal: 3, discovered: 1, newPages: 1, misses: 0 });
});

for (const difficulty of Object.keys(CRITTER_RULES)) {
    test(`${difficulty} can complete all eight pages in three turns and replays do not duplicate souvenirs`, () => {
        let known = [];
        for (const goal of [3, 3, 2]) {
            const model = new CafeCrittersModel(difficulty, known);
            model.start();
            assert.equal(model.targets.length, goal);
            while (model.status === 'playing') {
                assert.equal(inviteGuest(model).first, true);
                model.next();
            }
            assert.equal(model.result().won, true);
            assert.equal(model.result().newPages, goal);
            known = [...model.album];
        }
        assert.deepEqual(known, CRITTERS.map(({ id }) => id));
        const replay = new CafeCrittersModel(difficulty, known, 6);
        replay.start();
        assert.deepEqual(replay.targets.map(({ id }) => id), ['danerou', 'abri', 'hali']);
        assert.equal(inviteGuest(replay).first, false);
        assert.equal(replay.result().newPages, 0);
        assert.equal(replay.result().discovered, 8);
    });
}

test('guide preference, grade and per-visitor saves stay independent across sessions', () => {
    const values = new Map([['demian.after-hours.v1.guide', 'hidden']]);
    const storage = () => ({
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    });
    const first = new CafeCrittersStore(storage);
    const second = new CafeCrittersStore(storage);
    assert.equal(first.showGuide, true);
    first.saveEntry('hard', true);
    first.record('hali');
    second.record('abri');
    second.record('unknown');
    assert.deepEqual(first.discoveries(), ['hali', 'abri']);
    assert.equal(second.difficulty, 'hard');
    assert.equal(second.showGuide, false);
    assert.equal(values.get('demian.after-hours.v1.guide'), 'hidden');
});

test('unavailable storage keeps progress for this page visit', () => {
    const store = new CafeCrittersStore(() => { throw new Error('storage blocked'); });
    store.saveEntry('easy', true);
    store.record('hali');
    assert.equal(store.difficulty, 'easy');
    assert.equal(store.showGuide, false);
    assert.deepEqual(store.discoveries(), ['hali']);
});

test('the Open World entrance is visible from the canonical aisle and uses puzzle controls', (t) => {
    const world = new ArcadeWorld({});
    const player = CAFE_CHARACTER_SPAWNS[0];
    const ground = createCafeGround({ bounds: { minX: -14, maxX: 14, minZ: -28, maxZ: 0 }, radius: .64, actors: { player }, owner: 'critters-test' });
    t.after(() => { world.dispose(); ground.dispose(); });
    const entry = world.cabinets.find(({ gameId }) => gameId === 'cafe-critters');
    assert.equal(ground.canStand(entry.interaction), true);
    assert.equal(ground.canSee(player, entry.interaction), true);
    assert.ok(ground.grid.findPath(player, entry.interaction).length);
    assert.equal(CONTROL_LAYOUTS.CAFE_CRITTERS.joystick, false);
});

test('calm mode preserves discovery and never times out', () => {
    const model = new CafeCrittersModel('calm');
    model.start();
    model.advance(720);
    assert.equal(model.status, 'playing');
    assert.equal(model.remaining, null);
    assert.deepEqual(cluesFor(model.guest, 'calm'), cluesFor(model.guest, 'easy'));
    while (model.status !== 'finished') {
        inviteGuest(model);
        model.next();
    }
    assert.equal(model.result().won, true);
    assert.equal(model.album.size, model.targets.length);
});

test('all eight guests have readable unambiguous clues in each difficulty', () => {
    const signatures = new Set();
    for (const guest of CRITTERS) {
        const easy = cluesFor(guest, 'easy');
        const standard = cluesFor(guest, 'standard');
        const hard = cluesFor(guest, 'hard');
        const signature = TABLE_FIELDS.map(field => guest.setting[field.id]).join('/');
        assert.equal(signatures.has(signature), false, guest.id);
        signatures.add(signature);
        assert.ok(guest.behavior.length >= 10);
        assert.ok(guest.lightClue.length >= 10);
        assert.ok(guest.decorClue.length >= 10);
        assert.ok(guest.souvenir.length >= 3);
        for (const field of TABLE_FIELDS) {
            assert.ok(Object.hasOwn(field.options, guest.setting[field.id]), guest.id);
            assert.match(easy.journal, new RegExp(field.options[guest.setting[field.id]]));
        }
        assert.match(standard.journal, /نور/);
        assert.equal(standard.pishi, guest.decorClue);
        assert.equal(hard.journal, guest.lightClue);
        assert.deepEqual(hard.art, [guest.setting.food, guest.setting.decor]);
    }
    assert.equal(signatures.size, 8);
});

test('exact hint is a single stable reward; repeated misses cannot reveal the whole answer', () => {
    const model = new CafeCrittersModel('hard');
    model.start();
    arrange(model, { light: 'sun', food: 'berries', decor: 'book' });
    assert.equal(model.invite().type, 'miss');
    model.select('light', 'moon');
    assert.equal(model.invite().type, 'miss');
    const hint = { ...model.hint };
    assert.ok(hint.field && hint.value);
    const tried = new Set();
    for (const light of ['sun', 'moon']) {
        for (const food of ['cardamom', 'berries', 'seeds']) {
            for (const decor of ['vase', 'book', 'ribbon']) {
                const setting = { light, food, decor };
                if (TABLE_FIELDS.every(field => setting[field.id] === model.guest.setting[field.id])) continue;
                for (const field of TABLE_FIELDS) {
                    if (model.selection[field.id] !== setting[field.id]) {
                        model.select(field.id, setting[field.id]);
                    }
                }
                const result = model.invite();
                assert.ok(['miss', 'repeat'].includes(result.type));
                assert.deepEqual(model.hint, hint);
                tried.add(TABLE_FIELDS.map(field => setting[field.id]).join('/'));
            }
        }
    }
    assert.ok(tried.size >= 15);
    assert.deepEqual(model.hint, hint);
    assert.equal(model.status, 'playing');
    arrange(model, model.guest.setting);
    assert.equal(model.invite().type, 'discovery');
    assert.equal(model.next(), true);
    assert.equal(model.hint, null);
});

test('malformed or failed ranked startup falls back to unranked practice without losing puzzle', async () => {
    for (const backend of [
        { startTurnRun: async () => { throw new Error('network unavailable'); } },
        { startTurnRun: async () => ({
            mode: 'ranked', game_id: 'cafe-critters', rules_version: 'old-version',
            seed: 7, run_id: '11111111-1111-1111-1111-111111111111',
        }) },
        { startTurnRun: async () => ({
            mode: 'ranked', game_id: 'cafe-critters', rules_version: 'cafe-critters-replay-v1',
            seed: -2, run_id: '11111111-1111-1111-1111-111111111111',
        }) },
    ]) {
        const game = new CafeCrittersGame();
        let updates = 0;
        game.context = { services: { leaderboards: backend },
            app: { shell: { toast: () => { throw Error('ranked toast must not run'); } } } };
        game.ui = { update: () => { updates++; },
            focusChoice: () => {}, dialog: { open: false } };
        await game.beginRound('standard', []);
        assert.equal(game.rankRun.mode, 'practice');
        assert.equal(game.model.status, 'playing');
        assert.equal(game.model.targets.length, 3);
        assert.equal(game.rankActions.length, 0);
        assert.equal(updates, 1);
        game.audio.dispose();
    }
});

test('a stale asynchronous ranked session cannot replace a new local play', async () => {
    let resolveResponse;
    const pending = new Promise(resolve => { resolveResponse = resolve; });
    const game = new CafeCrittersGame();
    game.context = {
        services: { leaderboards: { startTurnRun: () => pending } },
        app: { shell: { toast: () => {} } },
    };
    game.ui = { update: () => {}, focusChoice: () => {}, dialog: { open: false } };
    const oldStart = game.beginRound('standard', []);
    // A new session or exit invalidates the asynchronous server response.
    game.sessionNonce++;
    await game.beginRound('hard', []);
    resolveResponse({
        mode: 'ranked', game_id: 'cafe-critters', rules_version: 'cafe-critters-replay-v1',
        seed: 7, run_id: '11111111-1111-1111-1111-111111111111',
    });
    await oldStart;
    assert.equal(game.model.status, 'playing');
    assert.equal(game.model.difficulty, 'hard');
    assert.equal(game.rankRun.mode, 'practice');
    game.audio.dispose();
});

test('timeout and completed pages are terminal; no late action can add discoveries', () => {
    const model = new CafeCrittersModel('hard');
    model.start();
    inviteGuest(model);
    model.next();
    model.advance(180);
    const result = model.result();
    assert.equal(model.status, 'finished');
    assert.equal(result.found, 1);
    assert.equal(model.canInvite, false);
    assert.equal(model.invite(), null);
    assert.equal(model.select('light', 'moon'), false);
    assert.equal(model.next(), false);
    model.advance(90);
    assert.deepEqual(model.result(), result);
});
