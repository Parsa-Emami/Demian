import assert from 'node:assert/strict';
import test from 'node:test';
import { weeklyIndex, weeklyVersion, runnerWeek, weeklyShiftCards, weeklyRushOrder, weeklyWorldRoute } from '../../../resources/js/game/content/WeeklyContent.js';
import { BUILTIN_CHARACTER_SLUGS } from '../../../resources/js/game/characters/CharacterVisualContract.js';
import { RUNNER_CONFIG } from '../../../resources/js/game/games/dino-run/DinoRunModel.js';
import { weeklyCritters, cluesFor, TABLE_FIELDS } from '../../../resources/js/game/games/cafe-critters/CafeCrittersData.js';
import { weeklyCoffeeLevels } from '../../../resources/js/game/games/coffee-crash/CoffeeCrashData.js';
import CoffeeCrashModel, { findRuns } from '../../../resources/js/game/games/coffee-crash/CoffeeCrashModel.js';
import CoffeeCrashStore from '../../../resources/js/game/games/coffee-crash/CoffeeCrashStore.js';
import CafeRushModel from '../../../resources/js/game/games/cafe-rush/CafeRushModel.js';
import { createShiftTerrain, SHIFT_START } from '../../../resources/js/game/games/after-hours/AfterHoursMap.js';
import { RUSH_SPOTS } from '../../../resources/js/game/games/cafe-rush/CafeRushMap.js';
import PixelCamera2D from '../../../resources/js/game/rendering2d/PixelCamera2D.js';
import { formatGameRecord, recordHeading } from '../../../resources/js/game/leaderboard/GameRecord.js';
import ArcadeLeaderboardService from '../../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';
import { DEMIAN_REFERENCE_CAFE_MANIFEST } from '../../../resources/js/game/games/open-world/data/DemianReferenceCafeManifest.js';

const weeks = Array.from({ length: 106 }, (_, index) => index);
const key = value => JSON.stringify(value);

test('weekly content changes Saturday at midnight Tehran and uses distinct game profiles for 106 weeks', () => {
    assert.equal(weeklyIndex('2026-11-27T23:59:59+03:30'), 0);
    assert.equal(weeklyIndex('2026-11-28T00:00:00+03:30'), 1);
    assert.equal(weeklyVersion('dino-run', 'old', '2026-11-20T20:29:59Z'), 'old');
    assert.notEqual(weeklyVersion('dino-run', 'old', '2026-11-20T20:30:00Z'), 'old');
    const runner = weeks.map(week => runnerWeek(RUNNER_CONFIG, week, 'darya'));
    assert.equal(new Set(runner.map(key)).size, weeks.length);
    assert.equal(new Set(runner.slice(0, 53).map(rules => key(rules.obstacleCatalog))).size, 53);
    for (const character of BUILTIN_CHARACTER_SLUGS) {
        const casts = weeks.slice(0, 53).map(week => runnerWeek(RUNNER_CONFIG, week, character).attackers);
        assert.equal(new Set(casts.map(key)).size, 53);
        assert.ok(casts.every(pair => pair.length === 2 && !pair.includes(character)));
    }
    assert.equal(new Set(weeks.map(week => key(weeklyShiftCards(week)))).size, weeks.length);
    assert.equal(new Set(weeks.map(week => key(Array.from({ length: 6 }, (_, i) => weeklyRushOrder(week, i))))).size, weeks.length);
    assert.equal(new Set(weeks.map(week => key(weeklyWorldRoute(week)))).size, weeks.length);
    const ground = createShiftTerrain();
    for (const point of new Map(weeks.flatMap(weeklyShiftCards).map(point => [key(point), point])).values()) {
        assert.ok(ground.canStand(point), key(point));
        assert.ok(ground.grid.findPath(SHIFT_START, point, { smooth: false }).length > 1, key(point));
    }
    for (const goal of weeks.flatMap(weeklyWorldRoute)) {
        const point = DEMIAN_REFERENCE_CAFE_MANIFEST.savePoints.find(candidate => candidate.id === goal.id);
        assert.deepEqual(point.position, { x: goal.x, z: goal.z });
    }
});

test('1,000 distinct clue packs have real guest art, valid answers and matching clue descriptions', () => {
    const packs = Array.from({ length: 1000 }, (_, week) => weeklyCritters(week));
    assert.equal(new Set(packs.map(pack => key(pack.map(guest => [guest.id, guest.setting])))).size, 1000);
    for (const pack of packs) {
        assert.equal(new Set(pack.map(guest => guest.id)).size, 3);
        for (const guest of pack) {
            for (const { id, options } of TABLE_FIELDS) assert.ok(Object.hasOwn(options, guest.setting[id]));
            const hard = cluesFor(guest, 'hard');
            assert.deepEqual(hard.art, [guest.setting.food, guest.setting.decor]);
            assert.match(hard.journal, guest.setting.light === 'sun' ? /روز/ : /شب/);
            assert.equal(cluesFor(guest, 'standard').pishi, guest.decorClue);
        }
    }
});

