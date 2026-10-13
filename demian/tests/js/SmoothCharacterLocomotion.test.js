import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import FrameAnimator from '../../resources/js/game/characters/FrameAnimator.js';
import CanvasCharacterAvatar from '../../resources/js/game/characters/CanvasCharacterAvatar.js';
import { advanceCharacterAnimation } from '../../resources/js/game/characters/CharacterMotionProfile.js';
import { CHARACTER_STRIDE_LENGTHS, characterGravity, groundLocomotionState } from '../../resources/js/game/characters/CharacterLocomotionModel.js';
import { BUILTIN_CHARACTER_SLUGS } from '../../resources/js/game/characters/CharacterVisualContract.js';
import { characterSpriteRevisionUrl } from '../../resources/js/game/characters/CharacterVisualContract.js';
import CharacterVisualService from '../../resources/js/game/characters/runtime/CharacterVisualService.js';
import DinoRunModel, { RUNNER_CONFIG } from '../../resources/js/game/games/dino-run/DinoRunModel.js';
import { INPUT_CONTEXTS } from '../../resources/js/game/input/InputContexts.js';

const read = (slug, variant = 'runtime') => JSON.parse(readFileSync(resolve(import.meta.dirname,
    `../../public/assets/characters/${slug}/${slug}-atlas-v14-${variant}.json`), 'utf8'));
const close = (a, b, label = '') => assert.ok(Math.abs(a - b) < 1e-8, `${label}: ${a} != ${b}`);

test('travelled-distance gait has the same phase at 30, 60 and 120 Hz on all six characters', () => {
    for (const slug of BUILTIN_CHARACTER_SLUGS) for (const hz of [30, 60, 120]) {
        const avatar = new CanvasCharacterAvatar({slug, atlas:read(slug), image:{}});
        const actor = {position:{x:0,z:0},speed:6,forward:{x:1,z:0},grounded:true};
        for (let i = 0; i < hz * 1.9; i++) avatar.sync(actor, 1 / hz);
        close(avatar.animator.locomotionPhase, 1.9, `${slug}/${hz}`);
        close(avatar.animator.locomotionFrequency, 1);
        const a = avatar.animator;
        close(((a.frameIndex+a.frameProgress())/a.currentFrames().length*a.animation.cycleCount)%1,.9);
    }
});

test('slower travel advances fewer limb poses and a blocked step holds its exact supporting-foot phase', () => {
    const data = read('tiam'), a = new FrameAnimator(data); a.play('run');
    advanceCharacterAnimation(a,{state:'run',movementSpeed:3,travelledDistance:.6,deltaTime:.2});
    close(a.locomotionPhase,.1);
    const frame = a.currentFrameName(), fraction=a.frameProgress();
    for (let i = 0; i < 30; i++) advanceCharacterAnimation(a,{state:'run',movementSpeed:0,travelledDistance:0,deltaTime:1/60});
    assert.equal(a.currentFrameName(),frame);close(a.frameProgress(),fraction);
    advanceCharacterAnimation(a,{state:'run',movementSpeed:6,travelledDistance:1.2,deltaTime:.2});
    close(a.locomotionPhase,.3);
});

test('walk/run/sprint switches preserve fractional foot phase even in Tiam two-cycle clips', () => {
    for (const slug of BUILTIN_CHARACTER_SLUGS) {
        const a = new FrameAnimator(read(slug));a.play('walk');
        advanceCharacterAnimation(a,{state:'walk',movementSpeed:3.4,deltaTime:.23});
        for (const state of ['run','sprint','walk']) {
            a.play(state,{preservePhase:true});
            advanceCharacterAnimation(a,{state,movementSpeed:6,deltaTime:0});
            close(a.locomotionPhase,.23,slug);
            close((a.frameIndex+a.frameProgress())/a.currentFrames().length*a.animation.cycleCount,.23,slug);
        }
    }
});

test('a stopped actor is not animated as walking after a teleport and threshold noise does not alternate gaits', () => {
    const avatar = new CanvasCharacterAvatar({slug:'uzudi',atlas:read('uzudi'),image:{}});
    avatar.sync({speed:0,position:{x:0,z:0}},.016);
    avatar.sync({speed:0,position:{x:50,z:0}},.016);assert.equal(avatar.state,'idle');
    assert.equal(groundLocomotionState(4.6,'walk'),'walk');
    assert.equal(groundLocomotionState(4.8,'walk'),'run');
    assert.equal(groundLocomotionState(4.6,'run'),'run');
    assert.equal(groundLocomotionState(4,'run'),'walk');
});

