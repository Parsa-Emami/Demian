/**
 * Demian Step 31 - deterministic, fail-closed CI evidence policy.
 *
 * This validates machine-generated CI laboratory evidence; it deliberately
 * never turns emulated Chrome/Firefox/WebKit, MySQL-in-CI or a local mock API
 * into proof of an actual production cPanel deployment.
 */
export const GAME_IDS = Object.freeze([
    'dino-run', 'open-world', 'after-hours', 'cafe-rush',
    'cafe-critters', 'coffee-crash',
]);

export const REQUIRED_ARTIFACTS = Object.freeze([
    { id: 'cold-start', file: 'phase6-step30/startup.json' },
    { id: 'six-game-integration', file: 'phase4-step20/startup-and-game-loading.json' },
    { id: 'dino-run', file: 'phase5-step23/dino-run-browser.json' },
    { id: 'open-world', file: 'phase5-step24/open-world-browser.json' },
    { id: 'after-hours', file: 'phase5-step25/after-hours-browser.json' },
    { id: 'cafe-rush', file: 'phase5-step26/cafe-rush-browser.json' },
    { id: 'cafe-critters', file: 'phase5-step27/cafe-critters-browser.json' },
    { id: 'coffee-crash', file: 'phase5-step28/coffee-crash-browser.json' },
    { id: 'save-data-recovery', file: 'mobile-04/browser/save-data-resume.json' },
    { id: 'pwa-fonts-offline', file: 'mobile-07/browser/pwa-and-fonts.json' },
    { id: 'pwa-pack-management', file: 'mobile-09/browser/mobile-09-pwa.json' },
    { id: 'mid-tier-laboratory', file: 'mobile-01/baseline/mobile-mid-mobile.json' },
    { id: 'low-tier-laboratory', file: 'mobile-01/baseline/mobile-low-mobile.json' },
    { id: 'browser-compatibility', file: 'phase6-step31/browser-compatibility.json' },
]);

export const EXTERNAL_RELEASE_GATES = Object.freeze([
    { id: 'real-android-ios', issue: 7, label: 'Android + iOS physical devices, 15-30min soak, rotation/background/touch' },
    { id: 'real-cpanel-capacity', issue: 28, label: 'Authorized cPanel staging: 50 read/write/verified-replay clients, p95/p99, CPU/RAM/DB locks' },
    { id: 'fraud-and-prize-security', issue: 44, label: 'Independent anti-bot, coupon fraud, replay review + authorized staging DAST' },
    { id: 'offsite-backup-restore', issue: 28, label: 'Encrypted offsite backup, isolated actual MySQL restore, RPO/RTO verified' },
    { id: 'live-domain-and-slo', issue: 28, label: 'Owner-approved HTTPS/DNS/CDN live API, browser telemetry, sample period and SLOs' },
    { id: 'privacy-and-legal', issue: 10, label: 'Competition terms, prize policy, privacy review and authorization before release' },
]);

