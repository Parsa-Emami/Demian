/** MIT — deterministic, renderer-independent endless runner. All units are logical pixels. */
export const RUNNER_CONFIG = Object.freeze({ playerX: 86, bodyWidth: 28, bodyHeight: 58,
    duckHeight: 25, gravity: 1750, jumpSpeed: 650, startSpeed: 245, maxSpeed: 480 });
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
        this.seed = seed; this.random = seededRandom(seed); this.width = Math.max(420, width);
        this.status = 'ready'; this.time = 0; this.distance = 0; this.score = 0;
        this.speed = RUNNER_CONFIG.startSpeed; this.y = 0; this.vy = 0; this.duck = false;
        this.jumpBuffer = 0; this.landingTime = 0; this.spawnIn = 1.6; this.obstacles = [];
        this.previous = { y: 0, distance: 0 }; this.nextId = 0; this.passed = 0;
    }
    setWidth(width) { this.width = Math.max(420, width); }
    playerBounds() {
        const height = this.duck && this.y === 0 ? RUNNER_CONFIG.duckHeight : RUNNER_CONFIG.bodyHeight;
        return { x: RUNNER_CONFIG.playerX - 14, y: this.y + 3, w: RUNNER_CONFIG.bodyWidth, h: height - 4 };
    }
    spawn() {
        const bird = this.time > 12 && this.random() < .3;
        const tall = !bird && this.random() > .58;
        const h = bird ? 22 : tall ? 52 : 36;
        this.obstacles.push({ id: this.nextId++, type: bird ? 'bird' : 'cactus',
            x: this.width + 65, previousX: this.width + 65,
            y: bird ? 34 : 0, w: bird ? 40 : tall ? 26 : 21, h, scored: false });
        // At top speed the player still has over one complete jump cycle between obstacles.
        this.spawnIn = 1.05 + this.random() * .72;
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
        if (input.jump) this.jumpBuffer = .13;
        else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
        this.duck = Boolean(input.duck) && this.y === 0;
        this.landingTime = Math.max(0, this.landingTime - dt);
        if (this.jumpBuffer > 0 && this.y === 0 && !this.duck) {
            this.vy = RUNNER_CONFIG.jumpSpeed; this.jumpBuffer = 0; this.landingTime = 0;
        }
        if (this.y > 0 || this.vy > 0) {
            const extraGravity = this.vy > 0 && !input.jumpHeld ? 1350 : 0;
            this.vy -= (RUNNER_CONFIG.gravity + extraGravity) * dt;
            this.y += this.vy * dt;
            if (this.y <= 0) { this.y = 0; this.vy = 0; this.landingTime = .16; }
        }
        this.time += dt;
        this.speed = Math.min(RUNNER_CONFIG.maxSpeed, RUNNER_CONFIG.startSpeed + this.time * 3);
        this.distance += this.speed * dt; this.score = Math.floor(this.distance / 10);
        this.spawnIn -= dt;
        if (this.spawnIn <= 0) this.spawn();
        const player = this.playerBounds();
        for (const obstacle of this.obstacles) {
            const beforeX = obstacle.x;
            obstacle.x -= this.speed * dt;
            const hitbox = { x: obstacle.x + 3, y: obstacle.y + 2, w: obstacle.w - 6, h: obstacle.h - 4 };
            // Swept horizontal bounds prevent tunnelling during slow display frames.
            const swept = { ...hitbox, w: hitbox.w + beforeX - obstacle.x };
            if (overlaps(player, swept)) { this.status = 'over'; break; }
            if (!obstacle.scored && obstacle.x + obstacle.w < player.x) {
                obstacle.scored = true; this.passed += 1;
            }
        }
        this.obstacles = this.obstacles.filter((o) => o.x + o.w > -50);
    }
    snapshot(alpha = 1) {
        const t = Math.min(1, Math.max(0, alpha));
        return { y: this.previous.y + (this.y - this.previous.y) * t,
            distance: this.previous.distance + (this.distance - this.previous.distance) * t,
            obstacles: this.obstacles.map((o) => ({ ...o, x: o.previousX + (o.x - o.previousX) * t })) };
    }
}
