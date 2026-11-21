import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CAFE_MATERIALS } from '../../resources/js/game/rendering2d/CafeWalkthroughPalette.js';
import { CAFE_BOUNDS, CAFE_STATIC_COLLIDERS, HIDE_LIGHT_ZONES } from '../../resources/js/game/shared/cafe/CafeReferenceLayout.js';
import PixelCamera2D from '../../resources/js/game/rendering2d/PixelCamera2D.js';
import PixelRenderQueue from '../../resources/js/game/rendering2d/PixelRenderQueue.js';
import {
    CAFE_VISUAL_PROFILES, CAFE_LIGHTING, cafeVisualProfile, cafeObjectScreenRect,
    drawCafeLightfield, drawCafeAmbientMotes, drawCafeGroundShadow,
} from '../../resources/js/game/rendering2d/CafeAtmosphere2D.js';
import { GAME_CATALOG } from '../../resources/js/game/catalog/GameCatalog.js';
import { cafeQualityProfile, cafeArtLevel } from '../../resources/js/game/rendering2d/CafeArtStream.js';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const pack = JSON.parse(read('../../resources/game/environment-art-pack-v1.json'));
const art = JSON.parse(read('../../resources/game/cafe-art.json'));
const makeCamera = (w=390,h=844) => {
    const camera = new PixelCamera2D({ bounds: CAFE_BOUNDS, viewportWidth:w,
        viewportHeight:h, pixelsPerUnit: 12 });
    camera.jumpTo(HIDE_LIGHT_ZONES[0].position);
    return camera;
};
function canvasSpy() {
    const ops = {save:0,restore:0,rects:[],ellipses:[],stops:0,clips:0,gradients:0};
    const ctx = {
        save(){ops.save++},restore(){ops.restore++},
        beginPath(){},rect(...args){ops.rects.push(args)},clip(){ops.clips++},
        fillRect(...args){ops.rects.push(args)},
        createRadialGradient(...args) {ops.gradients++;assert.ok(args.every(Number.isFinite));
            return {addColorStop() {ops.stops++}}; },
        ellipse(...args) {ops.ellipses.push(args)},fill(){},
    };
    return {ctx,ops};
}

test('F6-01/F6-02: art pack points to actual FBX render and all ten repository photographic references', () => {
    assert.equal(pack.schemaVersion,1);
    assert.equal(pack.phase,6);
    assert.equal(pack.sources.referenceFiles.length,10);
    assert.equal(pack.sources.floorplan,'assets/environments/demian-fbx/polished-v1/preview.webp');
    assert.equal(art.version,'cafe-polished-v1');
    assert.match(art.sourceSha256,/^[a-f0-9]{64}$/);
    for (const f of [pack.sources.floorplan, ...pack.sources.referenceFiles.map(x => pack.sources.referenceRoot + x)]) {
        assert.ok(!f.includes('..'), 'no path traversal in source inventory');
        assert.ok(existsSync(new URL('../../public/' + f, import.meta.url)), 'missing art input: '+f);
    }
    for (const value of Object.values(pack.materials)) assert.ok(Object.hasOwn(CAFE_MATERIALS,value),value);
    assert.equal(pack.visualApproval,'pending-on-site-reference-review');
});

test('F6-03: depth queue paints sorted Z and keeps stable ties even with invalid coordinates', () => {
    const order=[];
    const q=new PixelRenderQueue();
    q.add({layer:20,y:5,draw:()=>order.push('front')});
    q.add({layer:20,y:-5,draw:()=>order.push('back')});
    q.add({layer:20,y:-5,draw:()=>order.push('back-tie')});
    q.add({layer:10,y:100,draw:()=>order.push('floor')});
    q.add({layer:NaN,y:Infinity,draw:()=>order.push('invalid')});
    assert.equal(q.add({draw:null}),false);
    q.flush({});
    assert.deepEqual(order,['invalid','floor','back','back-tie','front']);
    assert.equal(q.items.length,0);
    assert.equal(q.serial,0);
});

test('F6-04/F6-09: day/night light effects are capped per tier with no animated pass on weak devices', () => {
    assert.deepEqual(Object.keys(CAFE_VISUAL_PROFILES),['performance','balanced','high']);
    assert.deepEqual(pack.atmosphereMatrix,['day','night']);
    assert.equal(cafeVisualProfile('performance').glowSources,0);
    assert.equal(cafeVisualProfile('performance').dust,0);
    assert.equal(cafeVisualProfile('high',true).dust,0);
    assert.equal(CAFE_LIGHTING.night.wash,pack.palettes.night.light);
    assert.equal(CAFE_LIGHTING.day.lamp,pack.palettes.day.glow);
    for (const {w,h} of pack.deviceViewportMatrix) for (const atmosphere of pack.atmosphereMatrix) {
        const camera=makeCamera(w,h);
        for (const tier of ['performance','balanced','high']) {
            const {ctx,ops}=canvasSpy();
            const count=drawCafeLightfield(ctx,camera,{quality:tier,atmosphere});
            assert.ok(count>=0 && count<=CAFE_VISUAL_PROFILES[tier].glowSources);
            assert.equal(ops.save,ops.restore);
            assert.ok(ops.clips>=1 && ops.rects.length>=1);
            assert.ok(ops.rects.every(args=>args.every(Number.isFinite)));
        }
        const profile=cafeQualityProfile('auto','performance');
        assert.ok(cafeArtLevel(camera,profile)?.width<=profile.maxWidth ||
            cafeArtLevel(camera,profile)===null);
    }
});

