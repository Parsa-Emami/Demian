import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { worldChallengeLocked, applySavePoint }
    from '../../../resources/js/game/games/open-world/world/RankedWorldPolicy.js';

// Load only the pure route policy in Node. OpenWorldGame's actual render/controller
// imports are bundled by Vite and cannot be imported directly by Node ESM.
const gameSource = readFileSync(new URL(
    '../../../resources/js/game/games/open-world/OpenWorldGame.js',
    import.meta.url,
), 'utf8');

test('ranked world interaction advances only ephemeral proof and never touches local saves', () => {
    const actions=[],saves=[];
    const challenge={state:'running',checkpoint:id=>{actions.push(id);return id==='save-counter';}};
    const first=applySavePoint({
        challenge, pointId:'save-counter',save:id=>saves.push(id),
    });
    assert.deepEqual(first,{ranked:true,accepted:true});
    assert.deepEqual(actions,['save-counter']);
    assert.deepEqual(saves,[]);
    const wrong=applySavePoint({
        challenge, pointId:'save-arcade',save:id=>saves.push(id),
    });
    assert.deepEqual(wrong,{ranked:true,accepted:false});
    assert.deepEqual(saves,[]);
});

test('practice world persists saves without ranked evidence', () => {
    const saves=[],challenge={state:'idle',checkpoint:()=>{throw Error('not ranked');}};
    assert.deepEqual(applySavePoint({
        challenge,pointId:'save-lounge',save:id=>saves.push(id),
    }),{ranked:false,accepted:true});
    assert.deepEqual(saves,['save-lounge']);
});

test('started, active and submitting routes prohibit save-point mutations', () => {
    for(const state of ['starting','running','submitting']){
        const writes=[];
        const challenge={state,checkpoint:()=>false};
        assert.equal(worldChallengeLocked(challenge),true);
        assert.deepEqual(applySavePoint({
            challenge,pointId:'save-counter',save:id=>writes.push(id),
        }),{ranked:true,accepted:false});
        assert.deepEqual(writes,[]);
    }
    assert.equal(worldChallengeLocked({state:'verified'}),false);
    assert.equal(worldChallengeLocked(null),false);
});

test('real OpenWorldGame routes save points through policy and blocks travel/map/quick-save',()=>{
    assert.match(gameSource,/import\s+\{\s*worldChallengeLocked,\s*applySavePoint\s*\}/);
    assert.match(gameSource,/action:\s*\(\)\s*=>\s*\{\s*const outcome = applySavePoint\(/);
    assert.match(gameSource,/save:\s*id => this\.savePoints\.activate\(id\)/);
    assert.match(gameSource,/worldChallengeLocked\(\)\s*\{\s*return worldChallengeLocked\(this\.routeChallenge\)/);
    assert.match(gameSource,/async fastTravel\([^)]*\)\s*\{\s*if\s*\(this\.worldChallengeLocked\(\)\)/);
    assert.match(gameSource,/setMapOpen\(open\)\s*\{\s*if\s*\(open && this\.worldChallengeLocked\(\)\)/);
    assert.match(gameSource,/input\.quickSave && !this\.worldChallengeLocked\(\)/);
});
