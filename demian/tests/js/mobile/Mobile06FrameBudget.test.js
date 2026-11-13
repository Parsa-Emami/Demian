import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRenderFrameRate } from '../../../resources/js/game/performance/FrameRatePolicy.js';
import RendererService from '../../../resources/js/game/services/RendererService.js';
import DeviceQaSession from '../../../resources/js/game/performance/DeviceQaSession.js';

test('menu and non-interactive screens cap presentation at 30 while gameplay keeps the chosen rate', () => {
    for (const screen of ['booting', 'menu', 'loading', 'paused', 'results']) {
        assert.equal(resolveRenderFrameRate({ sessionState: screen, preference: '60' }), 30);
    }
    assert.equal(resolveRenderFrameRate({ sessionState: 'playing', preference: 'auto' }), 60);
    assert.equal(resolveRenderFrameRate({ sessionState: 'playing', preference: '60', economical: true }), 60);
    assert.equal(resolveRenderFrameRate({ sessionState: 'playing', preference: '30' }), 30);
    assert.equal(resolveRenderFrameRate({ sessionState: 'playing', preference: 'auto', economical: true }), 30);
    assert.equal(resolveRenderFrameRate({ sessionState: 'menu', preference: 'auto' }), 30);
});

test('renderer skips main-thread DOM size reads during unchanged ResizeObserver-backed frames', () => {
    const renderer = Object.create(RendererService.prototype);
    const size = { width: 390, height: 844, logicalWidth: 390, logicalHeight: 844 };
    Object.assign(renderer, {
        resizeObserver: { observe() {} }, layoutDirty: false,
        size, deviceRatio: 1, lastWidth: 390, lastHeight: 844,
        dimensions: () => { throw new Error('layout read on every frame'); },
        resize: () => { throw new Error('unnecessary canvas resize'); },
    });
    for (let frame = 0; frame < 500; frame++) assert.equal(renderer.ensureSize(), size);
});

test('resize observer invalidation and fallback without observer still detect geometry changes', () => {
    const renderer = Object.create(RendererService.prototype);
    const size = { width: 390, height: 844 };
    let resizeCount = 0, dimensionsCount = 0;
    Object.assign(renderer, {
        resizeObserver: { observe() {} }, layoutDirty: true,
        size, deviceRatio: 1, lastWidth: 390, lastHeight: 844,
        dimensions: () => { dimensionsCount++; return { width: 420, height: 800 }; },
        resize: () => { resizeCount++; return { width: 420, height: 800 }; },
    });
    assert.deepEqual(renderer.ensureSize(), { width: 420, height: 800 });
    assert.equal(resizeCount, 1);
    renderer.layoutDirty = false;
    renderer.resizeObserver = null;
    renderer.lastWidth = 390;
    renderer.lastHeight = 844;
    renderer.ensureSize();
    assert.equal(dimensionsCount, 2, 'fallback reads current geometry without ResizeObserver');
    assert.equal(resizeCount, 2);
});

test('opt-in device QA reports bounded JS frame workload, without claiming battery or GPU evidence', () => {
    const session = new DeviceQaSession({ now: () => 0 });
    session.start();
    session.sampleFrameWork(3.2);
    session.sampleFrameWork(6.8);
    session.sampleFrameWork(-1);
    session.sampleFrameWork(Infinity);
    session.sampleFrameWork(NaN);
    const report = session.stop();
    assert.equal(report.frameCpuWorkMs.count, 2);
    assert.equal(report.frameCpuWorkMs.mean, 5);
    assert.equal(report.physicalPhoneVerified, false);
    assert.ok(report.limitations.some(limit => limit.includes('not GPU execution time')));
    session.sampleFrameWork(12);
    assert.equal(session.report().frameCpuWorkMs.count, 2);
});
