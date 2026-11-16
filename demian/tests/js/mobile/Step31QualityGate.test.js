import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    GAME_IDS, REQUIRED_ARTIFACTS, EXTERNAL_RELEASE_GATES,
    evaluateStep31Evidence, verifyCompositeStep31Gate,
} from '../../../tools/qa/step31_quality_policy.mjs';
import { collectStep31 } from '../../../tools/qa/step31_collect.mjs';

const SHA = 'a'.repeat(40);
function validEvidence() {
    const records = Object.fromEntries(REQUIRED_ARTIFACTS.map(row => [row.id,
        { schema: 1, status: 'passed', errors: [] }]));
    records['cold-start'] = {
        status: 'passed', errors: [], emulatedNetwork: true,
        physicalPhoneVerified: false, liveHostPerformanceVerified: false,
        cold4g: { initialMenuMs: 2700 },
        prepaint: { visibleMs: 41, deferredScriptMs: 2400, earlyClickReplayed: true },
        compressedJsBytes: 350000,
        games: GAME_IDS.map(game => ({game, firstPlayMs: 500 })),
    };
    records['browser-compatibility'] = {
        status: 'passed', emulatedDevices: true, physicalDeviceVerified: false,
        browsers: ['chromium', 'firefox', 'webkit'].map(engine => ({
            engine, status: 'passed',
            games: GAME_IDS.map(game => ({game, elapsedMs: 320, status: 'passed'})),
        })),
    };
    for (const id of ['mid-tier-laboratory', 'low-tier-laboratory']) {
        records[id] = { status: 'passed', physicalPhoneMeasured: false,
            games: GAME_IDS.map(gameId => ({ gameId, launchMs: 850 })) };
    }
    return records;
}
test('Step31 evidence validates each of six games, two lab tiers and three browser engines', () => {
    const report = evaluateStep31Evidence(validEvidence(), {commitSha: SHA});
    assert.equal(report.status, 'passed', JSON.stringify(report.failures));
    assert.equal(report.ciChecks.length, REQUIRED_ARTIFACTS.length);
    assert.equal(report.metrics.labColdMenuMs, 2700);
    assert.equal(report.metrics.labFirstGameP95Ms, 500);
    assert.equal(report.productionRelease.ready, false);
    assert.equal(report.productionRelease.outstanding.length, EXTERNAL_RELEASE_GATES.length);
    assert.deepEqual(verifyCompositeStep31Gate(report, {
        headSha: SHA, backendResult: 'success', buildResult: 'success',
    }), {ciReady: true, productionReady: false, headSha: SHA,
        requiredArtifacts: REQUIRED_ARTIFACTS.length});
});
test('Step31 rejects forged green reports, missing mobile evidence and ambiguous browser coverage', () => {
    const checks = [
        r => { delete r['cafe-rush']; },
        r => { r['coffee-crash'].status = 'failed'; },
        r => { r['dino-run'].errors = ['page crashed']; },
        r => { r['cold-start'].physicalPhoneVerified = true; },
        r => { r['cold-start'].prepaint.earlyClickReplayed = false; },
        r => { r['cold-start'].cold4g.initialMenuMs = 6000; },
        r => { r['cold-start'].games[0].firstPlayMs = 7100; },
        r => { r['cold-start'].games = r['cold-start'].games.slice(1); },
        r => { r['cold-start'].compressedJsBytes = 409600; },
        r => { r['browser-compatibility'].browsers.pop(); },
        r => { r['browser-compatibility'].browsers[0].games.pop(); },
        r => { r['low-tier-laboratory'].physicalPhoneMeasured = true; },
        r => { r['mid-tier-laboratory'].games.pop(); },
    ];
    checks.forEach((change, index) => {
        const records = validEvidence();
        change(records);
        const report = evaluateStep31Evidence(records, {commitSha: SHA});
        assert.equal(report.status, 'failed', 'Bad evidence accepted: '+index);
        assert.ok(report.failures.length, 'Empty failure reason: '+index);
    });
});
test('Composite refuses other SHA, job failure and forged production readiness', () => {
    const report = evaluateStep31Evidence(validEvidence(), {commitSha: SHA});
    for (const args of [
        {headSha:'b'.repeat(40),backendResult:'success',buildResult:'success'},
        {headSha:SHA,backendResult:'failure',buildResult:'success'},
        {headSha:SHA,backendResult:'success',buildResult:'skipped'},
    ]) assert.throws(() => verifyCompositeStep31Gate(report,args),/Step 31/);
    report.productionRelease.ready = true;
    assert.throws(() => verifyCompositeStep31Gate(report,{
        headSha:SHA,backendResult:'success',buildResult:'success',
    }),/Step 31/);
});
test('Collector fails closed when any generated report missing and cannot mint a release certificate', () => {
    const root = mkdtempSync(join(tmpdir(), 'demian-step31-qa-'));
    try {
        const records = validEvidence();
        for (const item of REQUIRED_ARTIFACTS.filter(item => item.id !== 'dino-run')) {
            const file = join(root,'docs',item.file);
            mkdirSync(file.slice(0,file.lastIndexOf('/')), {recursive:true});
            writeFileSync(file,JSON.stringify(records[item.id]));
        }
        let result = collectStep31({root,sha:SHA});
        assert.equal(result.status,'failed');
        assert.match(result.failures.join(' | '),/dino-run/);
        const absent = REQUIRED_ARTIFACTS.find(item => item.id === 'dino-run');
        const path = join(root,'docs',absent.file);
        mkdirSync(path.slice(0,path.lastIndexOf('/')),{recursive:true});
        writeFileSync(path,JSON.stringify(records[absent.id]));
        result = collectStep31({root,sha:SHA});
        assert.equal(result.status,'passed',JSON.stringify(result.failures));
        assert.equal(result.productionRelease.ready,false);
    } finally { rmSync(root,{recursive:true,force:true}); }
});
