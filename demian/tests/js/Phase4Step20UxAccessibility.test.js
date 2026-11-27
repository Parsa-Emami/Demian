import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import BaseScreen from '../../resources/js/game/shell/screens/BaseScreen.js';
import ScreenManager from '../../resources/js/game/shell/ScreenManager.js';

function fakeElement() {
    const attrs = new Map();
    return {
        inert: false,
        hidden: true,
        dataset: {},
        setAttribute(key, value) { attrs.set(key, String(value)); },
        getAttribute(key) { return attrs.get(key) ?? null; },
        addEventListener() {},
        removeEventListener() {},
        contains(target) { return target?.owner === this; },
        querySelectorAll() { return []; },
        querySelector() { return null; },
    };
}

function screen(id, layer = 'primary') {
    return {
        id, layer, element: fakeElement(), active: false, calls: [],
        async open() { this.active = true; this.calls.push('open'); },
        async refresh() { this.calls.push('refresh'); },
        async close() { this.active = false; this.calls.push('close'); },
        focusInitialElement() { this.calls.push('focus'); },
    };
}

test('Step 20 UX: only the current modal is exposed to keyboard and assistive technology', async () => {
    const manager = new ScreenManager();
    const menu = screen('menu');
    const pause = screen('pause', 'modal');
    const settings = screen('settings', 'modal');
    manager.register(menu).register(pause).register(settings);

    await manager.show('menu');
    assert.equal(menu.element.inert, false);
    await manager.show('pause');
    assert.equal(menu.element.inert, true);
    assert.equal(menu.element.getAttribute('aria-hidden'), 'true');
    assert.equal(pause.element.inert, false);

    await manager.show('settings');
    assert.equal(pause.element.inert, true);
    assert.equal(settings.element.inert, false);
    assert.equal(pause.element.dataset.uiLayer, 'shell-screen');
    assert.equal(settings.element.dataset.uiLayer, 'shell-modal');
    await manager.closeTopModal();

    assert.equal(settings.active, false);
    assert.equal(pause.element.inert, false);
    assert.equal(pause.element.getAttribute('aria-hidden'), 'false');
    assert.equal(pause.element.dataset.uiLayer, 'shell-modal');
    assert.deepEqual(manager.modalStack, ['pause']);

    await manager.closeTopModal();
    assert.equal(menu.element.inert, false);
    assert.equal(menu.element.getAttribute('aria-hidden'), 'false');
});

test('Step 20 UX: covered dialog is revealed, not duplicated in modal stack', async () => {
    const manager = new ScreenManager();
    const menu = screen('menu');
    const pause = screen('pause', 'modal');
    const settings = screen('settings', 'modal');
    manager.register(menu).register(pause).register(settings);
    await manager.show('menu');
    await manager.show('pause');
    await manager.show('settings');
    await manager.show('pause');
    assert.deepEqual(manager.modalStack, ['pause']);
    assert.equal(settings.active, false);
    assert.equal(pause.calls.filter(call => call === 'open').length, 1);
    assert.equal(pause.calls.filter(call => call === 'refresh').length, 1);
});

test('Step 20 UX: closing a covered modal cannot strand a descendant', async () => {
    const manager = new ScreenManager();
    manager.register(screen('menu')).register(screen('pause', 'modal')).register(screen('settings', 'modal'));
    await manager.show('menu');
    await manager.show('pause');
    await manager.show('settings');
    await manager.close('pause');
    assert.deepEqual(manager.modalStack, []);
    assert.equal(manager.get('settings').active, false);
    assert.equal(manager.get('menu').element.inert, false);
});

test('Step 20 UX: Tab and Shift+Tab wrap inside visible modal actions', () => {
    const previousDocument = globalThis.document;
    const element = fakeElement();
    const first = { owner: element, getAttribute: () => null, closest: () => null,
        getClientRects: () => [{}], hasAttribute: () => false,
        focus() { globalThis.document.activeElement = this; } };
    const last = { ...first, focus() { globalThis.document.activeElement = this; } };
    element.querySelectorAll = () => [first, last];
    const modal = Object.create(BaseScreen.prototype);
    Object.assign(modal, { element, layer: 'modal', active: true });
    globalThis.document = { activeElement: last };
    try {
        let prevented = 0;
        const event = (shiftKey = false) => ({
            key: 'Tab', shiftKey, defaultPrevented: false,
            preventDefault() { prevented++; },
        });
        modal.onModalKeyDown(event());
        assert.equal(globalThis.document.activeElement, first);
        modal.onModalKeyDown(event(true));
        assert.equal(globalThis.document.activeElement, last);
        assert.equal(prevented, 2);
    } finally {
        globalThis.document = previousDocument;
    }
});

const blade = readFileSync(new URL('../../resources/views/demian.blade.php', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../resources/js/app.js', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../resources/js/game/shell/GameShell.js', import.meta.url), 'utf8');
const loading = readFileSync(new URL('../../resources/js/game/shell/screens/LoadingScreen.js', import.meta.url), 'utf8');
const catalog = readFileSync(new URL('../../resources/js/game/shell/screens/GameSelectionScreen.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../resources/css/phase4-step20-ux.css', import.meta.url), 'utf8');

test('Step 20 UX: dynamic navigation announcements and progress use dedicated live regions', () => {
    assert.match(blade, /data-shell-announcer[^>]+aria-live="polite"/);
    assert.doesNotMatch(blade, /data-game-shell[^>]*aria-live/);
    assert.match(shell, /this\.eventBus\.on\('screen:changed'/);
    assert.match(blade, /data-loading-progress-bar[^>]*role="progressbar"/);
    assert.match(loading, /setAttribute\('aria-valuenow'/);
});

test('Step 20 UX: game counts and menu affordances reflect the real catalog', () => {
    assert.match(blade, /data-game-library-count/);
    // The homepage summary was intentionally removed; retain only the live game count.
    assert.doesNotMatch(blade, /data-game-library-summary/);
    assert.doesNotMatch(catalog, /data-game-library-summary/);
    assert.match(catalog, /count\.textContent = `\$\{playableCount/);
    assert.match(catalog, /this\.catalog\.filter\(game => game\.available\)/);
    assert.match(catalog, /aria-label="\$\{escape\(label\)\}/);
});

test('Step 20 UX: shell overrides load last and preserve motion, contrast and touch targets', () => {
    assert.ok(app.indexOf("import '../css/phase4-step20-ux.css'") >
        app.indexOf("import '../css/mobile-19-controls.css'"));
    assert.match(css, /min-height: 44px/);
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /prefers-contrast: more/);
    assert.match(css, /forced-colors: active/);
    assert.match(css, /safe-area-inset-bottom/);
    assert.match(css, /max-block-size: calc\(var\(--demian-logical-height/);
    assert.doesNotMatch(css, /z-index:\s*[0-9]/);
});
