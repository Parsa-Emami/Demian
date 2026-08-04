import test from 'node:test';
import assert from 'node:assert/strict';
import {
    UI_LAYER,
    assignUiLayer,
    isUiLayer,
    uiLayerOf,
} from '../../../resources/js/game/ui/UiLayer.js';

test('UiLayer exposes unique semantic layer tokens', () => {
    const layers = Object.values(UI_LAYER);

    assert.equal(layers.length, 21);
    assert.equal(new Set(layers).size, layers.length);
    assert.ok(Object.isFrozen(UI_LAYER));
    assert.ok(layers.every((layer) => isUiLayer(layer)));
});

test('UiLayer assigns and reads a semantic layer from dataset', () => {
    const element = { dataset: {} };

    const assigned = assignUiLayer(element, UI_LAYER.GAME_OVERLAY);

    assert.equal(assigned, element);
    assert.equal(element.dataset.uiLayer, 'game-overlay');
    assert.equal(uiLayerOf(element), UI_LAYER.GAME_OVERLAY);
    assert.equal(uiLayerOf(null), null);
});

test('UiLayer rejects invalid elements and unknown layer tokens', () => {
    assert.throws(
        () => assignUiLayer(null, UI_LAYER.HUD),
        /requires an element with a dataset/
    );
    assert.throws(
        () => assignUiLayer({}, UI_LAYER.HUD),
        /requires an element with a dataset/
    );
    assert.throws(
        () => assignUiLayer({ dataset: {} }, 'neon-world'),
        /Unknown Demian UI layer/
    );
    assert.equal(isUiLayer('neon-world'), false);
});