test('all 318 Coffee Crash boards are distinct, playable and solvable within the stage move limit', () => {
    const boards = new Set();
    const seeds = new Set();
    for (const week of weeks) {
        const levels = weeklyCoffeeLevels(week);
        assert.deepEqual(levels.map(level => level.id), [1, 2, 3]);
        for (const stage of levels) {
            const model = new CoffeeCrashModel(stage.id, levels);
            assert.equal(findRuns(model.board).length, 0);
            boards.add(model.board.map(tile => tile.type).join(''));
            seeds.add(stage.seed);
            for (let step = 0; step < stage.moves && model.status === 'playing'; step++) {
                const move = model.findMove();
                assert.ok(move, `${week}:${stage.id}`);
                assert.ok(model.swap(...move).accepted);
            }
            assert.equal(model.status, 'won', `${week}:${stage.id}`);
        }
    }
    assert.equal(boards.size, 318);
    assert.equal(seeds.size, 318);
});

test('weekly puzzle progress is isolated and the leaderboard reads only the chosen game', async () => {
    const map = new Map();
    const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
    const store = new CoffeeCrashStore(storage, { week: 1, levels: weeklyCoffeeLevels(1) });
    store.record({ status: 'won', level: { id: 3 }, score: 360, stars: 2 });
    assert.equal(store.records[3].score, 360);
    assert.deepEqual(new CoffeeCrashStore(storage, { week: 2, levels: weeklyCoffeeLevels(2) }).records, {});
    const boards = new ArcadeLeaderboardService({ storage, baseUrl: '' });
    boards.recordDevice('cafe-critters', { ticks: 725 });
    boards.recordDevice('cafe-critters', { ticks: 610 });
    boards.recordDevice('cafe-rush', { passed: 3, score: 325 });
    boards.recordDevice('coffee-crash', { score: NaN });
    assert.deepEqual((await boards.list('device', 'cafe-critters')).data.map(row => row.ticks), [610, 725]);
    assert.deepEqual((await boards.list('device', 'cafe-rush')).data.map(row => row.passed), [3]);
    assert.deepEqual((await boards.list('device', 'coffee-crash')).data, []);
    await boards.finish({ mode: 'practice' }, { score: 120 }, null, 'darya');
    boards.recordDevice('coffee-crash', { score: 360, stage: 3 });
    boards.recordDevice('after-hours', { ticks: 600, score: 1800 });
    boards.recordDevice('open-world', { ticks: 1200, passed: 4 });
    const headings = {
        'dino-run': ['امتیاز', '۱۲۰'],
        'cafe-critters': ['زمان حل سرنخ‌ها', '۰۰:۱۰٫۱'],
        'cafe-rush': ['تحویل سفارش', '۳ سفارش · ۳۲۵ امتیاز'],
        'coffee-crash': ['امتیاز', '۳۶۰ · مرحلهٔ ۳'],
        'after-hours': ['زمان خروج', '۰۰:۱۰٫۰'],
        'open-world': ['زمان مسیر', '۰۰:۲۰٫۰'],
    };
    for (const [game, [heading, value]] of Object.entries(headings)) {
        const { data: [best] } = await boards.list('device', game);
        assert.equal(recordHeading(game, 'device'), heading);
        assert.equal(formatGameRecord(game, best), value);
    }
    assert.equal(formatGameRecord('after-hours', { ticks: NaN }), '—');
    assert.equal(formatGameRecord('after-hours', { ticks: 600, score: 1800 }, 'after-hours-frames-v2', 'online'), '۰۰:۱۰٫۰ · ۱٬۸۰۰ امتیاز');
});

test('Rush gives the ticket, drink and pastry stations more reach while walls and table range still apply', () => {
    const model = new CafeRushModel();
    for (const spot of RUSH_SPOTS.filter(spot => spot.kind !== 'table')) {
        model.reset('standard', 0, { assisted: true });
        model.player.position = { x: spot.x - 2.8, z: spot.z };
        model.ground.canSee = () => true;
        assert.equal(model.nearby()?.id, spot.id);
        model.ground.canSee = () => false;
        assert.equal(model.nearby(), null);
        model.ground.canSee = () => true;
        model.assisted = false;
        assert.notEqual(model.nearby()?.id, spot.id);
    }
    model.assisted = true;
    model.player.position = { x: -5, z: -43.4 };
    assert.equal(model.nearby()?.id, 'table-2');
    model.player.position = { x: -5.7, z: -43.4 };
    assert.equal(model.nearby(), null);
});

test('After Hours camera reserves measured overlay space while preserving world projection', () => {
    const camera = new PixelCamera2D({ bounds: { minX: -16, maxX: 16, minZ: -80, maxZ: 0 },
        viewportWidth: 390, viewportHeight: 844, pixelsPerUnit: 12, pixelSnap: false });
    camera.setVerticalInsets(230, 110).jumpTo({ x: 0, z: -78 });
    const point = { x: 0, z: -77 };
    const projected = camera.worldToScreen(point);
    assert.ok(projected.y >= 230 && projected.y <= 734);
    assert.deepEqual(camera.screenToWorld(projected), point);
});
