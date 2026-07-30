import test from 'node:test';
import assert from 'node:assert/strict';
import ReplayPlayer from '../../../resources/js/game/games/tetris/replay/ReplayPlayer.js';
import ReplayRecorder from '../../../resources/js/game/games/tetris/replay/ReplayRecorder.js';

test('Replay recorder stores only semantic input changes', () => {
    const recorder = new ReplayRecorder({ seed: 'replay-seed' });
    recorder.record(0, {});
    recorder.record(1, {});
    recorder.record(2, { moveLeft: true });
    recorder.record(3, { moveLeft: true });
    recorder.record(4, {});
    const replay = recorder.export();

    assert.equal(replay.events.length, 3);
    assert.deepEqual(replay.events.map((entry) => entry.tick), [0, 2, 4]);
});

test('Replay player restores held and pressed semantic inputs by tick', () => {
    const recorder = new ReplayRecorder({ seed: 'replay-seed' });
    recorder.record(0, {});
    recorder.record(2, { moveRight: true });
    recorder.record(5, { hardDrop: true });
    recorder.record(6, {});
    const player = new ReplayPlayer(recorder.export());

    assert.deepEqual(player.inputAt(1), {});
    assert.deepEqual(player.inputAt(3), { moveRight: true });
    assert.deepEqual(player.inputAt(5), { hardDrop: true });
    assert.deepEqual(player.inputAt(7), {});
});

test('Replay player rejects malformed input events', () => {
    assert.throws(() => new ReplayPlayer({
        version: 1,
        seed: 'bad',
        fixedStep: 1 / 60,
        events: [{ tick: -1, input: {} }],
    }), /invalid input event/);
});
