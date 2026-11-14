import test from 'node:test';
import assert from 'node:assert/strict';
import RankedRouteChallenge from '../../../resources/js/game/leaderboard/RankedRouteChallenge.js';
import { cafeRouteGoals, CAFE_ROUTE_LIMITS, CAFE_ROUTE_VERSIONS }
    from '../../../resources/js/game/leaderboard/CafeRouteGoalCatalog.js';

const KNOWN = ['after-hours', 'cafe-rush', 'open-world'];

test('route trial goals are stable, distinct, seeded and bounded for all three games', () => {
    assert.deepEqual(Object.keys(CAFE_ROUTE_VERSIONS), KNOWN);
    assert.deepEqual(KNOWN.map(game => CAFE_ROUTE_LIMITS[game]), [18000, 7200, 14400]);
    for (const game of KNOWN) {
        const a = cafeRouteGoals(game, 7);
        const b = cafeRouteGoals(game, 7);
        assert.deepEqual(a, b);
        assert.equal(new Set(a.map(x => x.id)).size, a.length);
        assert.ok(a.every(x => Number.isFinite(x.x) && Number.isFinite(x.z)));
    }
    assert.equal(cafeRouteGoals('after-hours', 7)[0].id, 'card-1');
    assert.equal(cafeRouteGoals('cafe-rush', 7)[0].id, 'order1-0-tickets');
    assert.deepEqual(cafeRouteGoals('open-world', 7).map(x => x.id),
        ['save-counter', 'save-lounge', 'save-arcade']);
    assert.throws(() => cafeRouteGoals('not-a-game', 1));
    assert.throws(() => cafeRouteGoals('open-world', -1));
});

test('route challenge refuses to start during pause/results and never invents an online run', async () => {
    let called = 0;
    const context = {
        app: { sessionState: 'paused' },
        services: { leaderboards: {
            startTurnRun: async () => { called++; return { mode: 'ranked' }; },
        } },
    };
    const trial = new RankedRouteChallenge({
        context, gameId: 'open-world',
        position: () => ({ x: .36, z: -4.68 }),
    });
    await trial.start();
    assert.equal(called, 0);
    context.app.sessionState = 'playing';
    context.services.leaderboards.startTurnRun = async () => {
        called++;
        return { mode: 'practice' };
    };
    await trial.start();
    assert.equal(called, 1);
    assert.equal(trial.state, 'idle');
    assert.equal(trial.run, null);
});

test('route challenge records engine coordinates and authentic checkpoints before submission', async () => {
    const goals = cafeRouteGoals('open-world', 7);
    const positions = [
        { x: .36, z: -4.68 },
        ...goals.map(goal => ({ x: goal.x, z: goal.z })),
    ];
    let position = positions[0];
    let result = null;
    const context = {
        app: { sessionState: 'playing' },
        services: { leaderboards: {
            startTurnRun: async () => ({
                mode: 'ranked', run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                game_id: 'open-world', rules_version: 'open-world-route-v2',
                seed: 7, goals,
            }),
            finishTurnRun: async (run, actions, ticks) => {
                result = { run, actions, ticks };
                return { status: 'verified', score: 7000 };
            },
        } },
    };
    const trial = new RankedRouteChallenge({
        context, gameId: 'open-world',
        position: () => position,
        onStart: async () => { position = positions[0]; },
    });
    await trial.start();
    assert.equal(trial.state, 'running');
    for (const [i, goal] of goals.entries()) {
        for (let tick = 0; tick < 35; tick++) trial.tick(1/60);
        position = positions[i+1];
        assert.equal(trial.checkpoint(goal.id), true);
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(trial.state, 'verified');
    assert.equal(result.run.seed, 7);
    assert.equal(result.actions.at(-1).kind, 'checkpoint');
    assert.equal(result.actions.at(-1).target, 'save-arcade');
    assert.equal(result.ticks, result.actions.at(-1).tick + 1);
    assert.ok(result.actions.some(a => a.kind === 'move' && a.x === 3.24));
    assert.ok(result.actions.every(a => !('score' in a)));
});

test('stale route requests cannot resurrect a disposed run', async () => {
    let release;
    const context = {
        app: { sessionState: 'playing' },
        services: { leaderboards: {
            startTurnRun: () => new Promise(resolve => { release = resolve; }),
        } },
    };
    const trial = new RankedRouteChallenge({
        context, gameId: 'after-hours',
        position: () => ({ x: -1.2, z: -6.5 }),
    });
    const pending = trial.start();
    trial.stop();
    release({ mode: 'ranked', seed: 1, game_id: 'after-hours',
        rules_version: 'after-hours-route-v1' });
    await pending;
    assert.equal(trial.run, null);
    assert.equal(trial.state, 'idle');
    assert.deepEqual(trial.actions, []);
});

test('server challenge must have the same game/version and exact seed-based goal coordinates', async () => {
    const goals = cafeRouteGoals('open-world', 7);
    const run = {
        mode: 'ranked', game_id: 'open-world',
        rules_version: CAFE_ROUTE_VERSIONS['open-world'], seed: 7,
        goals,
    };
    for (const override of [
        { rules_version: 'stale-untrusted-version' },
        { game_id: 'after-hours' },
        { seed: -1 },
        { goals: goals.map((goal, index) => index === 0
            ? { ...goal, x: goal.x + 1 } : goal) },
        { goals: undefined },
    ]) {
        const context = { app: { sessionState: 'playing' },
            services: { leaderboards: { startTurnRun: async () => ({ ...run, ...override }) } } };
        const trial = new RankedRouteChallenge({
            context, gameId: 'open-world',
            position: () => ({ x: .36, z: -4.68 }),
        });
        await trial.start();
        assert.equal(trial.state, 'idle');
        assert.equal(trial.run, null);
        assert.deepEqual(trial.actions, []);
    }
});
