import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    characterRuntimeVariants,
} from '../../resources/js/game/characters/runtime/CharacterRuntimePolicy.js';
import CharacterVisualService from '../../resources/js/game/characters/runtime/CharacterVisualService.js';

test('Mobile speed: coarse-pointer high-end phones start on lite, desktop high-end retains detail', () => {
    assert.deepEqual(characterRuntimeVariants({ tier: 'high' }, { coarsePointer: true }),
        { active: 'lite', npc: 'lite' });
    assert.deepEqual(characterRuntimeVariants({ tier: 'balanced' }, { coarsePointer: true }),
        { active: 'lite', npc: 'lite' });
    assert.deepEqual(characterRuntimeVariants({ tier: 'high' }, { coarsePointer: false }),
        { active: 'detail', npc: 'lite' });
    assert.deepEqual(characterRuntimeVariants({ tier: 'balanced' }, { coarsePointer: false }),
        { active: 'runtime', npc: 'lite' });
    assert.deepEqual(characterRuntimeVariants({ tier: 'performance' }, { coarsePointer: false }),
        { active: 'lite', npc: 'lite' });
});

test('Mobile speed: optional avatar requests are flagged as cancellable background fetches', async () => {
    const service = new CharacterVisualService({ storage: null });
    const seen = [];
    service.loadPack = async (slug, variant, options) => {
        seen.push({ slug, variant, options });
        return {
            slug, variant, atlas: { animations: { idle: { frames: ['idle'], fps: 1, loop: true } },
                frames: { idle: { x: 0, y: 0, w: 16, h: 16 } } },
            image: { naturalWidth: 32, naturalHeight: 32 },
        };
    };
    try {
        const avatar = await service.createCanvasAvatar('setayesh',
            { variant: 'lite', background: true });
        assert.equal(avatar.slug, 'setayesh');
        assert.deepEqual(seen, [{ slug: 'setayesh', variant: 'lite',
            options: { background: true } }]);
    } finally { service.dispose(); }
});

test('Mobile speed: Dino Run only awaits the player, then renders safe visual hazards until attackers hydrate', () => {
    const code = readFileSync(new URL('../../resources/js/game/games/dino-run/DinoRunGame.js', import.meta.url), 'utf8');
    const preload = code.slice(code.indexOf('    async preload(context) {'),
        code.indexOf('    hydrateAttackers(context) {'));
    assert.match(preload, /await .*createCanvasAvatar\('player'/);
    assert.doesNotMatch(preload, /RUNNER_CONFIG\.attackers|Promise\.all/);
    assert.match(code, /this\.hydrateAttackers\(context\)/);
    assert.match(code, /background: true/);
    assert.match(code, /if \(this\.context !== context \|\| this\.disposed\) return/);
    assert.match(code, /if \(!sprite\) \{/);
    assert.match(code, /this\.disposed = true/);
});

test('Mobile speed: Café Rush keeps scoring player sprite critical and loads staff asynchronously', () => {
    const code = readFileSync(new URL('../../resources/js/game/games/cafe-rush/CafeRushGame.js', import.meta.url), 'utf8');
    const preload = code.slice(code.indexOf('    async preload(context) {'),
        code.indexOf('    async enter(context) {'));
    assert.match(preload, /await .*createCanvasAvatar\(/);
    assert.doesNotMatch(preload, /Promise\.all/);
    assert.match(preload, /setayesh: null, uzudi: null/);
    assert.match(code, /hydrateStaff\(context\)/);
    assert.match(code, /background: true/);
    assert.match(code, /this\.avatars\.setayesh\?\.sync/);
    assert.match(code, /this\.disposed = true/);
    const renderer = readFileSync(new URL('../../resources/js/game/games/cafe-rush/CafeRushRenderer.js', import.meta.url), 'utf8');
    assert.match(renderer, /cast\.filter\(Boolean\)/);
    assert.match(renderer, /RUSH_GUESTS\[slug\]/);
});

test('Mobile speed: returning to menu cancels optional downloads without resetting the ranked result', () => {
    const code = readFileSync(new URL('../../resources/js/game/application/GameApplication.js', import.meta.url), 'utf8');
    const menu = code.slice(code.indexOf('    async enterMenuState('), code.indexOf('    launchGame('));
    assert.match(menu, /characterVisuals\.cancelBackgroundLoads\(\)/);
    assert.match(menu, /await this\.shell\.showCafeMenu\(\)/);
    assert.doesNotMatch(menu, /leaderboards\.start|leaderboards\.finish|replay/);
});

test('Mobile speed: non-visible character rail cards do not preload 12 preview PNGs', () => {
    const source = readFileSync(new URL('../../resources/js/ui/CharacterManagerUI.js', import.meta.url), 'utf8');
    assert.match(source, /new IntersectionObserver/);
    assert.match(source, /root: this.listElement/);
    assert.match(source, /entry\.isIntersecting/);
    assert.match(source, /this\.previewObserver\.observe\(previewCanvas\)/);
    assert.match(source, /this\.previewObserver\?\.disconnect\(\)/);
    assert.match(source, /this\.previewRows = new WeakMap\(\)/);
    assert.match(source, /if \(this\.previewObserver\)/);
});