export function nearestRank(values, fraction) {
    if (!Array.isArray(values) || !values.length || !Number.isFinite(fraction)
        || fraction < 0 || fraction > 1 || values.some(v => !Number.isFinite(v) || v < 0)) {
        return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

const exactGames = games => Array.isArray(games)
    && games.length === GAME_IDS.length
    && GAME_IDS.every(id => games.some(row => (row.game ?? row.gameId) === id));

export function evaluateStep31Evidence(records, { commitSha = null } = {}) {
    const failures = [], checked = [];
    for (const item of REQUIRED_ARTIFACTS) {
        const report = records?.[item.id];
        if (!report || typeof report !== 'object' || report.status !== 'passed'
            || (Array.isArray(report.errors) && report.errors.length > 0)) {
            failures.push(item.id + ': missing / failed / contains browser errors');
            checked.push({ id: item.id, status: 'failed' });
            continue;
        }
        checked.push({ id: item.id, status: 'passed' });
    }
    const startup = records?.['cold-start'];
    const games = startup?.games;
    const boot = startup?.cold4g?.initialMenuMs;
    if (startup?.emulatedNetwork !== true || startup?.physicalPhoneVerified !== false
        || startup?.liveHostPerformanceVerified !== false) {
        failures.push('Cold-start evidence must explicitly identify emulation and non-physical limits.');
    }
    if (!Number.isFinite(boot) || boot < 0 || boot >= 5000) failures.push('4G cold menu does not meet <5s lab budget.');
    if (!exactGames(games)) failures.push('Six distinct playable game timings are required.');
    else if (games.some(row => !Number.isFinite(row.firstPlayMs)
        || row.firstPlayMs < 0 || row.firstPlayMs >= 7000)) {
        failures.push('At least one first-play time violates <7s lab budget.');
    }
    if (!Number.isFinite(startup?.prepaint?.visibleMs) || startup.prepaint.visibleMs >= 2000
        || startup.prepaint.deferredScriptMs < 2000 || startup.prepaint.earlyClickReplayed !== true) {
        failures.push('Deferred-script first menu / first-click protection is not proven.');
    }
    const compatibility = records?.['browser-compatibility'];
    if (compatibility?.physicalDeviceVerified !== false || compatibility?.emulatedDevices !== true
        || !Array.isArray(compatibility?.browsers)
        || !['chromium', 'firefox', 'webkit'].every(engine => compatibility.browsers.some(row =>
            row.engine === engine && row.status === 'passed' && exactGames(row.games)))) {
        failures.push('Three-engine six-game browser acceptance is missing or incomplete.');
    }
    const profiles = ['mid-tier-laboratory', 'low-tier-laboratory'];
    for (const id of profiles) {
        const report = records?.[id];
        if (report?.physicalPhoneMeasured !== false || !exactGames(report?.games)) {
            failures.push(id + ' must cover all six emulated games without claiming physical phones.');
        }
    }
    const transferred = startup?.compressedJsBytes;
    if (!Number.isFinite(transferred) || transferred <= 0 || transferred >= 400 * 1024) {
        failures.push('Atomic JS gzip exceeds 400-KiB hard release ceiling.');
    }
    // Never claim a user-visible release certificate from anonymous filenames.
    const validatedSha = typeof commitSha === 'string' && /^[a-f0-9]{40}$/i.test(commitSha)
        ? commitSha : null;
    return {
        schema: 1, step: 31,
        commitSha: validatedSha,
        status: failures.length === 0 ? 'passed' : 'failed',
        metrics: {
            labColdMenuMs: Number.isFinite(boot) ? boot : null,
            labFirstGameP95Ms: exactGames(games)
                ? nearestRank(games.map(row => row.firstPlayMs), 0.95) : null,
            labInitialJsGzipBytes: Number.isFinite(transferred) ? transferred : null,
            basis: 'Chromium emulated cold 4G only; not production field data',
        },
        ciChecks: checked, failures,
        productionRelease: {
            ready: false,
            status: 'blocked-pending-external-verification',
            outstanding: EXTERNAL_RELEASE_GATES,
            explanation: 'CI provides code/virtual-browser evidence only. No fabricated live security/hosting/phone acceptance.',
        },
    };
}

/**
 * Composite CI gate runs only after both the frontend build and PHP matrix
 * have passed. It refuses missing provenance, missing artifacts, or an absent
 * backend result. CI may pass while a public/paid production rollout remains
 * correctly BLOCKED.
 */
export function verifyCompositeStep31Gate(report, {
    headSha, backendResult, buildResult,
} = {}) {
    if (!report || report.schema !== 1 || report.step !== 31 || report.status !== 'passed'
        || report.productionRelease?.ready !== false
        || report.productionRelease?.status !== 'blocked-pending-external-verification'
        || !Array.isArray(report.productionRelease?.outstanding)
        || report.productionRelease.outstanding.length !== EXTERNAL_RELEASE_GATES.length
        || !headSha || !/^[a-f0-9]{40}$/i.test(headSha)
        || report.commitSha !== headSha
        || backendResult !== 'success' || buildResult !== 'success'
        || report.failures?.length !== 0
        || report.ciChecks?.length !== REQUIRED_ARTIFACTS.length
        || report.ciChecks.some(check => check.status !== 'passed')
    ) throw new Error('Step 31 composite release QA: missing evidence, incorrect commit, failed job or forged production readiness.');
    return { ciReady: true, productionReady: false, headSha,
        requiredArtifacts: REQUIRED_ARTIFACTS.length };
}
