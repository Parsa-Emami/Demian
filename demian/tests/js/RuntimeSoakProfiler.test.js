import test from 'node:test';
import assert from 'node:assert/strict';
import RuntimeSoakProfiler from '../../resources/js/game/performance/RuntimeSoakProfiler.js';
import UiFrameBudget from '../../resources/js/game/performance/UiFrameBudget.js';
import StaticSceneCache from '../../resources/js/game/rendering2d/StaticSceneCache.js';

test('presentation HUD policy limits DOM updates without dropping simulation steps', () => {
    const budget = new UiFrameBudget({ refreshHz: 10 });
    let painted = 0;
    let fixedTicks = 0;
    for (let i = 0; i < 600; i++) {
        fixedTicks++;
        if (budget.shouldRefresh(1/60)) painted++;
    }
    assert.equal(fixedTicks, 600);
    assert.ok(painted >= 98 && painted <= 102, 'HUD should be about 10 Hz over ten seconds');
    assert.ok(budget.snapshot().skipped > 400);
    assert.equal(budget.shouldRefresh(Number.NaN),false);
    assert.equal(budget.shouldRefresh(0,{force:true}),true);
    assert.throws(()=>new UiFrameBudget({ refreshHz: 0 }), RangeError);
});
test('static cache respects smaller overscan budgets without touching scene actors',()=>{
    const low=new StaticSceneCache(()=>{}, {maxPixels:950000,canvasFactory:()=>null});
    const high=new StaticSceneCache(()=>{}, {maxPixels:2200000,canvasFactory:()=>null});
    assert.equal(low.maxPixels,950000);
    assert.equal(high.maxPixels,2200000);
    assert.ok(low.maxPixels<high.maxPixels);
    low.dispose();high.dispose();
});
test('long-session monitor holds 30-minute bounded windows and keeps game IDs isolated',()=>{
    let now=0;
    const monitor=new RuntimeSoakProfiler({now:()=>now});
    monitor.start();
    const ids=['open-world','dino-run','after-hours','cafe-rush','cafe-critters','coffee-crash'];
    // Accelerated virtual clock: 18 minutes of timestamps without a real
    // 18-minute CI wait. This does NOT simulate physical thermal throttling.
    for(let seconds=0;seconds<1080;seconds++){
        const game=ids[Math.floor(seconds/180)%ids.length];
        for(let frame=0;frame<60;frame++){
            now=seconds*1000+frame*1000/60;
            monitor.frame(now,game,60);
            monitor.work(frame%20===0?26:4,game,60);
        }
        if(seconds%5===0)monitor.sampleMemory({game,jsHeapBytes:10_000_000+seconds*1000,
            spriteCacheBytes:3_000_000+(seconds%30)*100,chunkLoaded:game==='open-world'?8:0});
    }
    const result=monitor.stop();
    assert.equal(result.physicalPhoneVerified,false);
    assert.ok(result.measuredElapsedMs>1000000);
    assert.ok(result.windows.length<=60);
    assert.equal(Object.keys(result.games).length,6);
    assert.ok(result.games['open-world'].peakLoadedChunks<=8);
    assert.ok(result.games['open-world'].frames>9000);
    assert.ok(result.games['dino-run'].workOverBudget>0);
    assert.ok(result.games['open-world'].peakHeapBytes>0);
    assert.ok(result.windows.every(w=>w.frameIntervals.p95Ms>0));
    assert.equal(JSON.stringify(result).includes('userAgent'),false);
});
test('pause and unsupported browser memory cannot masquerade as a heap leak',()=>{
    let now=0;
    const monitor=new RuntimeSoakProfiler({now:()=>now});
    monitor.start();
    monitor.frame(1000,'open-world');
    monitor.boundary();
    now=10_000;monitor.frame(10_000,'open-world');
    monitor.sampleMemory({game:'open-world',jsHeapBytes:undefined,spriteCacheBytes:NaN});
    monitor.frame(10_016,'open-world');
    monitor.frame(10_033,'untrusted-game');
    const result=monitor.stop();
    assert.equal(result.games['open-world'].frames,1);
    assert.equal(result.windows[0].jsHeap.samples,0);
    assert.equal(result.windows[0].jsHeap.deltaBytes,null);
});
