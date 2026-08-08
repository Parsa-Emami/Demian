import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../../../resources/js/game/games/open-world/OpenWorldGame.js', import.meta.url);
const managerUrl = new URL('../../../resources/js/game/managers/CharacterManager.js', import.meta.url);

test('Open World enters with only the selected character and hydrates NPCs after the ready frame', async () => {
    const source = await readFile(sourceUrl, 'utf8');
    const boot = source.indexOf('await this.characterManager.boot()');
    const readyFrame = source.indexOf("renderScene({ phase: 'ready'");
    const backgroundHydration = source.indexOf('this.characterManager.startBackgroundHydration()');

    assert.ok(boot >= 0 && readyFrame > boot && backgroundHydration > readyFrame);
    assert.match(source, /performanceProfile\.tier === 'performance' \? 1 : 2/);
    assert.doesNotMatch(source, /performanceProfile\.tier === 'low'/);
});

test('character startup has network timeouts and serial background hydration', async () => {
    const source = await readFile(managerUrl, 'utf8');
    assert.match(source, /CHARACTER_ASSET_TIMEOUT_MS/);
    assert.match(source, /for \(let index = 1; index < roster\.length; index \+= 1\)/);
    assert.doesNotMatch(source, /Promise\.allSettled\(\s*roster\.slice\(1\)/);
    assert.match(source, /artIntegrity === 'invalid'/);
});


test('selected compact NPCs are upgraded without leaking timed-out textures', async () => {
    const source = await readFile(managerUrl, 'utf8');
    assert.match(source, /ensureEntityVariant\(record, existing, variant\)/);
    assert.match(source, /entity\.replaceVisualAssets\(assets\.texture, assets\.atlas\)/);
    assert.match(source, /if \(settled\) \{\s*texture\.dispose\(\)/);
});
