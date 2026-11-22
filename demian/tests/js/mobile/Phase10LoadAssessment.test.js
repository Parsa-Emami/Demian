import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPhase10K6 } from '../../../tools/load/assess_phase10_k6.mjs';

const metrics = (scenario = 'read_only') => ({
    state: { testRunDurationMs: scenario === 'read_only' ? 181000 : 12000 },
    metrics: {
        vus_max: { values: { value: 50 } },
        vus: { values: { max: 50 } },
        iterations: { values: { count: 150 } },
        http_reqs: { values: { count: 450 } },
        http_req_duration: { values: { 'p(95)': 680, 'p(99)': 1250 } },
        http_req_failed: { values: { rate: 0.002 } },
        checks: { values: { rate: 0.998 } },
        demian_bad_responses: { values: { rate: 0.001 } },
        demian_write_errors: { values: { rate: 0.001 } },
        demian_verified_replay_errors: { values: { rate: 0.001 } },
    },
});
test('F10-11 counts observed, not merely configured, 50 concurrent VUs', () => {
    const result=assessPhase10K6(metrics());
    assert.equal(result.status, 'metrics-within-budget');
    assert.equal(result.hostCapacityCertified, false);
    assert.equal(result.liveHostEvidenceAuthenticated, false);
    const under=metrics();
    under.metrics.vus.values.max=15;
    assert.equal(assessPhase10K6(under).checks.observed_50_vus, false);
    assert.equal(assessPhase10K6(under).status, 'not-accepted');
});
test('F10-11 fails on missing p99, duration, app checks or error evidence', () => {
    for (const name of ['missing99','missingDuration','highError','invalidResponses','fewRequests']) {
        const sample=metrics();
        if (name==='missing99') delete sample.metrics.http_req_duration.values['p(99)'];
        if (name==='missingDuration') delete sample.state.testRunDurationMs;
        if (name==='highError') sample.metrics.http_req_failed.values.rate=.03;
        if (name==='invalidResponses') sample.metrics.checks.values.rate=.9;
        if (name==='fewRequests') sample.metrics.http_reqs.values.count=10;
        assert.equal(assessPhase10K6(sample).status,'not-accepted',name);
    }
});
test('F10-11 three independent scenario budgets never imply real host certificate', () => {
    for(const scenario of ['read_only','account_write','verified_replay']){
        const result=assessPhase10K6(metrics(scenario),{scenario});
        assert.equal(result.status,'metrics-within-budget',scenario);
        assert.equal(result.hostCapacityCertified,false);
    }
    assert.throws(()=>assessPhase10K6(metrics(),{target:'production'}));
    assert.throws(()=>assessPhase10K6(metrics(),{scenario:'malicious_load'}));
    assert.throws(()=>assessPhase10K6(metrics(),{expectedVus:10}));
});
