/**
 * Step 30: 100 concurrent, REAL PHP replay-verification transactions.
 * K6 does not run this from CI because a live, owner-authorized disposable
 * staging database and 100 pre-provisioned accounts are mandatory.
 *
 * DEMIAN_BASE_URL=https://staging-api.example.test
 * DEMIAN_TARGET=staging
 * DEMIAN_LOAD_APPROVED=YES
 * DEMIAN_REPLAY_LOAD_APPROVED=YES
 * DEMIAN_PROVIDER_100_VU_APPROVED=YES
 * DEMIAN_STAGING_IDENTITIES_FILE=/secure/100-disposable-identities.json
 * DEMIAN_TEST_RUN_ID=8hexchars (rotate for each run)
 * k6 run tools/load/cpanel_100_verified_replays_staging.js
 *
 * Identity file shape: [{"token":"64-hex-characters"}, ... 100 entries].
 * Do not commit the file or pass credentials through command-line output.
 * No coupons are ever issued or redeemed by this profile.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { firstCollisionReplay } from './runner_first_collision.js';

const origin = __ENV.DEMIAN_BASE_URL || '';
const approved = __ENV.DEMIAN_TARGET === 'staging'
    && __ENV.DEMIAN_LOAD_APPROVED === 'YES'
    && __ENV.DEMIAN_REPLAY_LOAD_APPROVED === 'YES'
    && __ENV.DEMIAN_PROVIDER_100_VU_APPROVED === 'YES'
    && /^https:\/\/[a-z0-9.-]+(?::[0-9]{2,5})?$/i.test(origin)
    && origin.toLowerCase().includes('staging');
const file = __ENV.DEMIAN_STAGING_IDENTITIES_FILE || '';
const nonce = __ENV.DEMIAN_TEST_RUN_ID || '';
if (!approved || !file || !/^[0-9a-f]{8}$/i.test(nonce)) {
    throw Error('Owner-approved HTTPS STAGING, identity file and unique test nonce are mandatory.');
}
const identities = JSON.parse(open(file));
if (!Array.isArray(identities) || identities.length !== 100
    || !identities.every(v => v && /^[a-f0-9]{64}$/i.test(v.token))
    || new Set(identities.map(v => v.token)).size !== 100) {
    throw Error('Provide exactly 100 unique, secret, disposable staging bearer tokens.');
}
const rules = JSON.parse(open('../../resources/game/runner-rules.json'));
const failures = new Rate('demian_verified_replay_errors');
export const options = {
    scenarios: {
        one_hundred_verified_replay_completions: {
            executor: 'per-vu-iterations', vus: 100,
            iterations: 1, maxDuration: '3m',
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<2000', 'p(99)<4000'],
        demian_verified_replay_errors: ['rate<0.01'],
    },
};

function post(path, data, token) {
    return http.post(origin + '/api/v1/arcade' + path,
        JSON.stringify(data), {
            headers: {Accept: 'application/json', 'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token},
            redirects: 0, timeout: '20s',
            tags: {request_group: 'verified-replay-staging'},
        });
}
function decoded(response) {
    if (response.status < 200 || response.status >= 300) return null;
    try { return response.json(); } catch { return null; }
}
export default function () {
    const token = identities[__VU - 1]?.token;
    let okay = false;
    try {
        if (!token) throw Error('Missing per-user disposable token');
        const requestId = nonce + '-1234-4000-8000-' + String(__VU).padStart(12, '0');
        const version = rules.version;
        const start = post('/runs', {
            request_id: requestId, game_id: 'dino-run',
            rules_version: version, character_slug: 'darya', track_width: 420,
        }, token);
        const result = decoded(start);
        if (start.status !== 201 || typeof result?.run_id !== 'string'
            || !Number.isSafeInteger(result.seed) || result.seed < 1) {
            throw Error('Server did not issue a valid run');
        }
        const replay = firstCollisionReplay(rules, result.seed, 420);
        // Respect server's clock-based anti-cheat. Proof is deliberately
        // computed locally only for CPU/DB staging load; never used as prizes.
        sleep(replay.elapsedSeconds + 0.25);
        const complete = post('/runs/' + result.run_id + '/complete', {
            ticks: replay.ticks, transitions: replay.transitions,
        }, token);
        const score = decoded(complete);
        if (complete.status !== 200 || score?.status !== 'verified'
            || score?.verification !== 'server-replay'
            || !Number.isInteger(score?.score)
            || score?.ticks !== replay.ticks) {
            throw Error('Server replay evidence or receipt rejected');
        }
        // Idempotent retry must return the same authoritative score and run.
        const again = post('/runs/' + result.run_id + '/complete', {
            ticks: replay.ticks, transitions: replay.transitions,
        }, token);
        const receipt = decoded(again);
        okay = check(again, {
            'idempotent verified replay': r => r.status === 200
                && receipt?.run_id === result.run_id
                && receipt?.score === score.score
                && receipt?.verification === 'server-replay',
        });
    } catch {
        // Do not log bearer capabilities, private identities or response bodies.
        okay = false;
    } finally {
        failures.add(!okay);
    }
}
