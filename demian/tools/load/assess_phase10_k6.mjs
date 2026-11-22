/**
 * Accepts operator-supplied k6 JSON only; does not run load or call a host.
 * A pass proves only that the uploaded metrics satisfy these budget checks,
 * not that data came from physical cPanel (human evidence remains required).
 */
import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PROFILES = Object.freeze({
    read_only: { minDurationMs: 120000, minRequests: 100, p95Ms: 1500, p99Ms: 3000 },
    account_write: { minDurationMs: 1000, minRequests: 150, p95Ms: 2000, p99Ms: 4000 },
    verified_replay: { minDurationMs: 1000, minRequests: 100, p95Ms: 2000, p99Ms: 4000 },
});

export function assessPhase10K6(data, { target = 'staging', scenario = 'read_only', expectedVus = 50 } = {}) {
    if (target !== 'staging' || !PROFILES[scenario] || expectedVus !== 50) {
        throw Error('Only approved 50-client staging profile assessments are supported.');
    }
    const policy = PROFILES[scenario];
    const get = (metric, key) => {
        const v = data?.metrics?.[metric]?.values?.[key];
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
    };
    const duration = data?.state?.testRunDurationMs;
    const values = {
        configuredVus: get('vus_max', 'value') ?? get('vus_max', 'max'),
        observedVus: get('vus', 'max'),
        runDurationMs: Number.isFinite(duration) ? duration : null,
        requestCount: get('http_reqs', 'count'),
        iterationCount: get('iterations', 'count'),
        p95Ms: get('http_req_duration', 'p(95)'),
        p99Ms: get('http_req_duration', 'p(99)'),
        requestErrorRate: get('http_req_failed', 'rate'),
        checkPassRate: get('checks', 'rate'),
        customErrorRate: get(scenario === 'read_only' ? 'demian_bad_responses'
            : scenario === 'account_write' ? 'demian_write_errors'
            : 'demian_verified_replay_errors', 'rate'),
    };
    const checks = {
        configured_50_vus: values.configuredVus !== null && values.configuredVus >= expectedVus,
        observed_50_vus: values.observedVus !== null && values.observedVus >= expectedVus,
        sustained_duration: values.runDurationMs !== null && values.runDurationMs >= policy.minDurationMs,
        http_requests: values.requestCount !== null && values.requestCount >= policy.minRequests,
        iterations: values.iterationCount !== null && values.iterationCount >= 50,
        p95_latency: values.p95Ms !== null && values.p95Ms <= policy.p95Ms,
        p99_latency: values.p99Ms !== null && values.p99Ms <= policy.p99Ms,
        http_error_rate: values.requestErrorRate !== null && values.requestErrorRate <= 0.01,
        application_error_rate: values.customErrorRate !== null && values.customErrorRate <= 0.01,
        response_contract_checks: values.checkPassRate !== null && values.checkPassRate >= 0.99,
    };
    return {
        schema: 1, scenario, target, policy, values, checks,
        status: Object.values(checks).every(Boolean) ? 'metrics-within-budget' : 'not-accepted',
        hostCapacityCertified: false, liveHostEvidenceAuthenticated: false,
        remark: 'Operator-provided JSON is not signed evidence of the host identity, provider quotas, thermal behavior or financial acceptance.',
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const args = Object.fromEntries(process.argv.slice(2).map(pair => {
            const pos = pair.indexOf('=');
            return [pair.slice(0, pos), pair.slice(pos + 1)];
        }));
        if (args['--target'] !== 'staging'
            || args['--approval'] !== 'DEMIAN_STAGING_50_USER_LOAD_AUTHORIZED'
            || !PROFILES[args['--scenario']]) {
            throw Error('Explicit approved staging target and scenario required.');
        }
        const name = args['--input'];
        if (!name || statSync(name).size > 1024 * 1024) {
            throw Error('Missing or oversized JSON input (1MiB max).');
        }
        const report = assessPhase10K6(JSON.parse(readFileSync(name, 'utf8')),
            { target: args['--target'], scenario: args['--scenario'] });
        console.log(JSON.stringify(report, null, 2));
        if (report.status !== 'metrics-within-budget') process.exitCode = 1;
    } catch (error) {
        console.error('[Phase 10 host load] '+error.message);
        process.exitCode = 2;
    }
}
