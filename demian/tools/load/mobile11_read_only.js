// Mobile-11: intentionally read-only. Only run against infrastructure YOU own.
// Example: DEMIAN_BASE_URL=https://api-staging.example.com \
// DEMIAN_LOAD_APPROVED=YES k6 run tools/load/mobile11_read_only.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const origin = __ENV.DEMIAN_BASE_URL || '';
if (__ENV.DEMIAN_LOAD_APPROVED !== 'YES' ||
    !/^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?$/.test(origin)) {
    throw new Error('Explicit ownership approval and a valid HTTPS API origin are required.');
}

const readError = new Rate('arcade_read_error');
export const options = {
    scenarios: {
        baseline_50_players_per_hour: {
            executor: 'constant-arrival-rate',
            rate: 50,
            timeUnit: '1h',
            duration: '20m',
            preAllocatedVUs: 5,
            maxVUs: 12,
        },
        bounded_burst: {
            executor: 'per-vu-iterations',
            vus: 10,
            iterations: 1,
            startTime: '21m',
            maxDuration: '1m',
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<500'],
        http_req_failed: ['rate<0.01'],
        arcade_read_error: ['rate<0.01'],
    },
};

export default function () {
    const paths = ['/rules', '/games', '/leaderboards/dino-run?period=weekly'];
    for (const path of paths) {
        const res = http.get(origin + '/api/v1/arcade' + path, {
            headers: { Accept: 'application/json' },
            redirects: 0,
            timeout: '8s',
            tags: { scenario: 'arcade-public-read' },
        });
        let body;
        try { body = res.json(); } catch { body = null; }
        const ok = check(res, {
            'HTTP 200 and valid API payload': r => r.status === 200 && Boolean(body) &&
                (path === '/games' ? Array.isArray(body.games) :
                    path === '/rules' ? body.game_id === 'dino-run' :
                        Array.isArray(body.data)),
        });
        readError.add(!ok);
    }
    sleep(1);
}
