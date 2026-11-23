/**
 * PR08: verify uploaded staging deployment receipt and independent read-only
 * parity probe against exact-SHA PWA artifact. This NEVER issues production GO.
 * Host configuration, backup/restore, physical load and device tests remain
 * private operator tasks; local JSON cannot attest them automatically.
 */
import { OFFLINE_GAME_IDS } from '../offline_pack_manifest.mjs';
const SHA=/^[a-f0-9]{40}$/;
const PWA=/^[a-f0-9]{16}$/;
const HASH=/^[a-f0-9]{64}$/;
const ORIGIN=/^https:\/\/[a-z0-9.-]+(?::[0-9]{2,5})?$/i;
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const sameGames=items=>Array.isArray(items)&&items.length===OFFLINE_GAME_IDS.length
    && new Set(items).size===OFFLINE_GAME_IDS.length
    && OFFLINE_GAME_IDS.every(id=>items.includes(id));
const origin=x=>typeof x==='string'&&ORIGIN.test(x)&&!x.includes('..');
const stagingOrigin=x=>origin(x)&&new URL(x).hostname.split('.').some(p=>p.includes('staging'));
const id=x=>Number.isSafeInteger(x)&&x>0;
export function evaluatePr08Staging({receipt,probe,pwaAudit},{
    headSha,stagingRunId,pwaReleaseId,apiOrigin,pwaOrigin,mainProtected,
}={}){
    const blockers=[];
    if(!SHA.test(headSha??''))blockers.push('invalid_release_sha');
    if(!PWA.test(pwaReleaseId??''))blockers.push('invalid_pwa_id');
    if(!id(stagingRunId))blockers.push('missing_staging_deployment_run_id');
    if(mainProtected!==true)blockers.push('main_unprotected_or_not_verified');
    if(!stagingOrigin(apiOrigin)||!stagingOrigin(pwaOrigin)
        ||apiOrigin===pwaOrigin)blockers.push('staging_https_origin_isolation_missing');
    if(!isObj(receipt)||receipt.schema!==1||receipt.kind!=='demian-cpanel-staging-receipt'
        ||receipt.target!=='staging'||receipt.sourceSha!==headSha
        ||receipt.githubRunId!==stagingRunId
        ||receipt.apiOrigin!==apiOrigin||receipt.pwaOrigin!==pwaOrigin
        ||!HASH.test(receipt.archiveSha256??'')
        ||receipt.productionAuthorized!==false
        ||receipt.financialFeaturesActivated!==false
        ||receipt.hostSmokePassed!==true||receipt.privatePathsVerified!==true
        ||receipt.pinnedSshHostUsed!==true
        ||receipt.releaseArchiveVerified!==true
        ||receipt.offsiteRestoreVerified!==false
        ||receipt.actualHost50VuAccepted!==false)blockers.push('staging_deploy_receipt_mismatch');
    if(!isObj(pwaAudit)||pwaAudit.schema!==1||pwaAudit.phase!==11
        ||pwaAudit.status!=='passed'||pwaAudit.commitSha!==headSha
        ||pwaAudit.pwaReleaseId!==pwaReleaseId
        ||!HASH.test(pwaAudit.bundleFingerprintSha256??'')
        ||!sameGames(pwaAudit.checkedGames)
        ||pwaAudit.productionGoAuthorized!==false
        ||pwaAudit.physicalDevicesVerified!==false
        ||pwaAudit.productionHostVerified!==false)
        blockers.push('exact_pwa_release_artifact_unverified');
    if(!isObj(probe)||probe.schema!==1||probe.phase!==11
        ||probe.status!=='passed-read-only-parity'||probe.target!=='staging'
        ||probe.sourceSha!==headSha||probe.pwaReleaseId!==pwaReleaseId
        ||probe.apiOrigin!==apiOrigin||probe.pwaOrigin!==pwaOrigin
        ||probe.tlsValidation!=='default-strict'
        ||probe.writeRequests!==0||probe.realDeviceAccepted!==false
        ||probe.liveCapacityCertified!==false||probe.productionGoAuthorized!==false
        ||!Array.isArray(probe.requestMethods)
        ||probe.requestMethods.length!==2
        ||!['GET','OPTIONS'].every(method=>probe.requestMethods.includes(method))
        ||!Array.isArray(probe.probes)||probe.probes.length!==4
        ||!['/','/service-worker.js','/offline-packs.json','/manifest.webmanifest']
            .every(path=>probe.probes.some(row=>row.path===path&&row.status===200))
        ||!Number.isInteger(probe.apiProbes)||probe.apiProbes<10)
        blockers.push('live_read_only_http_parity_unverified');
    return {
        schema:1,phase:'PR08',kind:'protected-staging-candidate',
        releaseSha:SHA.test(headSha??'')?headSha:null,
        stagingRunId:id(stagingRunId)?stagingRunId:null,
        pwaReleaseId:PWA.test(pwaReleaseId??'')?pwaReleaseId:null,
        verdict:blockers.length?'NO_GO':
            'STAGING_HTTP_PARITY_VERIFIED_OPERATOR_ACCEPTANCE_REQUIRED',
        blockers,
        verifiedScope:blockers.length?[]:[
            'protected-main-ref','exact-git-commit','backend-deploy-workflow-receipt',
            'pwa-release-artifact','read-only-https-api-pwa-parity',
        ],
        hostCapacityCertified:false,offsiteRestoreCertified:false,
        realDeviceCertified:false,financialFeaturesAuthorized:false,
        productionAuthorized:false,
        limitations:'Read-only API/PWA probes and workflow receipts cannot prove actual MySQL isolation, cron, disaster recovery, physical devices, 50-user cPanel capacity, or paid coupons. Require independently reviewed host evidence.',
    };
}
