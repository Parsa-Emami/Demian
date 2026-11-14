import test from 'node:test';
import assert from 'node:assert/strict';
import RankedGameplayChallenge from '../../../resources/js/game/leaderboard/RankedGameplayChallenge.js';

const baseRun = gameId => ({
    mode:'ranked',game_id:gameId,
    rules_version:RankedGameplayChallenge.VERSIONS[gameId],
    seed:7,run_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
});
function trial(gameId='after-hours',patch={},onStart=()=>{}) {
    let submitted=null;
    const context={app:{sessionState:'playing'},services:{leaderboards:{
        startTurnRun: async()=>({...baseRun(gameId),...patch}),
        finishGameplayRun: async(run,frames,ticks)=>{
            submitted={run,frames,ticks};
            return {status:'verified',score:1420};
        },
    }}};
    const candidate=new RankedGameplayChallenge({context,gameId,onStart});
    return {candidate,context,submitted:()=>submitted};
}

test('original games refuse to start on stale rules, invalid seed and wrong game',async()=>{
    for(const patch of [
        {rules_version:'route-v1'},
        {seed:-1},
        {game_id:'cafe-critters'},
        {run_id:'fake'},
    ]){
        const {candidate}=trial('after-hours',patch);
        await candidate.start();
        assert.equal(candidate.state,'idle');
        assert.equal(candidate.run,null);
        assert.deepEqual(candidate.frames,[]);
    }
});

test('source model inputs are quantized before playback and compact frames cannot contain scores',async()=>{
    const {candidate,submitted}=trial('after-hours');
    await candidate.start();
    assert.equal(candidate.state,'running');
    const input=candidate.prepareInput({x:.123456,z:-.98765,run:true});
    assert.equal(input.x,.123);
    assert.equal(input.z,-.988);
    candidate.tick(input);
    candidate.tick(input);
    candidate.queuePower('counter');
    candidate.tick({x:0,z:0,run:false});
    await candidate.finish(true);
    assert.equal(candidate.state,'verified');
    const result=submitted();
    assert.equal(result.ticks,3);
    assert.deepEqual(result.frames[0],[1,.123,-.988,1,0,null]);
    assert.deepEqual(result.frames.at(-1),[3,0,0,0,1,'counter']);
    assert.ok(result.frames.every(frame=>Array.isArray(frame)&&frame.length===6
        && frame.every(value=>typeof value!=='object'||value===null)));
});

test('Cafe Rush requires 120 real fixed simulation seconds and never sends client score',async()=>{
    const {candidate,submitted}=trial('cafe-rush');
    await candidate.start();
    candidate.tick({x:0,z:0,run:false});
    await candidate.finish(true);
    assert.equal(candidate.state,'invalid');
    assert.equal(submitted(),null);
    candidate.stop();
    await candidate.start();
    for(let tick=0;tick<7200;tick++)candidate.tick({x:0,z:0,run:false});
    await candidate.finish(true);
    assert.equal(candidate.state,'verified');
    assert.equal(submitted().ticks,7200);
    assert.deepEqual(submitted().frames,[ [1,0,0,0,0],[7200,0,0,0,0] ]);
});

test('failed original game result does not submit any leaderboard claim',async()=>{
    const {candidate,submitted}=trial();
    await candidate.start();
    candidate.tick({x:0,z:0});
    await candidate.finish(false);
    assert.equal(candidate.state,'invalid');
    assert.equal(submitted(),null);
});

test('input event flood is bounded and terminally invalidates the replay',async()=>{
    const {candidate}=trial();
    await candidate.start();
    for(let i=0;i<6501;i++){
        candidate.tick({x:i%2===0?1:-1,z:0,run:true});
    }
    assert.equal(candidate.state,'invalid');
    assert.equal(candidate.frames.length,6501);
});
