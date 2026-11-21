/**
 * F11-01..14: strict evidence-completeness gate for a commercial release.
 *
 * IMPORTANT: a repository JSON file is NOT authenticated proof of a physical
 * phone, café owner, real host, financial redemption or the reviewer's identity.
 * Even perfect data returns HUMAN_REVIEW_REQUIRED, never an automatic GO.
 * Only a separate GitHub protected Environment approval can authorize a
 * *candidate* for a controlled rollout (and never deploy automatically).
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { GAME_IDS } from './step31_quality_policy.mjs';

export const PHASE11_GATES = Object.freeze([
    { id: 'F11-01', name: 'functional-seven-games', class: 'ci' },
    { id: 'F11-02', name: 'active-character-art-and-motion', class: 'human' },
    { id: 'F11-03', name: 'chromium-firefox-webkit-plus-real-mobile', class: 'hybrid' },
    { id: 'F11-04', name: 'physical-android-budget-and-midrange', class: 'human' },
    { id: 'F11-05', name: 'physical-ios-safari-safe-area', class: 'human' },
    { id: 'F11-06', name: 'network-offline-reconnect-and-update', class: 'hybrid' },
    { id: 'F11-07', name: 'independent-security-and-anti-fraud', class: 'human' },
    { id: 'F11-08', name: 'full-reward-redemption-and-role-boundaries', class: 'human' },
    { id: 'F11-09', name: 'real-staging-concurrency-50', class: 'human' },
    { id: 'F11-10', name: 'actual-cafe-user-playtests', class: 'human' },
    { id: 'F11-11', name: 'rtl-contrast-keyboard-touch-and-reduced-motion', class: 'hybrid' },
    { id: 'F11-12', name: 'exact-sha-all-regressions-green', class: 'ci' },
    { id: 'F11-13', name: 'api-pwa-rules-asset-revision-and-rollback-audit', class: 'hybrid' },
]);
export const REVIEWER_ROLES = Object.freeze(['engineering', 'security', 'operations', 'cafeOwner']);
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const RELEASE = /^[a-f0-9]{16}$/;
const TIME_WINDOW = 30 * 24 * 60 * 60 * 1000;
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDate = (v, now) => {
    if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)) return false;
    const ms = Date.parse(v);
    return Number.isFinite(ms) && ms <= now.getTime() + 5 * 60 * 1000
        && now.getTime() - ms <= TIME_WINDOW;
};
const safeUrl = url => {
    if (typeof url !== 'string' || url.length > 300) return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && parsed.hostname === 'github.com'
            && parsed.username === '' && parsed.password === ''
            && parsed.search === '' && parsed.hash === ''
            && /^\/Parsa-Emami\/Demian\/(actions\/runs\/\d+|issues\/\d+|pull\/\d+|commit\/[0-9a-f]{40})\/?$/.test(parsed.pathname);
    } catch { return false; }
};
const isEvidence = (row, now) => isObj(row)
    && safeUrl(row.url) && HASH.test(row.sha256 ?? '')
    && isDate(row.observedAt, now);
const deviceAccepted = (d, now) => isObj(d)
    && d.physical === true
    && ['android', 'ios'].includes(d.platform)
    && typeof d.model === 'string' && d.model.length >= 3 && d.model.length <= 80
    && typeof d.os === 'string' && d.os.length >= 2 && d.os.length <= 60
    && typeof d.browser === 'string' && d.browser.length >= 3 && d.browser.length <= 60
    && Number.isFinite(d.minutesPlayed) && d.minutesPlayed >= 15 && d.minutesPlayed <= 180
    && Array.isArray(d.games) && d.games.length === GAME_IDS.length
    && GAME_IDS.every(g => d.games.includes(g))
    && d.metrics?.touchLatencyP95Ms >= 0 && d.metrics?.touchLatencyP95Ms <= 100
    && d.metrics?.memoryGrowthPct >= 0 && d.metrics?.memoryGrowthPct <= 10
    && d.metrics?.frameTimeP95Ms >= 0 && d.metrics?.frameTimeP95Ms <= 34
    && d.metrics?.p50Fps >= 30 && d.metrics?.p50Fps <= 240
    && d.offlineReconnectPassed === true && d.rotationAndSafeAreaPassed === true
    && isEvidence(d.evidence, now);
const review = (row, now) => isObj(row)
    && typeof row.github === 'string'
    && /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37})$/.test(row.github)
    && isDate(row.approvedAt, now);
const load = (row, scenario, now) => isObj(row)
    && row.scenario === scenario && row.origin === 'staging'
    && row.status === 'metrics-within-budget'
    && row.observedVus >= 50 && row.checkedP95P99 === true
    && row.productionHostCertified !== true
    && isEvidence(row.evidence, now);

/**
 * Never throws for an incomplete evidence manifest. Incomplete inputs are an
 * audit-worthy NO_GO with the specific gates that were not demonstrated.
 */
