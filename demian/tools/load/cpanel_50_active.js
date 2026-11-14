// 50 *active* browser clients, not 50 users/hour.
// Read-only, staging-only. One virtual client polls three public endpoints.
// Explicitly set DEMIAN_LOAD_APPROVED=YES and DEMIAN_TARGET=staging.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const origin = __ENV.DEMIAN_BASE_URL || '';
const approved = __ENV.DEMIAN_LOAD_APPROVED === 'YES';
if (!approved || __ENV.DEMIAN_TARGET !== 'staging' ||
    !/^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?$/.test(origin)) {
    throw new Error('A staging HTTPS origin and explicit owner load approval are required.');
}

const bad = new Rate('demian_bad_responses');
export const options = {
    scenarios: {
        fifty_live_clients: {
            executor: 'constant-vus',
            vus: 50,
            duration: '3m',
            gracefulStop: '15s',
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<1000'],
        http_req_failed: ['rate<0.01'],
        demian_bad_responses: ['rate<0.01'],
    },
};

export default function () {
    const paths = ['/rules', '/games', '/leaderboards/dino-run?period=weekly'];
    for (const path of paths) {
        const response = http.get(origin + '/api/v1/arcade' + path, {
            headers: { Accept: 'application/json' },
            redirects: 0,
            timeout: '10s',
            tags: { request_group: 'demian-read-only' },
        });
        let data;
        try { data = response.json(); } catch { data = null; }
        const valid = response.status === 200 && data &&
            (path === '/rules' ? data.game_id === 'dino-run' :
             path === '/games' ? Array.isArray(data.games) : Array.isArray(data.data));
        const ok = check(response, { '200 valid public API body': () => Boolean(valid) });
        bad.add(!ok);
    }
    // Roughly 50 simultaneous browser sessions polling once per 60 seconds;
    // not an authenticated replay-write concurrency certificate.
    sleep(60);
}
