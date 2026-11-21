import { readFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { OFFLINE_GAME_IDS } from '../offline_pack_manifest.mjs';
const HASH=/^[a-f0-9]{64}$/, SHA=/^[a-f0-9]{40}$/;
const critical=['.htaccess','index.html','manifest.webmanifest','service-worker.js','offline-packs.json','offline.html'];
/** F11-12/13: build and backend must both pass; never authorize production. */
export function verifyPhase11Composite(report, {headSha,buildResult,backendResult}={}) {
    if (!SHA.test(headSha ?? '') || buildResult !== 'success' || backendResult !== 'success') {
        throw Error('Exact source SHA and two GitHub job successes are required.');
    }
    if (report?.schema !== 1 || report.phase !== 11 || report.status !== 'passed'
        || report.commitSha !== headSha
        || !/^[a-f0-9]{16}$/.test(report.pwaReleaseId ?? '')
        || !HASH.test(report.bundleFingerprintSha256 ?? '')
        || typeof report.runnerRulesVersion !== 'string' || !report.runnerRulesVersion
        || !Array.isArray(report.checkedGames)
        || report.checkedGames.length !== OFFLINE_GAME_IDS.length
        || !OFFLINE_GAME_IDS.every(id=>report.checkedGames.includes(id))
        || report.physicalDevicesVerified !== false || report.productionHostVerified !== false
        || report.realRewardCycleVerified !== false || report.productionGoAuthorized !== false
        || report.artifactOrigin !== 'local-immutable-CI-export'
        || !critical.every(f=>HASH.test(report.criticalFileSha256?.[f] ?? ''))) {
        throw Error('F11 static release and CI evidence provenance failed.');
    }
    return {
        result:'CI_READY_PRODUCTION_NOT_AUTHORIZED',phase:11,commitSha:headSha,
        pwaReleaseId:report.pwaReleaseId,bundleFingerprintSha256:report.bundleFingerprintSha256,
        browserAndBackendJobsPassed:true,productionReady:false,
        physicalDeviceAndCpanelUatStillRequired:true,
    };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const report=JSON.parse(readFileSync(process.argv[2], 'utf8'));
        const out=verifyPhase11Composite(report,{
            headSha:process.env.GITHUB_SHA,
            buildResult:process.env.DEMIAN_PHASE11_BUILD_RESULT,
            backendResult:process.env.DEMIAN_PHASE11_BACKEND_RESULT,
        });
        console.log(JSON.stringify(out));
        if (process.env.GITHUB_STEP_SUMMARY) {
            appendFileSync(process.env.GITHUB_STEP_SUMMARY,
                '### Phase 11 exact-SHA CI audit\n'
                + '- Commit: '+out.commitSha+'\n'
                + '- PWA release: '+out.pwaReleaseId+'\n'
                + '- Static bundle hash: '+out.bundleFingerprintSha256+'\n'
                + '- Browser/build/backend CI: passed\n'
                + '- Real cPanel, OTP, coupons, Android/iOS and café acceptance: NOT certified\n');
        }
    } catch(e) {
        console.error('[F11-13 composite] FAILED: '+e.message);
        process.exitCode=1;
    }
}
