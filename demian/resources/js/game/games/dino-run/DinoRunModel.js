import { CHARACTER_JUMP_TUNING, characterGravity } from '../../characters/CharacterLocomotionModel.js';
import rules from '../../../../game/runner-rules.json' with { type: 'json' };
import { arcadeDifficulty } from '../../difficulty/ArcadeDifficulty.js';
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
    reset({ seed = this.seed, width = this.width, lesson = null } = {}) {
        this.seed = seed; this.random = seededRandom(seed); this.width = Math.min(rules.maxWidth, Math.max(rules.minWidth, Math.round(width)));
        this.status = 'ready'; this.time = 0; this.distance = 0; this.score = 0;
        this.speed = RUNNER_CONFIG.startSpeed; this.y = 0; this.vy = 0; this.duck = false;
        this.jumpBuffer = 0; this.landingTime = 0; this.spawnIn = rules.firstSpawnSeconds; this.obstacles = [];
        this.tick = 0; this.difficulty = arcadeDifficulty(0); this.endReason = null; this.hitBy = null;
        this.previous = { y: 0, distance: 0 }; this.nextId = 0; this.passed = 0;
        this.lastAppearance = null;
        this.lesson = lesson;
        this.hitObstacle = null;
        if (lesson) {
            this.status = 'running';
            this.speed = 310;
            this.spawnIn = Infinity;
            const definition = rules.obstacleCatalog.find(({ appearance }) => appearance === (lesson === 'jump' ? 'coffee-crate' : 'pendant'));
            const x = rules.playerX + 310 * .92;
            this.obstacles.push({ ...definition, id: this.nextId++, x, previousX: x, scored: false,
                type: lesson === 'jump' ? 'cactus' : 'bird', response: lesson });
        }
    }
    setWidth(width) { if (this.status === 'ready') this.width = Math.min(rules.maxWidth, Math.max(rules.minWidth, Math.round(width))); }
    playerBounds() {
        const height = this.duck && this.y === 0 ? RUNNER_CONFIG.duckHeight : RUNNER_CONFIG.bodyHeight;
        return { x: RUNNER_CONFIG.playerX - 14, y: this.y + 3, w: RUNNER_CONFIG.bodyWidth, h: height - 4 };
    }
    spawn() {
        const edge = this.width + 65;
        let x = this.nextId === 0 ? Math.min(edge, rules.playerX + this.speed * rules.firstEncounterSeconds) : edge;
        for (;;) {
            const attack = this.random() < rules.attackChance;
            let definition, attacker = null;
            if (attack) {
                attacker = rules.attackers[Math.floor(this.random() * rules.attackers.length)];
                const overhead = this.random() < rules.overheadChance;
                definition = { appearance: overhead ? 'pounce' : 'charge', w: 40, h: rules.bodyHeight, y: overhead ? 44 : 0 };
            } else {
                let index = Math.floor(this.random() * rules.obstacleCatalog.length);
                if (rules.obstacleCatalog[index].appearance === this.lastAppearance) index = (index + 1) % rules.obstacleCatalog.length;
                definition = rules.obstacleCatalog[index];
            }
            const scale = attack ? 1 : rules.obstacleScaleMinimum + this.random() * rules.obstacleScaleSpread;
            this.lastAppearance = definition.appearance;
            this.obstacles.push({ id: this.nextId++, type: attack ? 'attacker' : definition.y > 0 ? 'bird' : 'cactus',
                response: definition.y > 0 ? 'duck' : 'jump', attacker, appearance: definition.appearance,
                x, previousX: x, y: definition.y, w: Math.round(definition.w * scale), h: Math.round(definition.h * scale), scored: false });
            const p = this.difficulty.progress;
            const interval = rules.spawnMinimumSeconds - rules.spawnMinimumReduction * p
                + this.random() * (rules.spawnSpreadSeconds - rules.spawnSpreadReduction * p);
            if (x >= edge) { this.spawnIn = interval + (x - edge) / this.speed; break; }
            x += this.speed * interval;
        }
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
        this.tick += 1; this.difficulty = arcadeDifficulty(this.time);
        if (!this.lesson) this.speed = Math.min(RUNNER_CONFIG.maxSpeed, RUNNER_CONFIG.startSpeed + this.time * rules.speedRamp);
        this.distance += this.speed * dt; this.score = Math.floor(this.distance / 10);
        this.spawnIn -= dt;
        if (this.spawnIn <= 0) this.spawn();
        const player = this.playerBounds();
        for (const obstacle of this.obstacles) {
            const beforeX = obstacle.x;
            obstacle.x -= this.speed * dt;
            const hitbox = { x: obstacle.x + 3, y: obstacle.y + 2, w: obstacle.w - 6, h: obstacle.h - 4 };
            const swept = { ...hitbox, w: hitbox.w + beforeX - obstacle.x };
            if (overlaps(player, swept)) {
                this.status = 'over'; this.hitBy = obstacle.attacker ?? null;
                this.hitObstacle = { appearance: obstacle.appearance, response: obstacle.response };
                this.endReason = this.hitBy ? 'attack' : 'collision'; break;
            }
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
