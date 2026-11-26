import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import CharacterAbilityController from '../../resources/js/game/characters/abilities/CharacterAbilityController.js';
import CharacterAbilityHud from '../../resources/js/game/characters/abilities/CharacterAbilityHud.js';
import { INPUT_CONTEXTS } from '../../resources/js/game/input/InputContexts.js';

const ability = { id: 'smile-bloom', label: 'شکوفهٔ لبخند', animation: 'smile_bloom', duration: 1.6, cooldown: 6 };
const atlas = { animations: { smile_bloom: { frames: ['a', 'b'] } }, abilities: [ability] };

test('an ability cannot interrupt a jump or a locked action and cannot stack', () => {
    const controller = new CharacterAbilityController(atlas);
    assert.equal(controller.activate({ grounded: false }), null);
    assert.equal(controller.activate({ locked: true }), null);
    assert.equal(controller.remaining(), 0);
    assert.equal(controller.activate().id, ability.id);
    assert.equal(controller.activate(), null);
    controller.update(.8);
    assert.equal(controller.visualState().progress, .5);
    controller.update(.8);
    assert.equal(controller.visualState(), null);
    assert.equal(controller.activate(), null);
    controller.update(4.4);
    assert.equal(controller.remaining(), 0);
    assert.equal(controller.activate().id, ability.id);
});

test('invalid time cannot expire a cooldown and cancelling an effect keeps its cooldown', () => {
    const controller = new CharacterAbilityController(atlas);
    controller.activate();
    for (const dt of [-1, NaN, Infinity]) controller.update(dt);
    assert.equal(controller.remaining(), 6);
    controller.cancel();
    assert.equal(controller.visualState(), null);
    assert.equal(controller.activate(), null);
    controller.update(6);
    assert.ok(controller.activate());
});

test('characters without an authored animation never gain an ability', () => {
    for (const pack of [{}, { abilities: [ability] },
        { ...atlas, abilities: [{ ...ability, duration: Infinity }] }]) {
        const controller = new CharacterAbilityController(pack);
        assert.equal(controller.primary, null);
        assert.equal(controller.activate(), null);
    }
    assert.deepEqual(INPUT_CONTEXTS.OPEN_WORLD.actions.ability.keys, ['q', 'ability']);
    assert.equal(INPUT_CONTEXTS.DINO_RUN.actions.ability, undefined);
});

test('the touch button shows cooldown, respects grounded state and hides after changing character', () => {
    const button = { hidden: true, textContent: '', setAttribute() {} };
    const hintLabel = { textContent: '' };
    const hint = { hidden: true, querySelector: () => hintLabel };
    const hud = new CharacterAbilityHud({ querySelector: (selector) => selector.includes('-hint') ? hint : button });
    const controller = new CharacterAbilityController(atlas);
    const entity = { abilityController: controller, grounded: true, stateLock: 0 };
    hud.update(entity); assert.equal(button.hidden, false); assert.equal(button.disabled, false);
    assert.equal(hintLabel.textContent, ability.label);
    controller.activate(); hud.update(entity); assert.equal(button.disabled, true); assert.match(button.textContent, /6/);
    controller.update(6); entity.grounded = false; hud.update(entity); assert.equal(button.disabled, true);
    const mobinaAtlasUrl = new URL('../../public/assets/characters/mobina/mobina-atlas-v14-lite.json', import.meta.url);
    const mobina = new CharacterAbilityController(JSON.parse(readFileSync(mobinaAtlasUrl, 'utf8')));
    assert.equal(mobina.primary?.id, 'meow-mode');
    assert.equal(mobina.primary?.cosmetic, true);
    hud.update({ abilityController: mobina, grounded: true, stateLock: 0 });
    assert.equal(hintLabel.textContent, 'حالت میو');
    assert.equal(button.textContent, 'حالت میو');
    hud.update({ abilityController: new CharacterAbilityController({}) });
    assert.equal(button.hidden, true); assert.equal(hint.hidden, true);
});