test('AmirReza and Uzudi share the complete movement model and denser runtime limb sampling', () => {
    for (const variant of ['desktop','mobile','compact','runtime','lite']) {
        assert.deepEqual(read('amirreza',variant).motion.locomotionProfile,read('uzudi',variant).motion.locomotionProfile);
        assert.deepEqual(read('amirreza',variant).motion.locomotionProfile.strideLengths,CHARACTER_STRIDE_LENGTHS);
    }
    for (const slug of BUILTIN_CHARACTER_SLUGS) for (const variant of ['runtime','lite']) {
        const data=read(slug,variant);
        const cells = name => new Set(data.animations[name].frames.map(id=>`${data.frames[id].x}:${data.frames[id].y}`)).size;
        assert.ok(cells('walk') >= (variant==='runtime'?32:22),`${slug}/${variant} walk`);
        assert.ok(cells('run') >= (variant==='runtime'?40:27),`${slug}/${variant} run`);
        assert.ok(cells('jump') >= 3,`${slug}/${variant} apex`);
        assert.ok(data.meta.decodedBytes <= (variant==='runtime'?12:4)*1024**2);
    }
});

test('dense one-shots finish after a stalled frame without accumulating an animation backlog', () => {
    const data={frames:Object.fromEntries(Array.from({length:64},(_,i)=>[`f${i}`,{}])),animations:{
        land:{frames:Array.from({length:20},(_,i)=>`f${i}`),fps:200,loop:false},
        run:{frames:Array.from({length:64},(_,i)=>`f${i}`),fps:240,loop:true}}};
    const a=new FrameAnimator(data);a.play('land');a.update(.25);
    assert.equal(a.finished,true);assert.equal(a.frameIndex,19);assert.equal(a.elapsed,0);
    a.play('run');a.update(.25);assert.equal(a.frameIndex,60);
    a.update(.01);assert.equal(a.frameIndex,62);close(a.frameProgress(),.4);
});

test('buffered runner jump starts on the exact landing tick and slide still takes precedence', () => {
    for (const duck of [false,true]) {
        const m=new DinoRunModel({seed:1});m.status='running';m.spawnIn=999;m.y=.01;m.vy=-20;
        m.step(1/60,{jump:true,jumpHeld:true,duck});
        assert.equal(m.y,0);
        if (duck) {assert.equal(m.vy,0);assert.equal(m.duck,true);assert.ok(m.jumpBuffer>0);}
        else {assert.equal(m.vy,RUNNER_CONFIG.jumpSpeed);assert.equal(m.jumpBuffer,0);assert.equal(m.landingTime,0);}
    }
});

test('both games use held-jump input and the same gentle apex / released-rise gravity rules', () => {
    assert.equal(INPUT_CONTEXTS.OPEN_WORLD.actions.jumpHeld.mode,'hold');
    assert.equal(INPUT_CONTEXTS.DINO_RUN.actions.jumpHeld.mode,'hold');
    close(characterGravity(0,6.8,17.5,true)/17.5,characterGravity(0,650,1750,true)/1750);
    assert.ok(characterGravity(0,6.8,17.5,true)<17.5);
    assert.ok(characterGravity(6,6.8,17.5,false)>17.5);
    assert.equal(characterGravity(-4,6.8,17.5,false),17.5);
    close(characterGravity(6.8*.18,6.8,17.5,true),17.5);
    assert.ok(characterGravity(6.8*.09,6.8,17.5,true)>17.5*.65);
});

test('image revision replaces an old cache key while preserving asset queries and fragments', () => {
    const revision='a'.repeat(64);
    const url=characterSpriteRevisionUrl('/assets/sprite.png?variant=lite&sprite_rev=old#frame',{meta:{imageRevision:revision}});
    const parsed=new URL(url,'https://demian.test');
    assert.equal(parsed.searchParams.get('sprite_rev'),revision);
    assert.equal(parsed.searchParams.getAll('sprite_rev').length,1);
    assert.equal(parsed.searchParams.get('variant'),'lite');
    assert.equal(parsed.hash,'#frame');
    assert.equal(characterSpriteRevisionUrl('/assets/sprite.png',{meta:{}}),'/assets/sprite.png');
});

test('the actual pack loader requests the sprite revision paired with the freshly fetched atlas', async () => {
    const atlas=read('uzudi'),originalFetch=globalThis.fetch;
    let fetched,loaded;
    globalThis.fetch=async(url,options)=>{fetched={url,options};return {ok:true,json:async()=>atlas};};
    try {
        const service=new CharacterVisualService({storage:null});
        service.loadImage=async(url)=>{loaded=url;return {naturalWidth:1536,naturalHeight:1920};};
        const pack=await service.loadPair('uzudi','runtime');
        assert.equal(fetched.options.cache,'no-cache');
        assert.equal(new URL(loaded,'https://demian.test').searchParams.get('sprite_rev'),atlas.meta.imageRevision);
        assert.equal(pack.spriteUrl,loaded);
        service.dispose();
    } finally {globalThis.fetch=originalFetch;}
});
