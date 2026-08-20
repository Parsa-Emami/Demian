import assert from 'node:assert/strict';
import test from 'node:test';
import {
    resolvePreviewFrame,
    resolvePreviewFrameName,
} from '../../resources/js/ui/CharacterPreviewRenderer.js';

test('character preview prefers the east idle frame for directional atlases', () => {
    const atlas = {
        frames: {
            idle_w_00: { x: 0, y: 0, w: 192, h: 192 },
            idle_e_00: { x: 192, y: 0, w: 192, h: 192 },
        },
        animations: {
            idle: {
                frames: ['idle_e_00'],
                framesRight: ['idle_e_00'],
                framesLeft: ['idle_w_00'],
                framesByDirection: {
                    e: ['idle_e_00'],
                    w: ['idle_w_00'],
                },
            },
        },
    };

    assert.equal(resolvePreviewFrameName(atlas), 'idle_e_00');
    assert.deepEqual(resolvePreviewFrame(atlas), {
        name: 'idle_e_00',
        x: 192,
        y: 0,
        w: 192,
        h: 192,
    });
});

test('character preview supports TexturePacker-style nested frame rectangles', () => {
    const atlas = {
        frames: {
            idle_00: { frame: { x: 4, y: 8, w: 64, h: 96 } },
        },
        animations: {
            idle: { frames: ['idle_00'] },
        },
    };

    assert.deepEqual(resolvePreviewFrame(atlas), {
        name: 'idle_00',
        x: 4,
        y: 8,
        w: 64,
        h: 96,
    });
});
