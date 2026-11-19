/**
 * Bounded opt-in long-session runtime profiler.
 *
 * Collects game-frame submissions, CPU callback work and rough JS/sprite
 * memory trends without URLs, account identifiers or GPU-memory claims.
 * The sampling code is used ONLY by Device QA, never by regular gameplay.
 */
import { GAME_CATALOG } from '../catalog/GameCatalog.js';

const GAME_IDS = new Set(GAME_CATALOG.map(game => game.id));
const WINDOW_MS = 30_000;
const MAX_WINDOWS = 60; // 30 minutes of retention; no unbounded telemetry.
const BUCKET_COUNT = 201;
const digits = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;

function histogram() {
    return { buckets: new Uint32Array(BUCKET_COUNT), count: 0, total: 0, max: 0 };
}
function addValue(h, value) {
    if (!Number.isFinite(value) || value < 0) return;
    h.buckets[Math.min(200, Math.ceil(value))]++;
    h.count++; h.total += value; h.max = Math.max(h.max, value);
}
function percentile(h, share) {
    if (!h.count) return null;
    let n = 0;
    for (let i = 0; i < h.buckets.length; i++) {
        n += h.buckets[i];
        if (n >= Math.ceil(h.count * share)) return i === 200 ? digits(h.max) : i;
    }
    return digits(h.max);
}
function distribution(h) {
    return { samples:h.count, meanMs:h.count?digits(h.total/h.count):null,
        p50Ms:percentile(h,.50), p95Ms:percentile(h,.95),
        maxMs:h.count?digits(h.max):null };
}
function memory() {
    return { samples:0, firstBytes:null, lastBytes:null, peakBytes:null };
}
function addMemory(row, value) {
    if (!Number.isFinite(value) || value <= 0) return;
    row.samples++; row.firstBytes ??= value;
    row.lastBytes = value; row.peakBytes = Math.max(value,row.peakBytes??0);
}
function snapshotMemory(row) {
    return { ...row, deltaBytes:row.firstBytes != null ? row.lastBytes-row.firstBytes : null };
}
function bucket(game, fromMs) {
    return { game, fromMs, frames:histogram(), work:histogram(),
        slowFrames:0, workOverBudget:0, memory:memory(),
        spriteCache:memory(), chunkPeak:0 };
}
export default class RuntimeSoakProfiler {
    constructor({now=()=>performance.now()}={}) {
        this.now = now; this.active=false;
    }
    start() {
        this.active=true;
        this.startMs=this.now();
        this.lastTimestamp=null; this.lastGame=null;
        this.entries=[]; this.discardedWindows=0; this.current=null;
        this.totalFrames=0; this.totalCpuWork=0;
        this.lastCpuFrameWorkMs=null;
    }
    getWindow(game) {
        const elapsed=Math.max(0,this.now()-this.startMs);
        const fromMs=Math.floor(elapsed/WINDOW_MS)*WINDOW_MS;
        if (!this.current || this.current.game!==game || this.current.fromMs!==fromMs) {
            this.current=bucket(game,fromMs);
            if (this.entries.length===MAX_WINDOWS) {
                this.entries.shift(); this.discardedWindows++;
            }
            this.entries.push(this.current);
            this.lastTimestamp=null;
        }
        return this.current;
    }
    boundary() { this.lastTimestamp=null; this.lastGame=null; }
    frame(timestamp,game,targetFps=60) {
        if(!this.active||!GAME_IDS.has(game)||!Number.isFinite(timestamp))return;
        const w=this.getWindow(game);
        if(this.lastGame!==game) this.lastTimestamp=null;
        if(this.lastTimestamp!==null && timestamp>this.lastTimestamp) {
            const interval=timestamp-this.lastTimestamp;
            addValue(w.frames,interval);
            const budget=1000/(targetFps===30?30:60);
            if(interval>budget*1.5)w.slowFrames++;
            this.totalFrames++;
        }
        this.lastTimestamp=timestamp;
        this.lastGame=game;
    }
    work(milliseconds,game,targetFps=60) {
        if(!this.active||!GAME_IDS.has(game))return;
        const w=this.getWindow(game);
        addValue(w.work,milliseconds);
        if(Number.isFinite(milliseconds) && milliseconds>1000/(targetFps===30?30:60))w.workOverBudget++;
        this.totalCpuWork++;
    }
    sampleMemory({game,jsHeapBytes=null,spriteCacheBytes=null,chunkLoaded=null}={}) {
        if(!this.active||!GAME_IDS.has(game))return;
        const w=this.getWindow(game);
        addMemory(w.memory,jsHeapBytes);
        addMemory(w.spriteCache,spriteCacheBytes);
        if(Number.isFinite(chunkLoaded)&&chunkLoaded>=0)
            w.chunkPeak=Math.max(w.chunkPeak,chunkLoaded);
    }
    stop(){this.active=false;return this.report();}
    report(){
        if(!this.entries) return null;
        const windows=this.entries.map(row=>({
            game:row.game,fromMs:row.fromMs,frameIntervals:distribution(row.frames),
            cpuFrameWork:distribution(row.work),slowFrames:row.slowFrames,
            workOverBudget:row.workOverBudget,jsHeap:snapshotMemory(row.memory),
            estimatedSpriteCache:snapshotMemory(row.spriteCache),chunkPeak:row.chunkPeak,
        }));
        const perGame={};
        for(const row of windows){
            const g=perGame[row.game]??={frames:0,slowFrames:0,workOverBudget:0,
                peakHeapBytes:null,peakSpriteBytes:null,peakLoadedChunks:0};
            g.frames+=row.frameIntervals.samples;
            g.slowFrames+=row.slowFrames;
            g.workOverBudget+=row.workOverBudget;
            if(row.jsHeap.peakBytes!=null)g.peakHeapBytes=Math.max(g.peakHeapBytes??0,row.jsHeap.peakBytes);
            if(row.estimatedSpriteCache.peakBytes!=null)g.peakSpriteBytes=Math.max(g.peakSpriteBytes??0,row.estimatedSpriteCache.peakBytes);
            g.peakLoadedChunks=Math.max(g.peakLoadedChunks,row.chunkPeak);
        }
        return {schemaVersion:1,evidenceType:'opt-in-unverified-browser-session',
            physicalPhoneVerified:false,measuredElapsedMs:digits(this.now()-this.startMs),
            windowDurationMs:WINDOW_MS,maxWindows:MAX_WINDOWS,
            droppedOlderWindows:this.discardedWindows,
            sampledFrames:this.totalFrames,sampledCpuWork:this.totalCpuWork,
            games:perGame,windows,limitations:[
                'Histogram approximates p50/p95 in 1 ms buckets and caps values above 200 ms.',
                'Frames are JS render submissions, not actual GPU presentation.',
                'CPU callback time excludes GPU and browser compositing.',
                'performance.memory is Chromium-specific and excludes native/GPU memory.',
                'Sprite cache tracks retained decoded pixel estimates; it is not total process memory.',
                'Browser and laboratory results cannot certify sustained performance on physical phones or thermal throttling.',
            ]};
    }
}
