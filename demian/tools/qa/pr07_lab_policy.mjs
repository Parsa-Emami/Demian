/**
 * PR07: exact-commit, fail-closed synthesis of EXISTING real browser CI labs.
 * These are software browser measurements, not real Android/iPhone evidence.
 */
import { GAME_IDS, REQUIRED_ARTIFACTS } from './step31_quality_policy.mjs';

const SHA = /^[a-f0-9]{40}$/;
const sameGames = (values, key) =>
    Array.isArray(values) && values.length === GAME_IDS.length
    && new Set(values.map(row => typeof row === 'string' ? row : row?.[key])).size === GAME_IDS.length
    && GAME_IDS.every(id => values.some(row => (typeof row === 'string' ? row : row?.[key]) === id));
const object = x => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const passed = x => object(x) && x.status === 'passed' && (!Array.isArray(x.errors) || x.errors.length === 0);
const noHardwareClaim = x => x === false;
export const PR07_LAB_INPUTS = Object.freeze([
    ['step31','docs/phase6-step31/qa-evidence.json'],
    ['soak','docs/mobile-runtime/runtime-soak-browser.json'],
    ['device','docs/p0-stability/browser/results.json'],
    ['touch','docs/mobile-05/browser/mobile-touch-qa.json'],
    ['offline','docs/mobile-09/browser/mobile-09-pwa.json'],
    ['integrity','docs/phase08-mobile/qa/phase08-pwa-integrity-recovery.json'],
]);

export function evaluatePr07Lab(input, { headSha } = {}) {
    const failures = [];
    if (!SHA.test(headSha ?? '')) failures.push('invalid_source_sha');
    const { step31, soak, device, touch, offline, integrity } = input ?? {};
    if (!object(step31) || step31.schema !== 1 || step31.step !== 31
        || step31.commitSha !== headSha || !passed(step31)
        || step31.productionRelease?.ready !== false
        || step31.productionRelease?.status !== 'blocked-pending-external-verification'
        || !Array.isArray(step31.ciChecks)
        || step31.ciChecks.length !== REQUIRED_ARTIFACTS.length
        || step31.ciChecks.some(x => x.status !== 'passed')
        || (step31.failures?.length ?? -1) !== 0) {
        failures.push('step31_exact_sha_composite_failed_or_claims_production');
    }
    if (!passed(soak) || !noHardwareClaim(soak?.physicalPhoneVerified)
        || !sameGames(soak?.gameRuns, 'id')
        || !object(soak?.runtime?.games)
        || Object.keys(soak.runtime.games).length !== GAME_IDS.length
        || !GAME_IDS.every(id => object(soak.runtime.games[id]) && soak.runtime.games[id].frames > 0)
        || !Number.isInteger(soak?.runtime?.sampledFrames) || soak.runtime.sampledFrames < 120
        || !noHardwareClaim(soak?.runtime?.physicalPhoneVerified)
        || !Array.isArray(soak?.chunkTeleports) || soak.chunkTeleports.length < 18) {
        failures.push('headless_full_catalog_soak_missing_or_invalid');
    }
    const viewports = [[320,568],[390,844],[844,390],[1440,900]];
    if (!passed(device) || !noHardwareClaim(device?.physicalPhoneMeasured)
        || !Array.isArray(device?.profiles) || device.profiles.length !== viewports.length
        || !viewports.every(([w,h]) => device.profiles.some(p =>
            p.width === w && p.height === h && p.optInOnly === true
            && p.captureAndDownload === 'passed' && p.cleanup === 'passed'
            && p.metrics?.physicalPhoneVerified === false
            && Array.isArray(p.errors) && p.errors.length === 0))) {
        failures.push('four_viewport_device_qa_missing_or_invalid');
    }
    if (!passed(touch) || !noHardwareClaim(touch?.physicalPhoneMeasured)
        || !Array.isArray(touch?.scenarios) || touch.scenarios.length < 3
        || touch.scenarios.some(x => x.status !== 'passed')) {
        failures.push('touch_multitouch_rotation_regression_missing');
    }
    if (!passed(offline) || !noHardwareClaim(offline?.physicalDeviceVerified)
        || !sameGames(offline?.playableOfflineModes, 'id')
        || offline.offlineGameplay !== 'passed'
        || offline.offlineFallbackAfterDelete !== 'passed') {
        failures.push('offline_full_catalog_and_cache_cleanup_missing');
    }
    if (!passed(integrity) || !noHardwareClaim(integrity?.physicalDeviceVerified)
        || integrity?.corruptCoreDeleted !== true
        || integrity?.offlinePracticeAfterIntegrityRetry !== true) {
        failures.push('corrupt_pwa_recovery_protection_missing');
    }
    return {
        schema: 1, phase: 'PR07', kind: 'lab-only-browser-quality',
        releaseSha: SHA.test(headSha ?? '') ? headSha : null,
        status: failures.length ? 'failed' : 'passed',
        catalog: [...GAME_IDS],
        evidenceFiles: PR07_LAB_INPUTS.map(([id, path]) => ({id, path,
            status: failures.length === 0 ? 'validated' : 'review-required'})),
        browserProfiles: viewports.map(([width,height]) => ({width,height,physical:false})),
        measured: {
            sampledRenderSubmissionFrames: Number.isInteger(soak?.runtime?.sampledFrames)
                ? soak.runtime.sampledFrames : null,
            coldLabMenuMs: Number.isFinite(step31?.metrics?.labColdMenuMs)
                ? step31.metrics.labColdMenuMs : null,
            firstGameLabP95Ms: Number.isFinite(step31?.metrics?.labFirstGameP95Ms)
                ? step31.metrics.labFirstGameP95Ms : null,
        },
        limitations: {
            emulatedBrowsers: true, physicalAndroidVerified: false,
            physicalIphoneSafariVerified: false, productionCpanelVerified: false,
            touchToPhotonVerified: false, actualDeviceThermalAndBatteryVerified: false,
            explanation: 'CI observes render submissions and JS heap proxies. Physical FPS, touch-to-photon, native memory and thermal behavior require independent field evidence.',
        },
        releaseDecision: 'NO_GO_PENDING_PHYSICAL_DEVICE_AND_OPERATOR_ACCEPTANCE',
        productionAuthorized: false, financialFeaturesAuthorized: false,
        failures,
    };
}

