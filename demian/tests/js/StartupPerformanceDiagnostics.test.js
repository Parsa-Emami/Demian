import test from 'node:test';
import assert from 'node:assert/strict';
import EventBus from '../../resources/js/game/core/EventBus.js';
import StartupPerformanceDiagnostics, {
    summarizeResources,
} from '../../resources/js/game/performance/StartupPerformanceDiagnostics.js';

test('resource totals omit URLs, headers, auth and query strings', () => {
    const rows = [
        { name: 'https://demiancafe.ir/build/assets/app-hash.js?token=secret', initiatorType: 'script',
            transferSize: 500, encodedBodySize: 420, decodedBodySize: 1000, duration: 12 },
        { name: 'https://demiancafe.ir/assets/characters/darya/sprites.webp?user=123',
            initiatorType: 'img', transferSize: 0, duration: 32 },
        { name: 'https://demiancafe.ir/api/v1/arcade?token=secret',
            initiatorType: 'fetch', transferSize: 300, duration: 40 },
    ];
    const report = summarizeResources(rows);
    assert.equal(report.byCategory.javascript.requests, 1);
    assert.equal(report.byCategory.sprite.requests, 1);
    assert.equal(report.byCategory.other.requests, 1);
    assert.equal(report.byCategory.javascript.transferBytes, 500);
    assert.equal(report.byCategory.sprite.transferSizeZero, 1);
    assert.equal(report.capturedResources, 3);
    assert.equal(JSON.stringify(report).includes('secret'), false);
    assert.equal(JSON.stringify(report).includes('darya'), false);
});

test('opt-in game stages and image decode are isolated, bounded and measurable', () => {
    let time = 0;
    const eventBus = new EventBus();
    const perf = {
        getEntriesByType: type => type === 'navigation' ? [{
            type: 'navigate', redirectStart: 0, redirectEnd: 0,
            domainLookupStart: 2, domainLookupEnd: 8,
            connectStart: 8, connectEnd: 14, secureConnectionStart: 10,
            requestStart: 14, responseStart: 55, responseEnd: 70,
            domContentLoadedEventEnd: 80, loadEventEnd: 95, transferSize: 1200,
        }] : [],
        setResourceTimingBufferSize() {},
    };
    const diagnostic = new StartupPerformanceDiagnostics({
        eventBus, performanceRef: perf, now: () => time,
        documentRef: null, windowRef: null, navigatorRef: null, observerClass: null,
    });
    time = 100;
    eventBus.emit('application:boot-timing', { durationMs: 36 });
    time = 110;
    eventBus.emit('game:loading', { gameId: 'dino-run' });
    time = 122;
    eventBus.emit('game:loading-step', { gameId: 'dino-run', progress: 25 });
    time = 142;
    eventBus.emit('game:loading-step', { gameId: 'dino-run', progress: 50 });
    time = 173;
    eventBus.emit('game:loading-step', { gameId: 'dino-run', progress: 75 });
    time = 180;
    eventBus.emit('game:session-started', { gameId: 'dino-run' });
    diagnostic.rendered(179);
    time = 200;
    eventBus.emit('game:loading-step', { gameId: 'dino-run', progress: 100 });
    eventBus.emit('game:load-timing', { gameId: 'dino-run', durationMs: 95 });
    diagnostic.rendered(212);
    eventBus.emit('character:image-timing', {
        variant: 'lite', background: false, loadingMs: 36.12,
        decodeMs: 7.23, width: 1024, height: 512, url: 'https://secret.invalid',
    });
    const report = diagnostic.report();
    assert.equal(report.page.menuBootMs, 36);
    assert.equal(report.page.navigation.ttfbMs, 41);
    assert.equal(report.page.javascriptParseEvaluateMs, null);
    assert.deepEqual(report.gameStarts.map(game => [
        game.moduleMs, game.assetsMs, game.sceneMs, game.sessionMs, game.firstRenderAfterSessionMs,
    ]), [[12, 20, 31, 27, 32]]);
    assert.equal(report.gameStarts[0].totalMs, 95);
    assert.equal(report.characterImages[0].decodeMs, 7.2);
    assert.equal(report.environment.serviceWorkerControlled, null);
    assert.equal(report.physicalPhoneVerified, false);
    assert.equal(JSON.stringify(report).includes('secret.invalid'), false);
    eventBus.emit('game:loading', { gameId: 'not-a-game' });
    assert.equal(diagnostic.report().gameStarts.length, 1);
    diagnostic.dispose();
    eventBus.emit('character:image-timing', { variant: 'detail' });
    assert.equal(diagnostic.report().characterImages.length, 1);
});

test('unsupported Web APIs produce null timing fields rather than false zeros', () => {
    const diagnostic = new StartupPerformanceDiagnostics({
        eventBus: new EventBus(), performanceRef: {}, now: () => 0,
        documentRef: null, windowRef: null, navigatorRef: null, observerClass: null,
    });
    const report = diagnostic.report();
    assert.equal(report.page.navigation, null);
    assert.equal(report.page.paint.largestContentfulPaintMs, null);
    assert.equal(report.page.javascriptParseEvaluateMs, null);
    assert.equal(report.longTasks.count, 0);
    assert.equal(report.network.capturedResources, 0);
    diagnostic.dispose();
});