export function evaluatePhase11Acceptance(manifest, {
    headSha, pwaReleaseId, now = new Date(),
} = {}) {
    const reasons = [];
    if (!isObj(manifest) || manifest.schema !== 1 || manifest.environment !== 'production') {
        reasons.push('acceptance_schema_or_environment_invalid');
    }
    if (!SHA.test(headSha ?? '') || manifest?.releaseSha !== headSha) {
        reasons.push('exact_main_sha_missing_or_mismatched');
    }
    if (!RELEASE.test(pwaReleaseId ?? '') || manifest?.pwaReleaseId !== pwaReleaseId) {
        reasons.push('pwa_bundle_release_mismatch');
    }
    if (!isDate(manifest?.recordedAt, now)) reasons.push('manifest_not_fresh');
    if (manifest?.risks?.unresolvedP0 !== 0) reasons.push('unresolved_p0');
    if (manifest?.risks?.blockingP1 !== 0) reasons.push('blocking_p1');
    if (manifest?.risks?.criticalSecurity !== 0) reasons.push('open_critical_security');
    if (manifest?.risks?.characterArtDebtAccepted !== true) reasons.push('character_art_not_accepted');
    if (manifest?.risks?.financialActivationDuringQa !== false) reasons.push('financial_features_not_safely_disabled_during_qa');
    const checks = manifest?.checks;
    const entries = Array.isArray(checks) ? checks : [];
    const gateSet = new Set(PHASE11_GATES.map(g => g.id));
    const actualIds = entries.map(x => x?.id);
    if (actualIds.length !== gateSet.size || new Set(actualIds).size !== gateSet.size
        || actualIds.some(id => !gateSet.has(id))) {
        reasons.push('not_exactly_thirteen_f11_evidence_gates');
    }
    const perGate = [];
    for (const gate of PHASE11_GATES) {
        const record = entries.find(e => e?.id === gate.id);
        const accepted = record?.status === 'accepted'
            && record.releaseSha === headSha && isDate(record.checkedAt, now)
            && Array.isArray(record.evidence) && record.evidence.length > 0
            && record.evidence.length <= 8 && record.evidence.every(row => isEvidence(row, now))
            && typeof record.reviewedBy === 'string' && /^[a-zA-Z0-9-]{1,39}$/.test(record.reviewedBy);
        perGate.push({id: gate.id, name: gate.name, status: accepted ? 'accepted' : 'blocked'});
        if (!accepted) reasons.push('missing_or_unverifiable_'+gate.id);
    }
    const devices = Array.isArray(manifest?.devices) ? manifest.devices : [];
    const androidBudget = devices.some(d => d?.platform === 'android' && d?.tier === 'budget' && deviceAccepted(d, now));
    const androidMid = devices.some(d => d?.platform === 'android' && d?.tier === 'midrange' && deviceAccepted(d, now));
    const ios = devices.some(d => d?.platform === 'ios' && d?.tier === 'safari' && /safari/i.test(d.browser ?? '')
        && deviceAccepted(d, now));
    if (!androidBudget) reasons.push('physical_budget_android_unverified');
    if (!androidMid) reasons.push('physical_midrange_android_unverified');
    if (!ios) reasons.push('physical_ios_safari_unverified');
    const loads = Array.isArray(manifest?.loadRuns) ? manifest.loadRuns : [];
    for(const scenario of ['read_only', 'account_write', 'verified_replay']) {
        if (!loads.some(row => load(row, scenario, now))) reasons.push('real_staging_load_missing_'+scenario);
    }
    const reviewerSet = new Set();
    for(const role of REVIEWER_ROLES) {
        const actor = manifest?.reviewers?.[role];
        if (!review(actor, now)) reasons.push('missing_human_reviewer_'+role);
        else if (reviewerSet.has(actor.github.toLowerCase())) reasons.push('reviewer_separation_of_duties');
        else reviewerSet.add(actor.github.toLowerCase());
    }
    if (manifest?.cafePilot?.actualPlayers !== true
        || !Number.isInteger(manifest?.cafePilot?.playerCount)
        || manifest.cafePilot.playerCount < 3
        || manifest.cafePilot.criticalProblemsClosed !== true
        || !isEvidence(manifest.cafePilot.evidence, now)) {
        reasons.push('real_cafe_pilot_not_accepted');
    }
    if (manifest?.operations?.realCpanelStaging !== true
        || manifest?.operations?.webAndCliPhp84 !== true
        || manifest?.operations?.publicTlsAndCorsVerified !== true
        || manifest?.operations?.encryptedOffsiteBackupRestored !== true
        || manifest?.operations?.cronHeartbeatObserved !== true
        || manifest?.operations?.liveApiReleaseMatchesSha !== true
        || manifest?.operations?.rollbackRehearsedAgainstCompatibleSchema !== true
        || manifest?.operations?.realSmsVerified !== true
        || manifest?.operations?.cashierSingleUseVoucherTested !== true
        || !isEvidence(manifest?.operations?.evidence, now)) {
        reasons.push('live_cpanel_sms_coupon_restore_or_rollback_missing');
    }
    return {
        schema: 1, phase: 11, releaseSha: SHA.test(headSha ?? '') ? headSha : null,
        pwaReleaseId: RELEASE.test(pwaReleaseId ?? '') ? pwaReleaseId : null,
        decision: reasons.length === 0 ? 'HUMAN_REVIEW_REQUIRED' : 'NO_GO',
        productionAuthorized: false, automaticDeploymentPermitted: false,
        checks: perGate, blockers: [...new Set(reasons)],
        explanation: 'Only real, independently reviewed protected GitHub Environment approval may authorize a release candidate. This data alone never activates production.',
    };
}
export function requireReviewReady(manifest, options) {
    const out = evaluatePhase11Acceptance(manifest, options);
    if (out.decision !== 'HUMAN_REVIEW_REQUIRED') {
        throw new Error('Phase 11 NO_GO: '+out.blockers.join(', '));
    }
    return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const flags = Object.fromEntries(process.argv.slice(2).map(x => {
            const i = x.indexOf('=');
            return [x.slice(0,i),x.slice(i+1)];
        }));
        const input = flags['--file'];
        if (!input || statSync(input).size > 256 * 1024) throw Error('Evidence file missing or oversized.');
        const options = {headSha:flags['--sha'], pwaReleaseId:flags['--pwa-release']};
        const out = evaluatePhase11Acceptance(JSON.parse(readFileSync(input, 'utf8')), options);
        if (flags['--output']) writeFileSync(flags['--output'],JSON.stringify(out,null,2)+'\n');
        console.log(JSON.stringify(out,null,2));
        // This validates readiness for a HUMAN decision, never launches.
        if (out.decision !== 'HUMAN_REVIEW_REQUIRED') process.exitCode=1;
    } catch(error) {
        console.error('[F11-14] NO_GO: '+error.message);
        process.exitCode=2;
    }
}
