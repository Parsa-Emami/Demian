import test from 'node:test';
import assert from 'node:assert/strict';
import ScoringSystem from '../../../resources/js/game/games/tetris/domain/ScoringSystem.js';

test('Scoring awards guideline line clear values and drop points', () => {
    const scoring = new ScoringSystem();
    scoring.addDrop({ soft: 3, hard: 4 });
    const award = scoring.awardLock({ lines: 4 });

    assert.equal(award.points, 800);
    assert.equal(scoring.score, 811);
    assert.equal(scoring.lines, 4);
});

test('Scoring preserves and rewards back-to-back difficult clears', () => {
    const scoring = new ScoringSystem();
    const first = scoring.awardLock({ lines: 4 });
    const second = scoring.awardLock({ lines: 4 });

    assert.equal(first.points, 800);
    assert.equal(second.points, 1250); // 1200 B2B + 50 combo
    assert.equal(second.backToBack, true);
});

test('Scoring tracks combo and perfect-clear bonuses', () => {
    const scoring = new ScoringSystem();
    const first = scoring.awardLock({ lines: 1 });
    const second = scoring.awardLock({ lines: 1, perfectClear: true });

    assert.equal(first.combo, 0);
    assert.equal(second.combo, 1);
    assert.equal(second.points, 950); // 100 + 50 combo + 800 perfect clear
});
