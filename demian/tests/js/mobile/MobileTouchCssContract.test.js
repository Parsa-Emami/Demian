import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const mobileCss = readFileSync(new URL('../../../resources/css/mobile-05-touch.css', import.meta.url), 'utf8');
const appJs = readFileSync(new URL('../../../resources/js/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../../resources/views/demian.blade.php', import.meta.url), 'utf8');

test('mobile-05 CSS is loaded after existing mobile CSS and viewport allows accessibility zoom', () => {
    assert.ok(appJs.indexOf("mobile-05-touch.css") > appJs.indexOf("touch-controls.css"));
    assert.match(html, /viewport-fit=cover/);
    assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1/i);
});

test('safe-area edges remap physically for 90 degree CSS landscape', () => {
    const rule = mobileCss.match(/html\.demian-forced-landscape \.manager-shell \{([\s\S]*?)\}/)?.[1] ?? '';
    assert.match(rule, /--mobile05-safe-left:\s*max\(14px, env\(safe-area-inset-top/);
    assert.match(rule, /--mobile05-safe-right:\s*max\(14px, env\(safe-area-inset-bottom/);
    assert.match(rule, /--mobile05-safe-bottom:\s*max\(16px, env\(safe-area-inset-left/);
    assert.match(rule, /--mobile05-safe-top:\s*max\(12px, env\(safe-area-inset-right/);
});

test('RTL CSS landscape uses a physical top-left anchor without conflicting logical inline offsets', () => {
    const selector = 'html.demian-forced-landscape .manager-shell[data-manager-shell] {';
    const rule = mobileCss.split(selector)[1]?.split('}')[0] ?? '';
    for (const declaration of [
        'top: 0 !important;', 'left: 0 !important;',
        'bottom: auto !important;', 'right: auto !important;',
    ]) assert.ok(rule.includes(declaration), declaration);
    assert.doesNotMatch(rule, /inset-inline-end|inset-block-end/);
});

test('touch-action overrides are constrained to control surfaces; no global scroll lock', () => {
    assert.match(mobileCss, /\[data-control-surface\]/);
    assert.match(mobileCss, /\.manager-shell \.manager-stage\s*\{\s*touch-action:\s*auto/);
    assert.match(mobileCss, /\.manager-shell \.demian-scene\s*,/);
    assert.match(mobileCss, /touch-action:\s*none/);
    assert.doesNotMatch(mobileCss, /\b(?:html|body)\s*\{[^}]*touch-action:\s*none/);
});
