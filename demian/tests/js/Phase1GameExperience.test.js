import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_CATALOG } from '../../resources/js/game/catalog/GameCatalog.js';
import { GAME_DEFINITIONS } from '../../resources/js/game/registry/GameDefinitions.js';
import { RECORD_GAMES, deviceMetric } from '../../resources/js/game/leaderboard/GameRecord.js';
import ArcadeLeaderboardService from '../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';
import { gameExperience, GAME_EXPERIENCE_IDS, gameModeExplanation, gameOutcomeHint } from
    '../../resources/js/game/design/GameExperience.js';

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const standard = readJson('../../resources/game/game-design-standard-v1.json');
const briefing = readJson('../../resources/game/game-design-briefing-v1.json');

test('Phase 1: each active game, engine module, scorer and design brief has exactly one matching ID', () => {
    const ids = GAME_CATALOG.map(game => game.id);
    assert.equal(ids.length, 7);
    for (const source of [GAME_EXPERIENCE_IDS, Object.keys(GAME_DEFINITIONS),
        RECORD_GAMES, standard.games.map(game => game.id), briefing.games.map(game => game.id)]) {
        assert.equal(source.length, ids.length);
        assert.deepEqual(new Set(source), new Set(ids));
    }
    assert.equal(briefing.schemaVersion, 1);
    assert.equal(briefing.standardId, standard.standardId);
    assert.equal(briefing.phase, 1);
    assert.equal(gameExperience('unreleased-game'), null);
});

test('Phase 1: all seven games have explicit goal, teachable steps, accessible controls and learning progression', () => {
    for (const { id } of GAME_CATALOG) {
        const game = gameExperience(id);
        assert.ok(game, id);
        assert.ok(game.goalFa.length >= 20, id);
        assert.equal(game.tutorialFa.length, 3, id);
        assert.ok(game.tutorialFa.every(step => step.length >= 20), id);
        assert.ok(game.controls.touchFa.length > 10 && game.controls.keyboardFa.length > 10, id);
        assert.ok(game.difficultyFa.intro && game.difficultyFa.practice && game.difficultyFa.mastery, id);
        assert.ok(game.loop.length >= 3, id);
        assert.ok(game.session.minSeconds > 0 && game.session.maxSeconds >= game.session.minSeconds, id);
        assert.ok(gameOutcomeHint(id, { success: true }).length >= 20, id);
        assert.ok(gameOutcomeHint(id).length >= 20, id);
    }
});

test('Phase 1: no client-level score, time or character selection can authorize a financial reward', () => {
    const metrics = {
        'open-world': 'time', 'dino-run': 'score', 'after-hours': 'time',
        'cafe-rush': 'orders', 'cafe-critters': 'time',
        'coffee-crash': 'score', 'cafe-drift': 'score',
    };
    for (const { id } of GAME_CATALOG) {
        const game = gameExperience(id);
        assert.equal(game.score.metric, metrics[id], id);
        assert.equal(game.score.direction, metrics[id] === 'time' ? 'lower' : 'higher', id);
        assert.equal(game.score.authority, 'server-replay', id);
        assert.equal(game.score.clientClaimsAllowed, false, id);
        assert.ok(['locked', 'gated', 'disabled'].includes(game.modes.prizeStatus), id);
        assert.match(gameModeExplanation(id, 'ranked'), /سرور|Replay|رقابت/, id);
        assert.notEqual(gameModeExplanation(id, 'ranked'), gameModeExplanation(id), id);
        const record = { ticks: 600, passed: 3, score: 100 };
        const actualMetric = deviceMetric(id, record);
        assert.equal(actualMetric, metrics[id] === 'time' ? -600
            : metrics[id] === 'orders' ? 3 : 100, id);
    }
    assert.equal(gameModeExplanation('unknown', 'ranked'), '');
});

test('Phase 1: the shared UI consumes the authored brief without adding unofficial ranked or prize buttons', () => {
    const selection = readFileSync(new URL('../../resources/js/game/shell/screens/GameSelectionScreen.js', import.meta.url), 'utf8');
    const results = readFileSync(new URL('../../resources/js/game/shell/screens/ResultsScreen.js', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../../resources/css/phase1-game-experience.css', import.meta.url), 'utf8');
    assert.match(selection, /gameExperience\(game\.id\)/);
    assert.match(selection, /game-card__guide/);
    assert.match(selection, /game-card__learning-steps/);
    assert.match(selection, /data-game-launch/);
    assert.doesNotMatch(selection, /data-ranked-claim|data-claim-coupon/);
    assert.match(results, /gameOutcomeHint\(payload\.gameId/);
    assert.match(css, /min-height:\s*44px/);
    assert.match(css, /prefers-reduced-motion/);
    assert.match(css, /forced-colors/);
});

test('Phase 1: offline entry is always practice for every game and cannot emit leaderboard requests', async () => {
    let requests = 0;
    const storage = () => {
        const data = new Map();
        return {
            getItem: key => data.get(key) ?? null,
            setItem: (key, value) => data.set(key, value),
            removeItem: key => data.delete(key),
        };
    };
    const service = new ArcadeLeaderboardService({
        baseUrl: '', storage: storage(), identityStorage: storage(),
        fetcher: async () => { requests++; throw new Error('offline must not fetch'); },
    });
    for (const { id } of GAME_CATALOG) {
        const run = id === 'dino-run'
            ? await service.start({ width: 420, character: 'darya' })
            : await service.startTurnRun(id, { gameplay: id === 'after-hours' || id === 'cafe-rush' });
        assert.equal(run.mode, 'practice', id);
    }
    assert.equal(requests, 0, 'No request may be sent without a configured HTTPS API.');
    assert.deepEqual(await service.finishTurnRun({ mode: 'practice', game_id: 'cafe-critters' }, [], 0),
        { status: 'practice' });
});
