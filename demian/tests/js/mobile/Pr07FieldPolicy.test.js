import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GAME_IDS} from '../../../tools/qa/step31_quality_policy.mjs';
import {evaluatePr07FieldBundle} from '../../../tools/qa/pr07_field_policy.mjs';

const SHA='a'.repeat(40),PWA='b'.repeat(16);
const NOW=new Date('2026-11-23T08:00:00.000Z');
const DATE='2026-11-23T07:30:00Z';
const dig=n=>n.toString(16).padStart(64,'0');
function device(platform,tier,index){
    return {
        platform,tier,observedOnPhysicalDevice:true,releaseSha:SHA,
        pwaReleaseId:PWA,capturedAt:DATE,model:'Synthetic test fixture '+index,
        os:platform==='ios'?'iOS 18':'Android 15',
        browser:platform==='ios'?'Safari 18':'Chrome 140',
        qaExport:{evidenceType:'unverified-browser-session',physicalPhoneVerified:false,
            sha256:dig(index+40)},
        evidence:{store:'restricted-private',publiclyAccessible:false,
            recordingIncludesPersonalData:false,sha256:dig(index+80),capturedAt:DATE},
        installedPwaVerified:true,activeGameplayMs:1_260_000,
        games:GAME_IDS.map(id=>({
            id,start:true,controls:true,pauseResume:true,retry:true,result:true,
            returnToMenu:true,playedMs:180000,p50Fps:58,targetFps:60,
            frameP95Ms:18,touchToRenderP95Ms:50,renderSamples:800,
            jsHeapGrowthPercent:4,
        })),
        network:{offlinePractice:true,offlineQueuedScoreRejected:true,
            verifiedScoreNoDuplicate:true,connectionSwitchRecovered:true,
            oldTabUpdateRecovered:true,resumeRecovered:true},
        accessibility:{portrait:true,landscape:true,safeArea:true,keyboardFocus:true,
            rtl:true,touchTarget44px:true,reducedMotion:true,contrastReviewed:true},
        powerThermal:{osMonitoringReviewed:true,batteryStartPct:90,batteryEndPct:75,
            thermalObservation:'mild'},
        unresolvedP0:0,blockingP1:0,operator:'operator'+index,
        independentReviewer:'reviewer'+index,
    };
}
function candidate(){return {
    schema:1,kind:'pr07-private-device-field-review',environment:'staging',
    releaseSha:SHA,pwaReleaseId:PWA,recordedAt:DATE,
    devices:[device('android','budget',1),device('android','midrange',2),device('ios','safari',3)],
};}
const evaluate=x=>evaluatePr07FieldBundle(x,{headSha:SHA,pwaReleaseId:PWA,now:NOW});

test('PR07 default template is NO_GO and contains no fabricated device records',()=>{
    const template=JSON.parse(readFileSync(new URL('../../../ops/pr07/device-acceptance.example.json',import.meta.url),'utf8'));
    assert.deepEqual(template.devices,[]);
    const result=evaluate(template);
    assert.equal(result.decision,'NO_GO');
    assert.equal(result.productionAuthorized,false);
    assert.equal(result.hardwareAutomaticallyAttested,false);
    assert.ok(result.blockers.includes('three_distinct_physical_device_classes_required'));
});
test('PR07 claimed field data still requires real hardware human review, never GO',()=>{
    const result=evaluate(candidate());
    assert.equal(result.decision,'HUMAN_REVIEW_REQUIRED',result.blockers.join(','));
    assert.equal(result.productionAuthorized,false);
    assert.equal(result.financialFeaturesAuthorized,false);
    assert.equal(result.hardwareAutomaticallyAttested,false);
});
test('PR07 rejects tampering, unsafe disclosure, incomplete and foreign evidence',()=>{
    const changes=[
        b=>{b.releaseSha='c'.repeat(40);},
        b=>{b.pwaReleaseId='c'.repeat(16);},
        b=>{b.recordedAt='2025-01-01T12:00:00Z';},
        b=>{b.environment='production';},
        b=>{b.devices.pop();},
        b=>{b.devices[0].tier='midrange';},
        b=>{b.devices[0].qaExport.physicalPhoneVerified=true;},
        b=>{b.devices[0].evidence.sha256=b.devices[1].evidence.sha256;},
        b=>{b.devices[0].activeGameplayMs=120000;},
        b=>{b.devices[0].games.pop();},
        b=>{b.devices[0].games[0].playedMs=2000;},
        b=>{b.devices[0].games[0].frameP95Ms=35;},
        b=>{b.devices[0].games[0].touchToRenderP95Ms=101;},
        b=>{b.devices[0].games[0].jsHeapGrowthPercent=25;},
        b=>{b.devices[0].games[0].start=false;},
        b=>{b.devices[0].network.verifiedScoreNoDuplicate=false;},
        b=>{b.devices[2].accessibility.safeArea=false;},
        b=>{b.devices[2].browser='Firefox';},
        b=>{b.devices[2].installedPwaVerified=false;},
        b=>{b.devices[0].powerThermal.thermalObservation='severe';},
        b=>{b.devices[0].independentReviewer=b.devices[0].operator;},
        b=>{b.devices[0].evidence.publiclyAccessible=true;},
        b=>{b.devices[0].email='sensitive@example.com';},
        b=>{b.devices[1].qaExport.sha256='invalid';},
    ];
    changes.forEach((change,index)=>{
        const doc=candidate();change(doc);
        const result=evaluate(doc);
        assert.equal(result.decision,'NO_GO','rejected tampered case '+index);
        assert.ok(result.blockers.length);
    });
});
