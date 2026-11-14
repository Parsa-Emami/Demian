// Authorized staging ONLY. Exercises 50 simultaneous account-create,
// run-start and account-erasure operations. DOES NOT verify 50 scored replays.
import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

const origin = __ENV.DEMIAN_BASE_URL || '';
if (__ENV.DEMIAN_LOAD_APPROVED !== 'YES' ||
    __ENV.DEMIAN_WRITE_LOAD_APPROVED !== 'YES' ||
    __ENV.DEMIAN_TARGET !== 'staging' ||
    !/^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?$/.test(origin)) {
    throw new Error('Owner-approved writable STAGING API required; production is prohibited.');
}

const errors = new Rate('demian_write_errors');
export const options = {
    scenarios: {
        fifty_parallel_test_accounts: {
            executor: 'per-vu-iterations',
            vus: 50,
            iterations: 1,
            maxDuration: '2m',
        },
    },
    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<2000'],
        demian_write_errors: ['rate<0.01'],
    },
};

function valid(r, status) {
    return r.status === status && Boolean(r.json());
}
function post(url, payload, token) {
    return http.post(url, JSON.stringify(payload), {
        headers: { Accept: 'application/json', 'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        timeout: '15s',
        redirects: 0,
    });
}

export default function () {
    const api = origin + '/api/v1/arcade';
    let token = null;
    let good = true;
    try {
        const rulesRes = http.get(api + '/rules', {
            headers: { Accept: 'application/json' }, timeout: '15s',
        });
        if (!valid(rulesRes, 200)) throw new Error('rules unavailable');
        const rules = rulesRes.json();
        const version = rules?.rules?.version;
        if (typeof version !== 'string') throw new Error('rules version unavailable');

        const registration = post(api + '/players',
            { display_name: 'Load User ' + __VU });
        if (!valid(registration, 201)) throw new Error('registration failed');
        token = registration.json('token');
        if (typeof token !== 'string' || token.length !== 64) throw new Error('bad token');
        const requestId = '00000000-0000-4000-8000-' + String(__VU).padStart(12, '0');

        const started = post(api + '/runs', {
            request_id: requestId,
            game_id: 'dino-run', rules_version: version,
            character_slug: 'darya', track_width: 420,
        }, token);
        const startedOk = check(started, {
            'server accepted isolated start': r => r.status === 201 &&
                typeof r.json('run_id') === 'string',
        });
        if (!startedOk) throw new Error('start failed');

        // Repeating the same request must not insert a second run.
        const repeated = post(api + '/runs', {
            request_id: requestId,
            game_id: 'dino-run', rules_version: version,
            character_slug: 'darya', track_width: 420,
        }, token);
        if (!valid(repeated, 201) ||
            repeated.json('run_id') !== started.json('run_id')) {
            throw new Error('start idempotency failed');
        }
    } catch {
        good = false;
    } finally {
        if (token) {
            const deleted = http.del(api + '/player', null, {
                headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
                timeout: '15s', redirects: 0,
            });
            if (deleted.status !== 200 || deleted.json('status') !== 'deleted') good = false;
        }
        errors.add(!good);
    }
}
