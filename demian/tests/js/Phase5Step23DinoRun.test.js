import test from 'node:test';
import assert from 'node:assert/strict';
import DinoRunGame from '../../resources/js/game/games/dino-run/DinoRunGame.js';
import DinoRunModel, { RUNNER_CONFIG } from '../../resources/js/game/games/dino-run/DinoRunModel.js';
import RunnerReplay, { runnerInputFromMask } from '../../resources/js/game/games/dino-run/RunnerReplay.js';
import ArcadeLeaderboardService from '../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';
import { validRunnerSession } from '../../resources/js/game/leaderboard/RunnerSessionContract.js';

const UUID = 'ff21ba26-46bc-437f-b6be-bb9bb5530c73';
const good = (width = 420) => ({
    run_id: UUID, seed: 4294967295, track_width: width,
    rules_version: RUNNER_CONFIG.version, expires_at: '2026-11-16T10:00:00Z',
});
const memory = () => {
    const data = new Map();
    return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test('Step 23 rejects every invalid field of a ranked runner response before using it', () => {
    assert.equal(validRunnerSession(good(), 420), true);
    assert.equal(validRunnerSession(good(2560), 2560), true);
    const invalid = [
        null, {}, { ...good(), run_id: 'not-a-uuid' },
        { ...good(), seed: 0 }, { ...good(), seed: 4294967296 },
        { ...good(), seed: -1 }, { ...good(), seed: 1.5 }, { ...good(), seed: '5' },
        { ...good(), track_width: 419 }, { ...good(), track_width: 420.5 },
        { ...good(), track_width: '420' },
        { ...good(), rules_version: 'cafe-runner-v1' },
        { ...good(), expires_at: 'invalid' }, { ...good(), expires_at: null },
    ];
    for (const value of invalid) {
        assert.equal(validRunnerSession(value, 420), false, JSON.stringify(value));
    }
    assert.equal(validRunnerSession(good(420), 0), false);
    assert.equal(validRunnerSession(good(420), 2561), false);
});

test('Step 23 online handshake only promotes fully validated server-issued rounds', async () => {
    let response = good();
    let requests = 0;
    const leaderboard = new ArcadeLeaderboardService({
        baseUrl: 'https://api.test/api/v1/arcade', storage: memory(),
        fetcher: async () => {
            requests++;
            return { ok: true, status: 201, json: async () => response };
        },
    });
    leaderboard.identity = { player_id: UUID, token: 'x'.repeat(64) };
    const valid = await leaderboard.start({ width: 420, character: 'darya' });
    assert.equal(valid.mode, 'ranked');
    assert.equal(valid.run_id, UUID);
    response = { ...good(), seed: '4294967295' };
    const rejected = await leaderboard.start({ width: 420, character: 'darya' });
    assert.equal(rejected.mode, 'practice');
    assert.equal(rejected.track_width, 420);
    assert.ok(Number.isFinite(rejected.seed));
    assert.equal(leaderboard.pending, null);
    assert.equal(requests, 2);
    const forcedPractice = await leaderboard.start({ width: 420, character: 'darya', seed: 127 });
    assert.equal(forcedPractice.mode, 'practice');
    assert.equal(requests, 2);
});

test('Step 23 rendering fields track only model state, never change score or replay', () => {
    const game = new DinoRunGame();
    const node = () => ({ textContent: '' });
    game.hud = {};
    game.ready = { hidden: false };
    game.threat = { hidden: true, dataset: {}, textContent: '' };
    game.scoreNode = node();
    game.bestNode = node();
    game.timeNode = node();
    game.passedNode = node();
    game.best = 800;
    game.model.status = 'running';
    game.model.time = 12.9;
    game.model.score = 395;
    game.model.passed = 4;
    game.model.obstacles = [];
    game.updateHud();
    assert.equal(game.timeNode.textContent, new Intl.NumberFormat('fa-IR').format(12));
    assert.equal(game.passedNode.textContent, new Intl.NumberFormat('fa-IR').format(4));
    assert.equal(game.model.score, 395);
    assert.equal(game.model.tick, 0);
    game.lessonStep = 'jump';
    game.updateHud();
    assert.equal(game.passedNode.textContent, new Intl.NumberFormat('fa-IR').format(0));
    assert.equal(game.scoreNode.textContent, new Intl.NumberFormat('fa-IR', {
        useGrouping: false, minimumIntegerDigits: 5,
    }).format(0));
    assert.equal(game.model.passed, 4);
});

test('Step 23 replay verification inputs remain deterministic across legal widths', () => {
    for (const width of [420, 960, 2560]) {
        const a = new DinoRunModel({ seed: 127, width });
        const b = new DinoRunModel({ seed: 127, width });
        const proof = new RunnerReplay();
        for (let tick = 0; tick < 90; tick++) {
            const input = { jump: tick === 0, jumpHeld: tick < 15, duck: tick > 65 };
            proof.record(input);
            a.step(1 / 60, input);
            b.step(1 / 60, runnerInputFromMask(
                (input.jump ? 1 : 0) | (input.jumpHeld ? 2 : 0) | (input.duck ? 4 : 0)));
        }
        assert.deepEqual([a.score, a.passed, a.status, a.tick], [b.score, b.passed, b.status, b.tick]);
        assert.deepEqual(proof.payload().ticks, 90);
        assert.equal(a.width, width);
    }
});
