import test from 'node:test';
import assert from 'node:assert/strict';
import RankedGameplayChallenge from '../../../resources/js/game/leaderboard/RankedGameplayChallenge.js';

for (const gameId of ['after-hours', 'cafe-rush']) {
    test(`Ranked gameplay ${gameId} stays inside the collapsed HUD details, not over gameplay`, () => {
        const previousDocument = globalThis.document;
        const host = { children: [], append(node) { this.children.push(node); } };
        const selectors = [];
        globalThis.document = {
            createElement(tagName) {
                return {
                    tagName: tagName.toUpperCase(),
                    children: [], attributes: {}, listeners: {}, textContent: '',
                    setAttribute(name, value) { this.attributes[name] = value; },
                    addEventListener(name, callback) { this.listeners[name] = callback; },
                    append(...nodes) { this.children.push(...nodes); },
                    remove() { this.removed = true; },
                };
            },
        };
        try {
            const challenge = new RankedGameplayChallenge({
                gameId,
                context: {
                    root: { querySelector(selector) { selectors.push(selector); return host; } },
                    app: { sessionState: 'playing' }, services: {},
                },
            });
            challenge.mount();
            assert.deepEqual(selectors,
                ['[data-game-hud-host] .game-readout__details .game-readout__body']);
            assert.equal(host.children.length, 1);
            assert.equal(host.children[0].className, 'ranked-gameplay-challenge');
            assert.equal(host.children[0].tagName, 'SECTION');
            assert.equal(challenge.button.textContent, 'شروع بازی رقابتی');
            assert.equal(challenge.state, 'idle');
            assert.equal(challenge.status.attributes.role, 'status');
            challenge.stop();
            assert.equal(host.children[0].removed, true);
        } finally {
            globalThis.document = previousDocument;
        }
    });
}
