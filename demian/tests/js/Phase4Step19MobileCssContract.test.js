import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../resources/css/mobile-19-controls.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../resources/js/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../resources/views/demian.blade.php', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../resources/js/ui/MobileGameUI.js', import.meta.url), 'utf8');

test('Step 19: final mobile overrides load after HUD and existing mobile layouts', () => {
    const index = app.indexOf("import '../css/mobile-19-controls.css'");
    assert.ok(index > app.indexOf("import '../css/mobile-05-touch.css'"));
    assert.ok(index > app.indexOf("import '../css/game-hud.css'"));
    assert.ok(index > app.indexOf("import '../css/weekly-13-ui.css'"));
    assert.match(css, /--mobile05-safe-left/);
    assert.match(css, /--mobile05-safe-right/);
    assert.match(css, /--demian-logical-width/);
    assert.match(css, /max-height: min\(40dvh/);
    assert.match(css, /min-height: 44px/);
});

test('Step 19: browser zoom and modal scrolling stay accessible', () => {
    assert.match(html, /viewport-fit=cover/);
    assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/i);
    assert.doesNotMatch(css, /(?:^|\})\s*(?:html|body)\s*\{[^}]*touch-action:\s*none/m);
    assert.match(css, /:focus-visible/);
    assert.match(css, /prefers-reduced-motion: reduce/);
});

test('Step 19: pointer-up, keyboard clicks and viewport scroll have balanced lifecycle listeners', () => {
    for (const token of [
        "this.actionsTray?.addEventListener('pointerup', this.onActionPress)",
        "this.actionsTray?.removeEventListener('pointerup', this.onActionPress)",
        "this.actionsTray?.addEventListener('click', this.onActionPress)",
        "this.actionsTray?.removeEventListener('click', this.onActionPress)",
        "window.addEventListener('pointercancel', this.onWindowActionEnd, true)",
        "window.removeEventListener('pointercancel', this.onWindowActionEnd, true)",
        "window.visualViewport?.addEventListener('scroll', this.onViewportChange",
        "window.visualViewport?.removeEventListener('scroll', this.onViewportChange)",
        "this.stage?.addEventListener('contextmenu', this.onStageContextMenu)",
        "this.stage?.removeEventListener('contextmenu', this.onStageContextMenu)",
    ]) assert.ok(ui.includes(token), 'missing balanced handler: ' + token);
    assert.doesNotMatch(ui, /this\.stage\?\.addEventListener\('contextmenu',\s*\(event\)/);
});
