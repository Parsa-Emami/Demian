import test from 'node:test';
import assert from 'node:assert/strict';
import RenderQuality from '../../resources/js/game/performance/RenderQuality.js';
import { smoothPresentationGrid } from '../../resources/js/game/services/RendererService.js';

function sample(policy, frames, dt) {
    for (let frame = 0; frame < frames; frame++) policy.observe(dt);
}

test('auto quality drops under sustained load and recovers slowly within the detected ceiling', () => {
    const policy = new RenderQuality('balanced');
    assert.equal(policy.profile.quality, 'balanced');
    sample(policy, 61, 1 / 30);
    assert.equal(policy.profile.quality, 'performance');
    sample(policy, 61, 1 / 30);
    assert.equal(policy.economical, true);
    assert.deepEqual(smoothPresentationGrid(390, 844, 3, policy.profile.maxPixelRatio, policy.profile.pixelBudget),
        { logicalWidth: 312, logicalHeight: 675 });
    sample(policy, 450, 1 / 60);
    assert.equal(policy.economical, true);
    sample(policy, 60, 1 / 60);
    assert.equal(policy.economical, false);
    sample(policy, 1200, 1 / 60);
    assert.equal(policy.profile.quality, 'balanced');
});

test('manual quality does not move with frame samples and long gaps reset the auto window', () => {
    const policy = new RenderQuality('balanced');
    policy.setPreference('high');
    sample(policy, 250, .05);
    assert.equal(policy.profile.quality, 'high');
    policy.setPreference('auto');
    sample(policy, 40, .033);
    policy.observe(12);
    sample(policy, 40, .033);
    assert.equal(policy.profile.quality, 'balanced');
});
