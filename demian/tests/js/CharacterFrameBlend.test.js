import assert from 'node:assert/strict';
import test from 'node:test';
import FrameAnimator from '../../resources/js/game/characters/FrameAnimator.js';
import { drawSpriteCharacter } from '../../resources/js/game/rendering2d/PixelActorRenderer.js';

function makeAtlas({ frameBlend = false, frameBlendMaxAlpha = 0.3 } = {}) {
    return {
        animations: {
            idle: { frames: ['idle_00', 'idle_01', 'idle_02'], fps: 10, loop: true },
        },
        fallbacks: {},
        frames: {
            idle_00: { x: 0, y: 0, w: 10, h: 10 },
            idle_01: { x: 10, y: 0, w: 10, h: 10 },
            idle_02: { x: 20, y: 0, w: 10, h: 10 },
        },
        pivot: { x: 0.5, y: 0.96 },
        display: { worldHeight: 3.75 },
        render: { referenceBodyHeightRatio: 0.86, frameBlend, frameBlendMaxAlpha },
    };
}

test('FrameAnimator.frameProgress/nextFrameName are pure, side-effect-free interpolation hooks', () => {
    const animator = new FrameAnimator(makeAtlas());
    animator.play('idle');

    assert.equal(animator.frameProgress(), 0);
    assert.equal(animator.nextFrameName(), 'idle_01');

    // Halfway through frame 0 (fps=10 -> 0.1s per frame).
    animator.update(0.05);
    assert.ok(animator.frameProgress() > 0.4 && animator.frameProgress() < 0.6);
    assert.equal(animator.currentFrameName(), 'idle_00');
    assert.equal(animator.nextFrameName(), 'idle_01');

    // Crossing into frame 1 resets sub-frame progress and calling the hooks
    // again must not itself change frame/elapsed state (read-only).
    animator.update(0.1);
    assert.equal(animator.currentFrameName(), 'idle_01');
    const before = animator.frameProgress();
    animator.frameProgress();
    animator.nextFrameName();
    assert.equal(animator.frameProgress(), before);

    // Looping back to the start after the last frame.
    animator.update(0.1);
    animator.update(0.1);
    assert.equal(animator.currentFrameName(), 'idle_00');
});

test('nextFrameName returns null for single-frame (non-loopable) animations', () => {
    const atlas = makeAtlas();
    atlas.animations.pose = { frames: ['idle_00'], fps: 6, loop: false };
    const animator = new FrameAnimator(atlas);
    animator.play('pose');
    assert.equal(animator.nextFrameName(), null);
});

function makeMockCtx() {
    const calls = { drawImage: [], globalAlphaHistory: [] };
    const ctx = {
        _globalAlpha: 1,
        get globalAlpha() {
            return this._globalAlpha;
        },
        set globalAlpha(value) {
            this._globalAlpha = value;
            calls.globalAlphaHistory.push(value);
        },
        imageSmoothingEnabled: true,
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: '',
        save() {},
        restore() {},
        translate() {},
        rotate() {},
        beginPath() {},
        ellipse() {},
        fill() {},
        stroke() {},
        fillRect() {},
        fillText() {},
        drawImage(...args) {
            calls.drawImage.push({ args, alphaAtCall: this._globalAlpha });
        },
    };
    return { ctx, calls };
}

function makeEntity(atlas, frameName) {
    return {
        atlas,
        isPlayerControlled: false,
        texture: { image: { complete: true, naturalWidth: 30, naturalHeight: 10 } },
        group: { position: { x: 0, z: 0 } },
        visual: { width: 1, height: 1, bob: 0, tilt: 0, x: 0, y: 0 },
        visualHeight: () => 3.75,
        animator: {
            currentFrameName: () => frameName,
            nextFrameName: () => 'idle_01',
            frameProgress: () => 0.5,
        },
    };
}

const camera = { pixelsPerUnit: 10, worldToScreen: () => ({ x: 100, y: 100 }) };

test('drawSpriteCharacter draws exactly one frame when render.frameBlend is unset (default, unchanged behaviour)', () => {
    const { ctx, calls } = makeMockCtx();
    const entity = makeEntity(makeAtlas({ frameBlend: false }), 'idle_00');
    drawSpriteCharacter(ctx, camera, entity);
    assert.equal(calls.drawImage.length, 1);
});

test('drawSpriteCharacter cross-fades in the next frame when render.frameBlend is enabled', () => {
    const { ctx, calls } = makeMockCtx();
    const entity = makeEntity(makeAtlas({ frameBlend: true, frameBlendMaxAlpha: 0.3 }), 'idle_00');
    drawSpriteCharacter(ctx, camera, entity);
    assert.equal(calls.drawImage.length, 2);
    // First call: current frame, drawn fully opaque at the base alpha.
    assert.equal(calls.drawImage[0].alphaAtCall, 1);
    // Second call: next frame, drawn at progress(0.5) * maxAlpha(0.3) = 0.15.
    assert.ok(Math.abs(calls.drawImage[1].alphaAtCall - 0.15) < 1e-9);
    // Base alpha must be restored after the blended draw (no leakage into
    // later draws/labels).
    assert.equal(ctx.globalAlpha, 1);
});
