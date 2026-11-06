/** MIT — deterministic, renderer-independent endless runner. All units are logical pixels. */
import { CHARACTER_JUMP_TUNING, characterGravity } from '../../characters/CharacterLocomotionModel.js';
import rules from '../../../../game/runner-rules.json' with { type: 'json' };
export function runnerDifficulty(seconds = 0) {
    const progress = 1 - Math.exp(-Math.max(0, Number(seconds) || 0) / rules.difficultyRampSeconds);
    return { level: rules.difficultyStart + (rules.difficultyMax - rules.difficultyStart) * progress, progress };
}
export const RUNNER_CONFIG = Object.freeze(rules);
export function seededRandom(seed = 1) {
    let value = Number(seed) >>> 0;
    return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
export function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export default class DinoRunModel {
    constructor({ seed = Date.now(), width = 960 } = {}) { this.reset({ seed, width }); }
    reset({ seed = this.seed, width = this.width } = {}) {
        this.seed = seed; this.random = seededRandom(seed); this.width = Math.min(rules.maxWidth, Math.max(rules.minWidth, Math.round(width)));
        this.status = 'ready'; this.time = 0; this.distance = 0; this.score = 0;
        this.speed = RUNNER_CONFIG.startSpeed; this.y = 0; this.vy = 0; this.duck = false;
        this.jumpBuffer = 0; this.landingTime = 0; this.spawnIn = rules.firstSpawnSeconds; this.obstacles = [];
        this.tick = 0; this.difficulty = runnerDifficulty(0); this.endReason = null;
        this.previous = { y: 0, distance: 0 }; this.nextId = 0; this.passed = 0;
    }
    setWidth(width) { if (this.status === 'ready') this.width = Math.min(rules.maxWidth, Math.max(rules.minWidth, Math.round(width))); }
    playerBounds() {
        const height = this.duck && this.y === 0 ? RUNNER_CONFIG.duckHeight : RUNNER_CONFIG.bodyHeight;
        return { x: RUNNER_CONFIG.playerX - 14, y: this.y + 3, w: RUNNER_CONFIG.bodyWidth, h: height - 4 };
    }
    spawn() {
        const id = this.nextId++;
        const attack = id % rules.attackEvery === rules.attackEvery - 1;
        const definition = attack ? rules.attacks[Math.floor(id / rules.attackEvery) % rules.attacks.length]
            : rules.hazards[Math.min(rules.hazards.length - 1, Math.floor(this.random() * rules.hazards.length))];
        const x = attack ? this.width - rules.attackOriginInset : this.width + 65;
        const warningLeft = attack ? rules.attackWarningSeconds : 0;
        this.obstacles.push({ ...definition, id, x, previousX: x, originX: x, warningLeft, age: 0, scored: false });
        const p = this.difficulty.progress;
        this.spawnIn = warningLeft + rules.spawnMinimumSeconds - rules.spawnMinimumReduction * p
            + this.random() * (rules.spawnSpreadSeconds - rules.spawnSpreadReduction * p);
    }

    step(dt, input = {}) {
        if (this.status === 'over') return;
        dt = Math.min(.05, Math.max(0, dt));
        this.previous = { y: this.y, distance: this.distance };
        this.obstacles.forEach((o) => { o.previousX = o.x; });
        if (this.status === 'ready') {
            if (!input.jump) return;
            this.status = 'running';
        }
        if (input.jump) this.jumpBuffer = CHARACTER_JUMP_TUNING.bufferSeconds;
        else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
        this.duck = Boolean(input.duck || input.slide) && this.y === 0;
        this.landingTime = Math.max(0, this.landingTime - dt);
        if (this.jumpBuffer > 0 && this.y === 0 && !this.duck) {
            this.vy = RUNNER_CONFIG.jumpSpeed; this.jumpBuffer = 0; this.landingTime = 0;
        }
        if (this.y > 0 || this.vy > 0) {
            this.vy -= characterGravity(this.vy, RUNNER_CONFIG.jumpSpeed, RUNNER_CONFIG.gravity, Boolean(input.jumpHeld)) * dt;
            this.y += this.vy * dt;
            if (this.y <= 0) {
                this.y = 0; this.vy = 0; this.landingTime = .16;
                this.duck = Boolean(input.duck || input.slide);
                if (this.jumpBuffer > 0 && !this.duck) {
                    this.vy = RUNNER_CONFIG.jumpSpeed; this.jumpBuffer = 0; this.landingTime = 0;
                }
            }
        }
        this.time += dt;
        this.tick += 1; this.difficulty = runnerDifficulty(this.time);
        this.speed = Math.min(RUNNER_CONFIG.maxSpeed, RUNNER_CONFIG.startSpeed + this.time * rules.speedRamp);
        this.distance += this.speed * dt; this.score = Math.floor(this.distance / 10);
        this.spawnIn -= dt;
        if (this.spawnIn <= 0) this.spawn();
        const player = this.playerBounds();
        for (const obstacle of this.obstacles) {
            obstacle.age = (obstacle.age ?? 0) + dt;
            if ((obstacle.warningLeft ?? 0) > 0) {
                obstacle.warningLeft = Math.max(0, obstacle.warningLeft - dt);
                continue;
            }
            const beforeX = obstacle.x;
            obstacle.x -= this.speed * dt;
            const hitbox = { x: obstacle.x + 3, y: obstacle.y + 2, w: obstacle.w - 6, h: obstacle.h - 4 };
            // Swept horizontal bounds prevent tunnelling during slow display frames.
            const swept = { ...hitbox, w: hitbox.w + beforeX - obstacle.x };
            if (overlaps(player, swept)) { this.status = 'over'; this.endReason = 'collision'; break; }
            if (!obstacle.scored && obstacle.x + obstacle.w < player.x) {
                obstacle.scored = true; this.passed += 1;
            }
        }
        this.obstacles = this.obstacles.filter((o) => o.x + o.w > -50);
        if (this.tick >= rules.maxTicks && this.status === 'running') { this.status = 'over'; this.endReason = 'time-limit'; }
    }
    snapshot(alpha = 1) {
        const t = Math.min(1, Math.max(0, alpha));
        return { y: this.previous.y + (this.y - this.previous.y) * t,
            distance: this.previous.distance + (this.distance - this.previous.distance) * t,
            obstacles: this.obstacles.map((o) => ({ ...o, x: o.previousX + (o.x - o.previousX) * t })) };
    }
}
