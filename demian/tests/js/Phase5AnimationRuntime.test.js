import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import FrameAnimator from '../../resources/js/game/characters/FrameAnimator.js';
import CanvasCharacterAvatar from '../../resources/js/game/characters/CanvasCharacterAvatar.js';
import { advanceCharacterAnimation } from '../../resources/js/game/characters/CharacterMotionProfile.js';
import { BUILTIN_CHARACTER_SLUGS } from '../../resources/js/game/characters/CharacterVisualContract.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const frames = (n, prefix = 'f') => Array.from({ length: n }, (_, i) => prefix + i);
const atlas = (n = 8, slug = 'darya') => ({
    meta: { slug }, animations: {
        idle: { frames: frames(n), fps: 8, loop: true },
        run: { frames: frames(n), fps: 16, cycleCount: 2, loop: true },
        walk: { frames: frames(n), fps: 8, cycleCount: 1, loop: true },
        land: { frames: frames(n), fps: 12, loop: false },
        turn: { framesByDirection: { e: frames(n, 'e'), w: frames(n / 2, 'w') }, fps: 12, loop: true },
    },
    motion: { locomotionProfile: { strideLengths: { walk: 3.4, run: 6, sprint: 6.4 }, maxStrideHz: 1.55 } },
});

test('quality upgrade preserves fractional cycle, directional state, gait and master pose without replaying foot contact', () => {
    const old = new FrameAnimator(atlas());
    old.setFacing(-1); old.setDirection('w'); old.play('run'); old.seekLoop(.317);
    old.locomotionPhase = .634; old.locomotionFrequency = 1.2; old.motionState = 'run';
    old.masterMotion.sync({ state: 'run', phase: .634, facing: -1, deltaTime: .12 });
    const next = new FrameAnimator(atlas(24));
    next.adoptPlaybackFrom(old);
    near(next.continuousProgress(), old.continuousProgress());
    near(next.locomotionPhase, .634); near(next.locomotionFrequency, 1.2);
    assert.equal(next.motionState, 'run');
    assert.equal(next.facing, -1); assert.equal(next.direction, 'w');
    assert.deepEqual(next.masterMotion.pose, old.masterMotion.pose);
    assert.deepEqual(next.masterMotion.events, []);
    near(next.masterMotion.elapsed, old.masterMotion.elapsed);
    advanceCharacterAnimation(next, { state: 'run', movementSpeed: 6, travelledDistance: .1, deltaTime: 1/60 });
    near(next.locomotionPhase, .634 + .1/6);
});

test('quality upgrade preserves finished one-shot and fractional terminal hold', () => {
    const old = new FrameAnimator(atlas());
    old.play('land'); old.seek(1);
    const next = new FrameAnimator(atlas(24));
    next.adoptPlaybackFrom(old);
    assert.equal(next.finished, true); assert.equal(next.frameIndex, 23);
    next.update(.2); assert.equal(next.frameIndex, 23);
    old.play('land', { restart: true }); old.seek(.43);
    next.adoptPlaybackFrom(old);
    near(next.continuousProgress(), .43); assert.equal(next.finished, false);
});

test('direction changes with unequal frame counts preserve phase and do not sample obsolete artwork', () => {
    const a = new FrameAnimator(atlas());
    a.play('turn'); a.seekLoop(.625); a.captureStep(); a.setDirection('w');
    near(a.continuousProgress(), .625);
    assert.equal(a.currentFrameName(), 'w2');
    assert.equal(a.sample(0).frameName, 'w2');
    a.setDirection('e'); near(a.continuousProgress(), .625);
});

test('explicit restart never interpolates old samples and clock playback interpolates across multiple loops', () => {
    const a = new FrameAnimator({ animations: { idle: { frames: ['a','b','c','d'], fps: 40, loop: true } } });
    a.play('idle'); a.seekLoop(.75); a.captureStep(); a.play('idle', { restart: true });
    assert.equal(a.sample(0).frameName, 'a');
    a.captureStep(); a.update(.25);
    assert.equal(a.sample(.5).frameName, 'b');
    assert.equal(a.sample(1).frameName, 'c');
    assert.equal(a.currentFrameName(), 'c');
});

test('missing aliases resolve documented fallback chains while explicit fallbacks and retired combat remain safe', () => {
    const a = new FrameAnimator(atlas());
    assert.equal(a.play('sprint'), 'run');
    assert.equal(a.play('slide'), 'run');
    assert.equal(a.play('attack'), 'idle');
    a.atlas.fallbacks = { sprint: 'walk' };
    assert.equal(a.play('sprint'), 'walk');
});

test('nonfinite timing is bounded and zero real travel reports zero cadence', () => {
    const a = new FrameAnimator(atlas()); a.play('run');
    a.seekLoop(Infinity); a.setPlaybackRate(Infinity); a.update(Infinity);
    assert.equal(a.frameIndex, 0); assert.equal(a.playbackRate, 1);
    advanceCharacterAnimation(a, { state: 'run', movementSpeed: 6, travelledDistance: 0, deltaTime: .016 });
    near(a.locomotionPhase, 0); near(a.locomotionFrequency, 0);
    assert.ok(Number.isFinite(a.frameProgress()));
});

test('all 18 shipped lite and runtime atlas upgrades keep phase without changing character identity', () => {
    for (const slug of BUILTIN_CHARACTER_SLUGS) {
        const read = variant => JSON.parse(readFileSync(new URL(`../../public/assets/characters/${slug}/${slug}-atlas-v14-${variant}.json`, import.meta.url), 'utf8'));
        const avatar = new CanvasCharacterAvatar({ slug, atlas: read('lite'), image: {} });
        const actor = { position: { x: 0, z: 0 }, speed: 6, forward: { x: 1, z: 0 }, grounded: true };
        for (let i = 0; i < 19; ++i) avatar.sync(actor, 1/60);
        const before = avatar.animator;
        avatar.replaceVisualAssets({}, read('runtime'));
        const after = avatar.animator;
        near(after.locomotionPhase, before.locomotionPhase);
        near(after.continuousProgress(), before.continuousProgress());
        assert.equal(after.masterMotion.definition.slug, slug);
        assert.deepEqual(after.masterMotion.events, []);
        avatar.sync(actor, 1/60);
        near(avatar.animator.locomotionPhase, (before.locomotionPhase + 1/60) % 8);
    }
});

test('position-only teleport and malformed presentation time cannot create artificial walking', () => {
    const avatar = new CanvasCharacterAvatar({ slug: 'darya', atlas: atlas(), image: {} });
    avatar.sync({ position: { x: 0, z: 0 } }, .016);
    avatar.sync({ position: { x: 50, z: 0 } }, .016);
    assert.equal(avatar.state, 'idle');
    avatar.sync({ position: { x: Infinity, z: NaN } }, Infinity);
    assert.equal(avatar.position.x, 50);
    assert.ok(Number.isFinite(avatar.presentationTime));
});
