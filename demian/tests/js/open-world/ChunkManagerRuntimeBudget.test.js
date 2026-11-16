import test from 'node:test';
import assert from 'node:assert/strict';
import ChunkManager from '../../../resources/js/game/games/open-world/streaming/ChunkManager.js';

function makeManager() {
    const chunks=Array.from({length:24},(_,index)=>({
        id:'region-'+index,center:{x:index*8,z:0},districtId:'cafe',
    }));
    let current=0,disposed=0;
    const partition={
        chunkAt:()=>chunks[current],
        chunksWithin(_position, radius){
            return chunks.slice(Math.max(0,current-radius),Math.min(chunks.length,current+radius+1))
                .map(chunk=>({chunk,distance:Math.abs(chunks.indexOf(chunk)-current)}));
        },
    };
    const manager=new ChunkManager({
        manifest:{},partition,
        loader:{async load(def){return{id:def.id,setTier(){},dispose(){disposed++}}}},
        unloader:{async unload(handle){await handle.dispose()}},
        eventBus:{emit(){}},activeRadius:0,preloadRadius:2,
        maxLoadedChunks:5,concurrency:2,
    });
    return{manager,move(index){current=index},disposed:()=>disposed};
}

test('active chunk identity is stable until a real load/eviction/tier change',async()=>{
    const {manager,move,disposed}=makeManager();
    manager.update({});
    await manager.whenIdle();
    const first=manager.activeChunkIds();
    assert.deepEqual(first,['region-0']);
    assert.equal(manager.activeChunkIds(),first,'memoized reference on consecutive render calls');
    assert.ok(Object.isFrozen(first));
    move(7);manager.update({});
    await manager.whenIdle();
    const next=manager.activeChunkIds();
    assert.notEqual(first,next);
    assert.deepEqual(next,['region-7']);
    assert.ok(manager.stats().loaded<=5);
    assert.ok(disposed()>0);
    await manager.dispose();
    assert.equal(manager.stats().loaded,0);
    assert.deepEqual(manager.activeChunkIds(),[]);
});

test('rapid streaming teleports never exceed bounded chunk load/handle memory',async()=>{
    const {manager,move}=makeManager();
    for(let index=0;index<24;index++){
        move(index);manager.update({});
        if(index%4===0)await manager.whenIdle();
        assert.ok(manager.stats().loaded<=5);
        assert.ok(manager.stats().loading<=2);
    }
    await manager.whenIdle();
    assert.ok(manager.stats().loaded<=5);
    assert.ok(manager.activeChunkIds().length<=1);
    await manager.dispose();
    assert.equal(manager.stats().loaded,0);
});
