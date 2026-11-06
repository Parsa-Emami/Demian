import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import DinoRunModel, { RUNNER_CONFIG } from '../../../resources/js/game/games/dino-run/DinoRunModel.js';
import ScoringSystem from '../../../resources/js/game/games/tetris/domain/ScoringSystem.js';
import RunnerReplay, { runnerInputFromMask } from '../../../resources/js/game/games/dino-run/RunnerReplay.js';
import { arcadeDifficulty } from '../../../resources/js/game/difficulty/ArcadeDifficulty.js';
import ArcadeLeaderboardService from '../../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';
const memory = () => { const entries = new Map(); return { getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,v) }; };

test('difficulty begins at six, grows monotonically, and remains bounded at ten',()=>{
    assert.equal(arcadeDifficulty().level,6);
    let previous=6;
    for(let time=0;time<=900;time++) { const d=arcadeDifficulty(time);assert.ok(d.level>=previous&&d.level<=10);previous=d.level; }
    assert.ok(arcadeDifficulty(180).level>9.4);
});

test('server fixtures replay exactly and resize cannot change an active course',()=>{
    const fixtures=JSON.parse(readFileSync(new URL('../../Fixtures/runner-replays.json',import.meta.url),'utf8'));
    for(const fixture of fixtures) {
        const model=new DinoRunModel({seed:fixture.seed,width:fixture.width});let mask=0,cursor=0;
        for(let tick=0;tick<fixture.ticks;tick++) {
            if(fixture.transitions[cursor]?.tick===tick)mask=fixture.transitions[cursor++].mask;
            model.step(1/60,runnerInputFromMask(mask));model.setWidth(500);
        }
        assert.equal(model.status,'over');assert.equal(model.width,fixture.width);
        assert.deepEqual({score:model.score,ticks:model.tick,passed:model.passed},fixture.expected);
    }
});

test('recording compacts unchanged input and retains exact edges',()=>{
    const replay=new RunnerReplay();
    replay.record({jump:true,jumpHeld:true});replay.record({jumpHeld:true});replay.record({jumpHeld:true});replay.record({duck:true});
    assert.deepEqual(replay.payload(),{ticks:4,transitions:[{tick:0,mask:3},{tick:1,mask:2},{tick:3,mask:4}]});
});

test('offline scores are explicitly local and never issue a network request',async()=>{
    const service=new ArcadeLeaderboardService({baseUrl:'',storage:memory(),fetcher:()=>{throw new Error('Network must not be used');}});
    const run=await service.start({width:420,character:'darya',seed:7});assert.equal(run.mode,'practice');
    await service.finish(run,{score:120},new RunnerReplay(),'darya');
    const board=await service.list();assert.equal(board.mode,'device');assert.equal(board.data[0].score,120);
});

test('retry sends the same replay, never a client score, and does not duplicate local scores',async()=>{
    let count=0;const bodies=[];
    const service=new ArcadeLeaderboardService({baseUrl:'https://demian.test/api/v1/arcade',storage:memory(),fetcher:async(_url,options)=>{
        bodies.push(JSON.parse(options.body));count++;return{ok:count>1,status:count>1?200:503,json:async()=>({status:'verified',score:30})};
    }});
    service.identity={token:'x'.repeat(64)};
    const replay=new RunnerReplay();replay.record({jump:true});
    assert.equal((await service.finish({mode:'ranked',run_id:'run-1'},{score:999999},replay,'tiam')).status,'pending');
    assert.equal((await service.retry()).status,'verified');assert.deepEqual(bodies[0],bodies[1]);assert.equal('score' in bodies[0],false);
    assert.equal(service.localScores().length,1);assert.equal(service.pending,null);
});

test('varied seeded maximum-speed courses remain avoidable with bounded obstacle memory',()=>{
    for(const seed of [1,4,55,127,4294967295]) for(const width of [420,960]) {
        const model=new DinoRunModel({seed,width});model.step(1/60,{jump:true,jumpHeld:true});
        for(let tick=0;tick<60*180;tick++) {
            const next=model.obstacles.find(o=>o.x+o.w>RUNNER_CONFIG.playerX-14);
            const near=next&&next.x-RUNNER_CONFIG.playerX<model.speed*.31;
            model.step(1/60,{jump:near&&next.response==='jump'&&model.y===0,jumpHeld:true,duck:near&&next.response==='duck'});
            assert.equal(model.status,'running',`${seed}/${width}/${model.time}`);assert.ok(model.obstacles.length<8);
        }
    }
});

test('the Tetris game preset starts at six and progression survives reset',()=>{
    const scoring=new ScoringSystem({initialLevel:6});assert.equal(scoring.level,6);
    for(let i=0;i<10;i++)scoring.awardLock({lines:1});
    assert.equal(scoring.level,7);scoring.reset();assert.equal(scoring.level,6);
});
