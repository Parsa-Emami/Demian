import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import CharacterSpeechBubble from '../../resources/js/game/characters/CharacterSpeechBubble.js';

const messages = ['غم انگیزه', 'نیاز به بررسی بیشتر داره', 'مجتبی دهنتو', 'میزنم همرو آچه میکنم'];

test('every Hossein quality variant ships the exact four user-requested dialogue lines', () => {
    const profile = JSON.parse(readFileSync(new URL('../../public/assets/characters/hossein/hossein-character.json', import.meta.url)));
    assert.deepEqual(profile.speech, { duration: 3.2, messages });
    for (const variant of ['desktop', 'mobile', 'compact', 'runtime', 'lite', 'detail']) {
        const atlas = JSON.parse(readFileSync(new URL(`../../public/assets/characters/hossein/hossein-atlas-v14-${variant}.json`, import.meta.url)));
        assert.deepEqual(atlas.speech, profile.speech);
    }
});

test('Hossein talk can select each phrase and avoids an immediate repeat', (t) => {
    let choice = 0;
    t.mock.method(Math, 'random', () => choice);
    const spoken = [];
    const speech = { messages, lastIndex: -1, show: line => spoken.push(line) };
    for (let index = 0; index < messages.length; index++) {
        choice = (index + .1) / messages.length;
        CharacterSpeechBubble.prototype.showRandom.call(speech);
    }
    assert.deepEqual(spoken, messages);
    CharacterSpeechBubble.prototype.showRandom.call(speech);
    assert.notEqual(spoken.at(-1), spoken.at(-2));
    assert.ok(messages.includes(spoken.at(-1)));
});

test('Hossein phrases fit the Persian speech texture without losing words', () => {
    const context = { measureText: text => ({ width: [...text].length * 34 }) };
    for (const phrase of messages) {
        const lines = CharacterSpeechBubble.prototype.wrapText.call({}, context, phrase, 850, 58);
        assert.equal(lines.join(' '), phrase);
        assert.ok(lines.length <= 3);
        assert.ok(lines.every(line => context.measureText(line).width <= 850));
    }
});
