import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ArcadeLeaderboardService from '../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const store = () => {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key),
        snapshot: () => JSON.stringify([...values]),
    };
};

test('password login rotates only the local bearer and never stores plaintext password', async () => {
    const storage = store(), identityStorage = store();
    const requests = [];
    const response = { player_id: 'test-player', display_name: 'Secure Player',
        token: 'A'.repeat(64), token_expires_at: '2026-12-20T00:00:00Z', has_contact: true };
    const service = new ArcadeLeaderboardService({
        baseUrl: 'https://api.example.test/api/v1/arcade',
        storage, identityStorage,
        fetcher: async (url, options) => {
            requests.push({ url, options });
            return { ok: true, json: async () => response };
        },
    });
    const result = await service.loginWithPassword('phone', '09101234567', 'SecurePassword123!');
    assert.equal(result.display_name, 'Secure Player');
    assert.equal(requests[0].url, 'https://api.example.test/api/v1/arcade/players/login');
    assert.equal(JSON.parse(requests[0].options.body).password, 'SecurePassword123!');
    assert.equal(requests[0].options.credentials, 'omit');
    assert.doesNotMatch(storage.snapshot(), /SecurePassword123!/);
    assert.doesNotMatch(identityStorage.snapshot(), /SecurePassword123!/);
    assert.equal(service.identity.token, response.token);
});

test('public character studio requires staff gate and ranked rewards retain identity verification', () => {
    const web = read('../../routes/web.php');
    const api = read('../../routes/api.php');
    const prize = read('../../app/Services/Arcade/ArcadePrizeIdentity.php');
    assert.match(web, /Route::middleware\(\[AuthenticateCafeCashier::class, RequireCafePermission::class\.':operations\.readiness'\]\)/);
    assert.match(api, /throttle:arcade-password-login/);
    assert.match(api, /AuthenticateArcadePlayer::class/);
    assert.match(prize, /assertVerifiedRecipient/);
    const page = read('../../resources/views/demian.blade.php');
    assert.match(page, /data-ranking-login-form/);
    assert.match(page, /data-ranking-password-form/);
    assert.match(page, /ورود بدون پیامک/);
});
