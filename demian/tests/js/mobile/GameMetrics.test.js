import test from 'node:test';
import assert from 'node:assert/strict';
import EventBus from '../../../resources/js/game/core/EventBus.js';
import GameMetrics from '../../../resources/js/game/performance/GameMetrics.js';

test('RUM measures navigation-to-menu and the presented playable frame, then unsubscribes', () => {
    const bus = new EventBus();
    const samples = [];
    const metrics = new GameMetrics({ eventBus: bus, clock: () => 1700,
        telemetry: { emit: (...args) => samples.push(args) } });
    bus.emit('application:boot-timing', { durationMs: 100 });
    bus.emit('game:load-timing', { gameId: 'open-world', durationMs: 200 });
    assert.deepEqual(samples, [['menu_ready', { durationMs: 1700 }]]);
    bus.emit('game:first-playable-frame', { gameId: 'open-world', durationMs: 2800 });
    assert.deepEqual(samples[1], ['game_load', { game: 'open-world', durationMs: 2800 }]);
    metrics.dispose();
    bus.emit('game:load-failed', { gameId: 'dino-run' });
    assert.equal(samples.length, 2);
});
