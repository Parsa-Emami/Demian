/**
 * PR07 physical-device evidence format: local/private data validation ONLY.
 * A truthful JSON assertion is not independent hardware attestation.
 * Passing the schema can produce a review CANDIDATE, never a release GO.
 */
import { GAME_IDS } from './step31_quality_policy.mjs';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const SHA=/^[a-f0-9]{40}$/;
const HASH=/^[a-f0-9]{64}$/;
const PWA=/^[a-f0-9]{16}$/;
const USER=/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37})$/;
const isObj=x=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const seconds=30*24*60*60*1000;
const iso=(value,now)=>{
    if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value))return false;
    const ms=Date.parse(value);
    return Number.isFinite(ms)&&ms<=now.getTime()+5*60000&&ms>=now.getTime()-seconds;
};
const n=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const allTrue=(row,names)=>isObj(row)&&names.every(key=>row[key]===true);
const identity=(p,t)=>p?.platform===t[0]&&p?.tier===t[1];
const DEVICE_CLASSES=Object.freeze([
    ['android','budget'],['android','midrange'],['ios','safari'],
]);
const network=['offlinePractice','offlineQueuedScoreRejected','verifiedScoreNoDuplicate',
    'connectionSwitchRecovered','oldTabUpdateRecovered','resumeRecovered'];
const accessibility=['portrait','landscape','safeArea','keyboardFocus','rtl',
    'touchTarget44px','reducedMotion','contrastReviewed'];
const actions=['start','controls','pauseResume','retry','result','returnToMenu'];
const safeText=(v,min,max)=>typeof v==='string'&&v.length>=min&&v.length<=max
    && !/[\r\n<>]/.test(v);
const noRawPrivateFields=(x)=>{
    const blocked=/^(?:email|phone|phoneNumber|ip|ipAddress|fullName|name|session|sessionId|cookie|token|password|secret|playerId|accountId|userAgent|imei|serialNumber)$/i;
    if(!isObj(x)&&!Array.isArray(x))return true;
    return Object.entries(x).every(([key,value])=>!blocked.test(key)
        &&(isObj(value)||Array.isArray(value)?noRawPrivateFields(value):true));
};
const evidence=(r,now)=>isObj(r)&&r.store==='restricted-private'
    && HASH.test(r.sha256??'')&&iso(r.capturedAt,now)
    && r.publiclyAccessible===false
    && r.recordingIncludesPersonalData===false;
const gameValid=(g)=>isObj(g)&&GAME_IDS.includes(g.id)
    && allTrue(g,actions)
    && n(g.playedMs,60000,3*60*60*1000)
    && n(g.p50Fps,20,240) && (g.targetFps===30||g.targetFps===60)
    && g.p50Fps >= (g.targetFps===60?55:28)
    && n(g.frameP95Ms,1,g.targetFps===60?20:34)
    && n(g.touchToRenderP95Ms,0,100)
    && Number.isInteger(g.renderSamples)&&g.renderSamples>=60
    && n(g.jsHeapGrowthPercent,-50,10);
function validDevice(d,t,sha,release,now) {
    if (!isObj(d)||!identity(d,t)||d.observedOnPhysicalDevice!==true
        ||d.releaseSha!==sha||d.pwaReleaseId!==release||!iso(d.capturedAt,now)
        ||!safeText(d.model,3,80)||!safeText(d.os,2,60)
        ||!safeText(d.browser,3,60)||!isObj(d.qaExport)
        ||d.qaExport.evidenceType!=='unverified-browser-session'
        ||d.qaExport.physicalPhoneVerified!==false
        ||!HASH.test(d.qaExport.sha256??'')
        ||!evidence(d.evidence,now)
        ||!n(d.activeGameplayMs,900000,3*60*60*1000)
        ||!Array.isArray(d.games)||d.games.length!==GAME_IDS.length
        ||new Set(d.games.map(x=>x?.id)).size!==GAME_IDS.length
        ||!GAME_IDS.every(id=>d.games.some(g=>g.id===id&&gameValid(g)))
        ||d.games.reduce((sum,g)=>sum+(g.playedMs||0),0)<900000
        ||!allTrue(d.network,network)||!allTrue(d.accessibility,accessibility)
        ||!isObj(d.powerThermal)||d.powerThermal.osMonitoringReviewed!==true
        ||!n(d.powerThermal.batteryStartPct,0,100)
        ||!n(d.powerThermal.batteryEndPct,0,100)
        ||d.powerThermal.batteryEndPct>d.powerThermal.batteryStartPct
        ||!['normal','mild'].includes(d.powerThermal.thermalObservation)
        ||d.unresolvedP0!==0||d.blockingP1!==0
        ||!USER.test(d.operator??'')||!USER.test(d.independentReviewer??'')
        ||d.operator.toLowerCase()===d.independentReviewer.toLowerCase())return false;
    if(t[0]==='ios')return /safari/i.test(d.browser)&&d.installedPwaVerified===true;
    return /chrome/i.test(d.browser)&&d.installedPwaVerified===true;
}

