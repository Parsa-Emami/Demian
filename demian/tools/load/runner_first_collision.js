/**
 * Step 30: deterministic minimal Dino Run replay fixture for a real server
 * issued seed. Pure JS (Node + k6), deliberately independent of the PHP code.
 *
 * For staging load ONLY. This demonstrates server-verified replay CPU/DB work,
 * not real human play; never submit it to production or award coupons.
 * Never fabricate a score. The backend calculates score from this transition
 * trace and accepts it only after the simulated duration has elapsed.
 */
export function firstCollisionReplay(r, seed, width) {
    if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffffffff
        || !Number.isInteger(width) || width < r.minWidth || width > r.maxWidth) {
        throw Error('Invalid server-issued seed/width for staging runner replay');
    }
    let rng = seed >>> 0;
    const random = () => {
        rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
        return rng / 4294967296;
    };
    const dt = 1 / r.tickRate;
    let y = 0, vy = 0, time = 0, distance = 0, buffer = 0;
    let spawnIn = r.firstSpawnSeconds, obstacles = [];
    let nextId = 0, lastAppearance = null;
    const transitions = [{tick: 0, mask: 3}, {tick: 1, mask: 2}];
    for (let tick = 0; tick < Math.min(r.maxTicks, 2000); tick++) {
        const jump = tick === 0, held = true, duckInput = false;
        buffer = jump ? r.jumpBufferSeconds : Math.max(0, buffer - dt);
        let duck = duckInput && y === 0;
        if (buffer > 0 && y === 0 && !duck) {
            vy = r.jumpSpeed;
            buffer = 0;
        }
        if (y > 0 || vy > 0) {
            const ratio = vy / r.jumpSpeed;
            let gravity = r.gravity;
            if (ratio > 0 && !held) gravity *= r.releasedRiseGravity;
            else if (held && Math.abs(ratio) < r.apexRatio) {
                const t = Math.abs(ratio) / r.apexRatio;
                const edge = t * t * (3 - 2 * t);
                gravity *= r.heldApexGravity + (1 - r.heldApexGravity) * edge;
            }
            vy -= gravity * dt;
            y += vy * dt;
            if (y <= 0) {
                y = 0; vy = 0; duck = duckInput;
                if (buffer > 0 && !duck) { vy = r.jumpSpeed; buffer = 0; }
            }
        }
        time += dt;
        const speed = Math.min(r.maxSpeed, r.startSpeed + time * r.speedRamp);
        distance += speed * dt;
        spawnIn -= dt;
        if (spawnIn <= 0) {
            const edge = width + 65;
            let x = nextId === 0 ? Math.min(edge, r.playerX + speed * r.firstEncounterSeconds) : edge;
            while (true) {
                const attack = random() < r.attackChance;
                let definition;
                if (attack) {
                    // PHP consumes an attacker RNG sample even though its
                    // chosen slug does not affect the hitbox.
                    random();
                    const overhead = random() < r.overheadChance;
                    definition = { appearance: overhead ? 'pounce' : 'charge',
                        w: 40, h: r.bodyHeight, y: overhead ? 44 : 0 };
                } else {
                    let index = Math.floor(random() * r.obstacleCatalog.length);
                    if (r.obstacleCatalog[index].appearance === lastAppearance) {
                        index = (index + 1) % r.obstacleCatalog.length;
                    }
                    definition = r.obstacleCatalog[index];
                }
                const scale = attack ? 1 : r.obstacleScaleMinimum + random() * r.obstacleScaleSpread;
                lastAppearance = definition.appearance;
                nextId++;
                obstacles.push({
                    x, y: definition.y, w: Math.round(definition.w * scale),
                    h: Math.round(definition.h * scale),
                });
                const p = 1 - Math.exp(-time / r.difficultyRampSeconds);
                const interval = r.spawnMinimumSeconds - r.spawnMinimumReduction * p
                    + random() * (r.spawnSpreadSeconds - r.spawnSpreadReduction * p);
                if (x >= edge) {
                    spawnIn = interval + (x - edge) / speed;
                    break;
                }
                x += speed * interval;
            }
        }
        const height = duck && y === 0 ? r.duckHeight : r.bodyHeight;
        let terminal = false;
        for (const o of obstacles) {
            o.x -= speed * dt;
            const x = o.x + 3, oy = o.y + 2;
            const w = o.w - 6 + speed * dt, h = o.h - 4;
            if (r.playerX - 14 < x + w && r.playerX - 14 + r.bodyWidth > x
                && y + 3 < oy + h && y + 3 + height - 4 > oy) {
                terminal = true;
                break;
            }
        }
        obstacles = obstacles.filter(o => o.x + o.w > -50);
        if (terminal || tick + 1 >= r.maxTicks) {
            return { ticks: tick + 1, transitions, elapsedSeconds: (tick + 1) / r.tickRate };
        }
    }
    throw Error('No terminal collision in bounded staging runner fixture');
}
