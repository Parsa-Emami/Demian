import test from 'node:test';
import assert from 'node:assert/strict';
import ArcadeLeaderboardService from '../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';
import { missionRemaining } from '../../resources/js/game/leaderboard/MissionPanel.js';

test('missions are read-only and private, countdown clamps expiry', async () => {
    const calls = [];
    const service = new ArcadeLeaderboardService({
        baseUrl: 'https://api.example.test/api/v1/arcade',
        storage: null,
        identityStorage: null,
        fetcher: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, json: async () => ({ progress: {} }) };
        },
    });
    assert.equal(await service.myMissions(), null);
    assert.equal(calls.length, 0);
    service.identity = { token: 'private', player_id: 'private-player' };
    await service.myMissions();
    assert.equal(new URL(calls[0].url).pathname, '/api/v1/arcade/player/missions');
    assert.equal(new URL(calls[0].url).search, '');
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer private');
    assert.equal(missionRemaining(-1), missionRemaining(0));
    assert.equal(missionRemaining(NaN), missionRemaining(0));
    assert.notEqual(missionRemaining(86401), missionRemaining(1));
});
