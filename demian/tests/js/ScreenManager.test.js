import test from 'node:test';
import assert from 'node:assert/strict';
import ScreenManager from '../../resources/js/game/shell/ScreenManager.js';

function fakeScreen(id, layer = 'primary') {
    return {
        id,
        layer,
        active: false,
        calls: [],
        async open(payload) {
            this.active = true;
            this.calls.push(['open', payload]);
        },
        async refresh(payload) {
            this.calls.push(['refresh', payload]);
        },
        async close(reason) {
            this.active = false;
            this.calls.push(['close', reason]);
        },
        dispose() {
            this.calls.push(['dispose']);
        },
    };
}

test('ScreenManager serializes primary replacement and closes previous screen', async () => {
    const manager = new ScreenManager();
    const menu = fakeScreen('menu');
    const selection = fakeScreen('selection');
    manager.register(menu).register(selection);

    await manager.show('menu', { source: 'boot' });
    await manager.show('selection');

    assert.equal(manager.primaryId, 'selection');
    assert.deepEqual(menu.calls, [
        ['open', { source: 'boot' }],
        ['close', 'replace'],
    ]);
    assert.deepEqual(selection.calls, [['open', {}]]);
});

test('ScreenManager keeps modal stack separate from primary navigation', async () => {
    const manager = new ScreenManager();
    const game = fakeScreen('game');
    const pause = fakeScreen('pause', 'modal');
    const settings = fakeScreen('settings', 'modal');
    manager.register(game).register(pause).register(settings);

    await manager.show('game');
    await manager.show('pause');
    await manager.show('settings');
    await manager.closeTopModal('back');

    assert.equal(manager.primaryId, 'game');
    assert.deepEqual(manager.modalStack, ['pause']);
    assert.equal(pause.active, true);
    assert.equal(settings.active, false);
});

test('ScreenManager rejects duplicate screen identifiers', () => {
    const manager = new ScreenManager();
    manager.register(fakeScreen('menu'));
    assert.throws(() => manager.register(fakeScreen('menu')), /already registered/);
});


test('ScreenManager refreshes an already visible screen without duplicating it', async () => {
    const manager = new ScreenManager();
    const menu = fakeScreen('menu');
    manager.register(menu);

    await manager.show('menu', { step: 1 });
    await manager.show('menu', { step: 2 });

    assert.equal(manager.primaryId, 'menu');
    assert.deepEqual(menu.calls, [
        ['open', { step: 1 }],
        ['refresh', { step: 2 }],
    ]);
});