test('F6-05/F6-06: parallax motes deterministic, viewport bounded, and disabled under reduced motion', () => {
    for (const tier of ['performance','balanced','high']) {
        const camera=makeCamera(390,844);
        const before=canvasSpy(),after=canvasSpy();
        const a=drawCafeAmbientMotes(before.ctx,camera,{time:42,quality:tier});
        const b=drawCafeAmbientMotes(after.ctx,camera,{time:42,quality:tier});
        assert.equal(a,b);
        assert.deepEqual(before.ops.rects,after.ops.rects);
        assert.equal(a,CAFE_VISUAL_PROFILES[tier].dust);
        assert.equal(before.ops.save,before.ops.restore);
        assert.ok(before.ops.rects.every(args=>args[0]>=0&&args[0]<390&&args[1]>=0&&args[1]<844));
    }
    const camera=makeCamera();
    const spy=canvasSpy();
    assert.equal(drawCafeAmbientMotes(spy.ctx,camera,{quality:'high',reducedMotion:true}),0);
    assert.equal(drawCafeAmbientMotes(spy.ctx,camera,{quality:'high',time:Infinity,reducedMotion:true}),0);
    assert.equal(spy.ops.rects.length,0);
});

test('F6-07: feet stay at the visual ground anchor; jumping reduces shadow instead of moving it', () => {
    const low=canvasSpy(), high=canvasSpy(),perf=canvasSpy();
    assert.equal(drawCafeGroundShadow(low.ctx,{x:120,y:220,bodyWidth:44,bodyHeight:90,elevation:0}),true);
    assert.equal(drawCafeGroundShadow(high.ctx,{x:120,y:220,bodyWidth:44,bodyHeight:90,elevation:3.2}),true);
    assert.equal(drawCafeGroundShadow(perf.ctx,{x:120,y:220,bodyWidth:44,bodyHeight:90,quality:'performance'}),true);
    assert.equal(low.ops.ellipses.length,2);
    assert.equal(high.ops.ellipses.length,2);
    assert.equal(perf.ops.ellipses.length,1);
    assert.equal(low.ops.ellipses[0][0],high.ops.ellipses[0][0]);
    assert.equal(low.ops.ellipses[0][1],high.ops.ellipses[0][1]);
    assert.ok(low.ops.ellipses[0][2]>high.ops.ellipses[0][2]);
    assert.equal(drawCafeGroundShadow(canvasSpy().ctx,{x:NaN,y:0,bodyWidth:1,bodyHeight:1}),false);
});

test('F6-08: every valid FBX collider uses identical projected pixel footprint as fallback art', () => {
    assert.ok(CAFE_STATIC_COLLIDERS.length>=10);
    for (const {w,h} of pack.deviceViewportMatrix) {
        const camera=makeCamera(w,h);
        let valid=0;
        for (const object of CAFE_STATIC_COLLIDERS) {
            const r=cafeObjectScreenRect(camera,object);
            if (!r) continue;
            assert.deepEqual(r,camera.worldRect(object.position,object.halfExtents));
            assert.ok(r.width>=1&&r.height>=1);
            valid++;
        }
        assert.ok(valid>=10);
    }
    assert.equal(cafeObjectScreenRect(makeCamera(),{position:{x:0,z:0},halfExtents:{x:0,z:1}}),null);
});

test('F6-10: all seven games map to the shared art source or a themed 2D renderer', () => {
    assert.deepEqual(new Set(pack.affectedGameIds),new Set(GAME_CATALOG.map(g=>g.id)));
    const shared=['CafePixelRenderer','CafeGameRenderer2D','CafeWalkthroughPainter'];
    for (const name of shared) assert.ok(read('../../resources/js/game/rendering2d/'+name+'.js').length>100);
    const base=read('../../resources/js/game/rendering2d/CafePixelRenderer.js');
    assert.match(base,/drawCafeLightfield/);
    assert.match(read('../../resources/js/game/games/open-world/render/OpenWorldPixelRenderer.js'),/drawCafeAmbientMotes/);
    for (const id of ['after-hours','cafe-rush','cafe-critters','coffee-crash']) {
        const f={'after-hours':'AfterHoursRenderer','cafe-rush':'CafeRushRenderer',
            'cafe-critters':'CafeCrittersRenderer','coffee-crash':'CoffeeCrashRenderer'}[id];
        assert.match(read('../../resources/js/game/games/'+id+'/'+f+'.js'),/CafeGameRenderer2D/);
    }
    for (const id of ['dino-run','cafe-drift']) {
        const f=id==='dino-run'?'DinoRunEnvironment':'CafeDriftRenderer';
        assert.match(read('../../resources/js/game/games/'+id+'/'+f+'.js'),/CAFE_MATERIALS/);
    }
    const visual=read('../../tools/check_phase06_visual_cafe.mjs');
    assert.match(visual,/320, height: 568/);
    assert.match(visual,/390, height: 844/);
    assert.match(visual,/768, height: 1024/);
    assert.match(visual,/1440, height: 900/);
});
