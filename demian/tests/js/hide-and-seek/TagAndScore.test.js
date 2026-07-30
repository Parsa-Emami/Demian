import test from 'node:test';
import assert from 'node:assert/strict';
import TagSystem from '../../../resources/js/game/games/hide-and-seek/systems/TagSystem.js';
import ScoreSystem from '../../../resources/js/game/games/hide-and-seek/systems/ScoreSystem.js';

test('TagSystem requires range and visibility and applies cooldown', () => {
    const tags = new TagSystem({ distance: 1.5, cooldownSeconds: 1 });
    const seeker = { id: 's', position: { x: 0, z: 0 }, eliminated: false };
    const hider = { id: 'h', position: { x: 1, z: 0 }, eliminated: false };
    assert.equal(tags.tag(seeker, hider, { visible: false }), false);
    assert.equal(tags.tag(seeker, hider, { visible: true }), true);
    assert.equal(tags.tag(seeker, hider, { visible: true }), false);
    tags.update(1);
    assert.equal(tags.tag(seeker, hider, { visible: true }), true);
});

test('ScoreSystem accumulates survival, hiding, tags and wins independently', () => {
    const scoring = new ScoreSystem({ survivalPerSecond: 4, hiddenPerSecond: 2, seekerTag: 100, seekerFastTagBonusPerSecond: 1, hiderWin: 500, seekerWin: 400, escapeBonus: 50 });
    const hider = { id: 'player', role: 'hider', hidden: true, eliminated: false };
    scoring.tick(hider, 10, { seeking: true });
    scoring.awardWin('player', 'hider');
    scoring.awardEscape('player');
    assert.equal(scoring.score('player'), 610);
    assert.equal(scoring.snapshot('player').hiddenSeconds, 10);
    scoring.awardTag('seeker', 20);
    assert.equal(scoring.score('seeker'), 120);
});
