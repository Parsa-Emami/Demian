import test from 'node:test';
import assert from 'node:assert/strict';
import { arcadeMode } from '../../../resources/js/game/games/arcade/ArcadeModes.js';

const IDS = ['neon-run', 'star-catcher', 'cafe-drift', 'shadow-maze', 'sky-hop', 'rhythm-rush'];

function gameHarness() {
    let randomIndex = 0;
    const randomValues = [.13, .72, .31, .91, .46, .58, .24, .81];
    return {
        player: {
            position: { x: 0, z: 0 },
            velocity: { x: 0, z: 0 },
            forward: { x: 1, z: 0 },
            speed: 0,
            airborne: false,
            grounded: true,
            jumpVelocity: 0,
            motionState: null,
        },
        modeState: {},
        session: { elapsed: 0, score: 0, combo: 1, lives: 3, status: '', damageCooldown: 0 },
        context: { renderer: { logicalWidth: 320, logicalHeight: 180 } },
        completed: false,
        random() {
            const value = randomValues[randomIndex % randomValues.length];
            randomIndex += 1;
            return value;
        },
        randomRange(min, max) { return min + (max - min) * this.random(); },
        addScore(value) { this.session.score += Math.max(0, Number(value) || 0); },
        bumpCombo(amount = 1) { this.session.combo = Math.min(12, this.session.combo + amount); },
        resetCombo() { this.session.combo = 1; },
        damage(message) { this.session.lives = Math.max(0, this.session.lives - 1); this.session.status = message; return true; },
        finish(won, subtitle) { this.completed = true; this.finishResult = { won, subtitle }; },
    };
}

const context2d = {
    fillRect() {}, strokeRect() {}, fillText() {},
    set fillStyle(_value) {}, set strokeStyle(_value) {}, set lineWidth(_value) {},
    set font(_value) {}, set textAlign(_value) {},
};

const camera = {
    worldToScreen({ x = 0, z = 0 }) { return { x: 160 + x * 8, y: 90 + z * 8 }; },
};

for (const id of IDS) {
    test(`${id} mode survives deterministic update/render smoke simulation`, () => {
        const mode = arcadeMode(id);
        const game = gameHarness();
        mode.reset(game);

        for (let frame = 0; frame < 240 && !game.completed; frame += 1) {
            const dt = 1 / 60;
            game.session.elapsed += dt;
            mode.fixedUpdate(game, dt, {
                x: Math.sin(frame / 17),
                z: Math.cos(frame / 23),
                run: frame % 45 < 10,
                jump: frame % 37 === 0,
                dash: frame % 53 === 0,
                interact: frame % 41 === 0,
            });
            mode.draw(game, context2d, camera);
        }

        assert.ok(Number.isFinite(game.player.position.x));
        assert.ok(Number.isFinite(game.player.position.z));
        assert.ok(Number.isFinite(game.session.score));
        assert.ok(game.session.combo >= 1);
        assert.equal(typeof game.session.status, 'string');
    });
}
