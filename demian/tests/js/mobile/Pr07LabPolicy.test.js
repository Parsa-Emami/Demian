import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {GAME_IDS,REQUIRED_ARTIFACTS} from '../../../tools/qa/step31_quality_policy.mjs';
import {evaluatePr07Lab,verifyPr07LabReport,PR07_LAB_INPUTS}
    from '../../../tools/qa/pr07_lab_policy.mjs';
import {collectPr07Lab} from '../../../tools/qa/pr07_collect.mjs';
const SHA='a'.repeat(40);
function sample(){
    const step31={
        schema:1,step:31,status:'passed',commitSha:SHA,failures:[],
        ciChecks:REQUIRED_ARTIFACTS.map(r=>({id:r.id,status:'passed'})),
        productionRelease:{ready:false,status:'blocked-pending-external-verification'},
        metrics:{labColdMenuMs:2500,labFirstGameP95Ms:900},
    };
    const soak={
        status:'passed',physicalPhoneVerified:false,errors:[],
        gameRuns:GAME_IDS.map(id=>({id})),
        chunkTeleports:Array.from({length:18},()=>({queued:0})),
        runtime:{physicalPhoneVerified:false,sampledFrames:1050,
            games:Object.fromEntries(GAME_IDS.map(id=>[id,{frames:150}]))},
    };
    const device={status:'passed',physicalPhoneMeasured:false,
        profiles:[[320,568],[390,844],[844,390],[1440,900]].map(([width,height])=>({
            width,height,optInOnly:true,captureAndDownload:'passed',cleanup:'passed',
            metrics:{physicalPhoneVerified:false},errors:[],
        }))};
    const touch={status:'passed',physicalPhoneMeasured:false,
        scenarios:[{status:'passed'},{status:'passed'},{status:'passed'}],errors:[]};
    const offline={status:'passed',physicalDeviceVerified:false,
        playableOfflineModes:[...GAME_IDS],offlineGameplay:'passed',
        offlineFallbackAfterDelete:'passed',errors:[]};
    const integrity={status:'passed',physicalDeviceVerified:false,
        corruptCoreDeleted:true,offlinePracticeAfterIntegrityRetry:true};
    return {step31,soak,device,touch,offline,integrity};
}
test('PR07 seven-game four-viewport exact-SHA aggregate never certifies physical devices',()=>{
    const result=evaluatePr07Lab(sample(),{headSha:SHA});
    assert.equal(result.status,'passed',result.failures.join(','));
    assert.deepEqual(result.catalog,GAME_IDS);
    assert.equal(result.productionAuthorized,false);
    assert.equal(result.releaseDecision,'NO_GO_PENDING_PHYSICAL_DEVICE_AND_OPERATOR_ACCEPTANCE');
    assert.equal(result.browserProfiles.length,4);
    assert.equal(result.measured.sampledRenderSubmissionFrames,1050);
    assert.deepEqual(verifyPr07LabReport(result,{
        headSha:SHA,buildResult:'success',backendResult:'success',
    }),{ciValidated:true,physicalAccepted:false,productionAuthorized:false,releaseSha:SHA});
});
test('PR07 refuses false green CI artifacts, missing games, physical claims and stale SHA',()=>{
    const attacks=[
        x=>{x.step31.commitSha='b'.repeat(40);},
        x=>{x.step31.productionRelease.ready=true;},
        x=>{x.step31.ciChecks.pop();},
        x=>{x.soak.gameRuns.pop();},
        x=>{x.soak.runtime.games[GAME_IDS[0]].frames=0;},
        x=>{x.soak.runtime.physicalPhoneVerified=true;},
        x=>{x.soak.chunkTeleports=[];},
        x=>{x.device.profiles.pop();},
        x=>{x.device.profiles[0].metrics.physicalPhoneVerified=true;},
        x=>{x.touch.scenarios[0].status='failed';},
        x=>{x.offline.playableOfflineModes.pop();},
        x=>{x.offline.offlineFallbackAfterDelete='failed';},
        x=>{x.integrity.corruptCoreDeleted=false;},
    ];
    attacks.forEach((attack,i)=>{
        const record=sample();attack(record);
        const result=evaluatePr07Lab(record,{headSha:SHA});
        assert.equal(result.status,'failed','Mutation '+i);
        assert.ok(result.failures.length);
    });
});
test('PR07 composite rejects forged GO, wrong SHA and skipped backend',()=>{
    const report=evaluatePr07Lab(sample(),{headSha:SHA});
    for(const mutate of [
        r=>{r.productionAuthorized=true;},
        r=>{r.limitations.physicalAndroidVerified=true;},
        r=>{r.releaseDecision='GO';},
        r=>{r.measured.sampledRenderSubmissionFrames=0;},
    ]){
        const t=structuredClone(report);mutate(t);
        assert.throws(()=>verifyPr07LabReport(t,{
            headSha:SHA,buildResult:'success',backendResult:'success',
        }),/PR07 composite/);
    }
    assert.throws(()=>verifyPr07LabReport(report,{
        headSha:'b'.repeat(40),buildResult:'success',backendResult:'success',
    }),/PR07 composite/);
    assert.throws(()=>verifyPr07LabReport(report,{
        headSha:SHA,buildResult:'success',backendResult:'skipped',
    }),/PR07 composite/);
});
test('PR07 collector is fail-closed on absent and malformed source reports',t=>{
    const root=mkdtempSync(join(tmpdir(),'demian-pr07-ci-'));
    t.after(()=>rmSync(root,{recursive:true,force:true}));
    const records=sample();
    for(const [id,path] of PR07_LAB_INPUTS){
        const file=join(root,path);mkdirSync(dirname(file),{recursive:true});
        writeFileSync(file,JSON.stringify(records[id]));
    }
    assert.equal(collectPr07Lab({root,sha:SHA}).status,'passed');
    writeFileSync(join(root,PR07_LAB_INPUTS[0][1]),'{bad json');
    const result=collectPr07Lab({root,sha:SHA});
    assert.equal(result.status,'failed');
    assert.match(result.failures.join('|'),/step31/i);
});
