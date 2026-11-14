import test from 'node:test';
import assert from 'node:assert/strict';
import ArcadeLeaderboardService from '../../../resources/js/game/leaderboard/ArcadeLeaderboardService.js';

function store() {
    const data=new Map();
    return {
        getItem:key=>data.get(key)??null,
        setItem:(key,value)=>data.set(key,value),
        removeItem:key=>data.delete(key),
        items:()=>[...data.entries()],
    };
}
const player={player_id:'10000000-0000-4000-a000-000000000001',
    token:'C'.repeat(64)};
test('seeded original Cafe Rush frame proofs use signed version and authenticated POST, never a client score',async()=>{
    const saved=store(),identity=store(),sent=[];
    const api=new ArcadeLeaderboardService({
        baseUrl:'https://example.test/api/v1/arcade',
        storage:saved,identityStorage:identity,
        fetcher:async(url,options)=>{
            sent.push({url,options});
            if(url.endsWith('/turn-runs')){
                const body=JSON.parse(options.body);
                assert.equal(body.game_id,'cafe-rush');
                assert.equal(body.rules_version,'cafe-rush-frames-v1');
                assert.ok(/^[0-9a-f-]{36}$/i.test(body.request_id));
                return {ok:true,json:async()=>({
                    run_id:'11111111-1111-4111-8111-111111111111',
                    game_id:'cafe-rush',seed:17,rules_version:body.rules_version,
                })};
            }
            assert.ok(url.endsWith('/turn-runs/11111111-1111-4111-8111-111111111111/complete'));
            const body=JSON.parse(options.body);
            assert.deepEqual(body,{
                ticks:7200,
                frames:[[1,0,0,0,0],[350,1,0,1,0],[7200,0,0,0,0]],
            });
            assert.ok(!Object.hasOwn(body,'score'));
            return {ok:true,json:async()=>({status:'verified',score:100})};
        },
    });
    api.identity=player;
    const run=await api.startTurnRun('cafe-rush',{gameplay:true});
    assert.equal(run.mode,'ranked');
    assert.equal(run.seed,17);
    const output=await api.finishGameplayRun(run,
        [[1,0,0,0,0],[350,1,0,1,0],[7200,0,0,0,0]],7200);
    assert.equal(output.status,'verified');
    assert.equal(sent.length,2);
    assert.ok(sent.every(entry=>entry.options.headers.Authorization==='Bearer '+player.token));
    assert.equal(api.pending,null);
    assert.ok(!saved.items().some(([,value])=>String(value).includes(player.token)));
});

test('invalid proof/route versions and wrong gameplay selection fall back without submission',async()=>{
    let calls=0;
    const api=new ArcadeLeaderboardService({
        baseUrl:'https://example.test/api/v1/arcade',
        storage:store(),identityStorage:store(),
        fetcher:async()=>{
            calls++;
            return {ok:true,json:async()=>({
                run_id:'11111111-1111-4111-8111-111111111111',
                game_id:'after-hours',seed:1,rules_version:'after-hours-route-v1',
            })};
        },
    });
    api.identity=player;
    const stale=await api.startTurnRun('after-hours',{gameplay:true});
    assert.equal(stale.mode,'practice');
    assert.equal((await api.startTurnRun('open-world',{gameplay:true})).mode,'practice');
    assert.equal(calls,1);
    assert.deepEqual(await api.finishGameplayRun({
        mode:'ranked',game_id:'after-hours',rules_version:'after-hours-route-v1',
    },[[1,0,0,0,0,null]],60),{status:'practice'});
});