export function evaluatePr07FieldBundle(bundle,{headSha,pwaReleaseId,now=new Date()}={}) {
    const failures=[];
    if(!isObj(bundle)||bundle.schema!==1||bundle.kind!=='pr07-private-device-field-review'
        ||bundle.environment!=='staging')failures.push('invalid_private_staging_manifest');
    if(!SHA.test(headSha??'')||bundle?.releaseSha!==headSha)failures.push('foreign_source_sha');
    if(!PWA.test(pwaReleaseId??'')||bundle?.pwaReleaseId!==pwaReleaseId)failures.push('foreign_pwa_release');
    if(!iso(bundle?.recordedAt,now))failures.push('stale_or_future_review');
    if(!noRawPrivateFields(bundle))failures.push('raw_personal_or_secret_fields_forbidden');
    const devices=Array.isArray(bundle?.devices)?bundle.devices:[];
    if(devices.length!==3)failures.push('three_distinct_physical_device_classes_required');
    if(new Set(devices.map(d=>d?.evidence?.sha256)).size!==devices.length
        ||new Set(devices.map(d=>d?.qaExport?.sha256)).size!==devices.length)
        failures.push('duplicate_evidence_across_devices');
    for(const d of DEVICE_CLASSES){
        const matches=devices.filter(x=>identity(x,d));
        if(matches.length!==1||!validDevice(matches[0],d,headSha,pwaReleaseId,now))
            failures.push('physical_'+d.join('_')+'_missing_or_unverifiable');
    }
    return {
        schema:1,phase:'PR07',releaseSha:SHA.test(headSha??'')?headSha:null,
        pwaReleaseId:PWA.test(pwaReleaseId??'')?pwaReleaseId:null,
        deviceClasses:DEVICE_CLASSES.map(([platform,tier])=>({platform,tier})),
        decision:failures.length?'NO_GO':'HUMAN_REVIEW_REQUIRED',
        blockers:failures,productionAuthorized:false,financialFeaturesAuthorized:false,
        hardwareAutomaticallyAttested:false,
        explanation:'Device exports and signed field sheets are manually asserted, not hardware-attested. Independent reviewers must verify raw private recordings on actual hardware; Phase 11 host/security/financial gates remain separate.',
    };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
    try{
        const args=Object.fromEntries(process.argv.slice(2).map(s=>{
            const i=s.indexOf('=');
            return [s.slice(0,i),s.slice(i+1)];
        }));
        const path=args['--file'];
        if(!path||statSync(path).size>256*1024)throw Error('Missing/oversized private evidence manifest');
        const report=evaluatePr07FieldBundle(JSON.parse(readFileSync(path,'utf8')),{
            headSha:args['--sha'],pwaReleaseId:args['--pwa-release'],
        });
        if(args['--output'])writeFileSync(args['--output'],JSON.stringify(report,null,2)+'\n',{mode:0o600});
        console.log(JSON.stringify({decision:report.decision,blockers:report.blockers,
            productionAuthorized:false,hardwareAutomaticallyAttested:false}));
        if(report.decision!=='HUMAN_REVIEW_REQUIRED')process.exitCode=1;
    }catch(e){
        console.error('[PR07] NO_GO:',e.message);
        process.exitCode=2;
    }
}
