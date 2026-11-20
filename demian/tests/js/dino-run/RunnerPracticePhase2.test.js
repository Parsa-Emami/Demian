import test from 'node:test';
import assert from 'node:assert/strict';
import DinoRunModel, { RUNNER_CONFIG } from '../../../resources/js/game/games/dino-run/DinoRunModel.js';
import { BEGINNER_PROFILE, PRACTICE_VERSION, beginnerDifficulty } from '../../../resources/js/game/games/dino-run/RunnerPracticeProfile.js';
import ArcadeLeaderboardService from '../../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';

const tick = 1 / 60;
const make = (seed, width) => {
    const model = new DinoRunModel({ seed, width });
    model.reset({ seed, width, profile: BEGINNER_PROFILE });
    return model;
};

test('beginner difficulty increases smoothly and never changes canonical competition rules', () => {
    assert.equal(beginnerDifficulty(0).level, 2);
    let previous = 2;
    for (let seconds = 1; seconds <= 900; seconds++) {
        const next = beginnerDifficulty(seconds).level;
        assert.ok(next >= previous && next <= 6);
        assert.ok(next - previous < .08);
        previous = next;
    }
    assert.equal(RUNNER_CONFIG.difficultyStart, 6);
    assert.equal(RUNNER_CONFIG.startSpeed, 450);
    assert.equal(RUNNER_CONFIG.version, 'cafe-runner-v2');
    assert.equal(BEGINNER_PROFILE.version, PRACTICE_VERSION);
});

test('first encounter gives novices a longer reaction window on each supported track width', () => {
    for (const width of [420, 960, 2560]) for (const seed of [1, 7, 127, 4294967295]) {
        const easy = make(seed, width);
        const official = new DinoRunModel({ seed, width });
        for (const model of [easy, official]) {
            model.step(tick, { jump: true });
            while (!model.obstacles.length) model.step(tick);
        }
        assert.ok(easy.time >= 1.4 - tick);
        assert.ok(easy.speed < official.speed);
        assert.ok(easy.obstacles.slice(0, 2).every(o => o.response === 'jump' && !o.attacker));
        while (easy.status !== 'over' && easy.time < 10) easy.step(tick);
        assert.ok(easy.time > 2.5, 'early novice collision');
    }
});

test('beginner courses are deterministic, avoidable and bounded across seeds and widths', () => {
    for (const width of [420, 960, 2560]) for (const seed of [1, 7, 127, 8123, 4294967295]) {
        const model = make(seed, width);
        model.step(tick, { jump: true, jumpHeld: true });
        for (let i = 0; i < 60 * 120; i++) {
            const next = model.obstacles.find(o => o.x + o.w > RUNNER_CONFIG.playerX - 14);
            const near = next && next.x - RUNNER_CONFIG.playerX < model.speed * .31;
            model.step(tick, { jump: Boolean(near && next.response === 'jump' && model.y === 0),
                jumpHeld: true, duck: Boolean(near && next.response === 'duck') });
            assert.equal(model.status, 'running', [seed, width, model.time].join('/'));
            assert.ok(model.obstacles.length < 10);
        }
        assert.ok(model.passed > 35);
        assert.ok(model.speed <= BEGINNER_PROFILE.maxSpeed);
        model.reset({ seed, width });
        assert.equal(model.profile.version, RUNNER_CONFIG.version);
        assert.equal(model.difficulty.level, 6);
    }
});

test('practice bypasses registration, pending retry, run start and all score upload paths', async () => {
    const data = new Map();
    let requests = 0;
    const service = new ArcadeLeaderboardService({
        baseUrl: 'https://api.example.test/api/v1/arcade',
        storage: { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) },
        fetcher: async () => { requests++; throw Error('unexpected request'); },
    });
    const run = await service.start({ width: 420, character: 'darya', practice: true });
    assert.equal(run.mode, 'practice');
    const model = make(7, 420);
    model.score = 5000;
    const replay = { valid: true, payload: () => { throw Error('practice must never serialize a replay'); } };
    for (const session of [run, { ...run, mode: 'ranked', run_id: 'forged' }]) {
        assert.equal((await service.finish(session, model, replay, 'darya')).status, 'beginner-practice');
    }
    assert.equal(requests, 0);
    assert.equal(service.pending, null);
    assert.equal(service.localScores().length, 0);
    assert.equal(service.practiceScores().length, 2);
    assert.equal(service.practiceScores()[0].score, 5000);
    assert.deepEqual((await service.list('device', 'dino-run')).data, []);
});