export function verifyPr07LabReport(report, {headSha, buildResult, backendResult}={}) {
    if (!object(report) || report.schema !== 1 || report.phase !== 'PR07'
        || !SHA.test(headSha ?? '') || report.releaseSha !== headSha
        || report.status !== 'passed' || report.failures?.length !== 0
        || report.catalog?.length !== GAME_IDS.length
        || !GAME_IDS.every(x=>report.catalog.includes(x))
        || report.evidenceFiles?.length !== PR07_LAB_INPUTS.length
        || report.evidenceFiles.some(x=>x.status !== 'validated')
        || report.browserProfiles?.length !== 4
        || !report.browserProfiles.every(x=>x.physical === false)
        || report.limitations?.emulatedBrowsers !== true
        || report.limitations?.physicalAndroidVerified !== false
        || report.limitations?.physicalIphoneSafariVerified !== false
        || report.limitations?.productionCpanelVerified !== false
        || report.releaseDecision !== 'NO_GO_PENDING_PHYSICAL_DEVICE_AND_OPERATOR_ACCEPTANCE'
        || report.productionAuthorized !== false || report.financialFeaturesAuthorized !== false
        || !Number.isFinite(report.measured?.sampledRenderSubmissionFrames)
        || report.measured.sampledRenderSubmissionFrames < 120
        || backendResult !== 'success' || buildResult !== 'success') {
        throw new Error('PR07 composite: incomplete/foreign SHA lab evidence or forged physical readiness');
    }
    return {ciValidated:true, physicalAccepted:false, productionAuthorized:false, releaseSha:headSha};
}
