import { SHADOW_ROUTE, distance } from './AfterHoursMap.js';

const HEARING_DELAY = Object.freeze({ standard: 0.4, hard: 0.16 });

export default class AfterHoursShadow {
    constructor(terrain, difficulty, rules) {
        this.terrain = terrain;
        this.rules = rules;
        this.hearingDelay = HEARING_DELAY[difficulty];
        this.position = { ...SHADOW_ROUTE[0] };
        this.previous = this.position;
        this.forward = { x: 0, z: 1 };
        this.mode = 'patrol';
        this.patrolIndex = 1;
        this.target = SHADOW_ROUTE[this.patrolIndex];
        this.lastHeard = null;
        this.sightTime = 0;
        this.lostTime = 0;
        this.wait = 0;
        this.searchTime = 0;
        this.pathTime = 0;
        this.path = [];
        terrain.reset('shadow', this.position);
    }

    changeMode(mode, target, wait = 0) {
        this.mode = mode;
        this.target = target;
        this.wait = wait;
        this.searchTime = 0;
        this.pathTime = 0;
        this.lostTime = 0;
    }

    sees(player, lit, gap) {
        const range = lit ? this.rules.litSight : this.rules.darkSight;
        if (gap > range) return false;
        const dx = player.x - this.position.x;
        const dz = player.z - this.position.z;
        const facing = dx * this.forward.x + dz * this.forward.z;
        return (gap < 3 || this.mode === 'chase' || facing >= gap * 0.12)
            && this.terrain.canSee(this.position, player);
    }

    tick(dt, { player, noise, lit, active }) {
        this.previous = this.position;
        const gap = distance(this.position, player);
        const visible = active && this.sees(player, lit, gap);
        this.sightTime = visible ? this.sightTime + dt : 0;

        if (this.mode === 'chase') {
            if (visible) {
                this.target = player;
                this.lostTime = 0;
            } else {
                this.lostTime += dt;
                if (this.lostTime >= this.rules.memory) this.changeMode('investigate', this.target);
            }
        } else if (visible && this.sightTime >= this.rules.reaction) {
            this.changeMode('chase', player);
        } else if (active && noise && noise !== this.lastHeard) {
            this.lastHeard = noise;
            const clearance = this.terrain.soundClear(this.position, noise) ? 1 : 0.48;
            if (distance(this.position, noise) <= noise.radius * clearance) {
                const target = { x: noise.x, z: noise.z };
                if (this.mode === 'investigate') {
                    this.target = target;
                    this.searchTime = 0;
                } else {
                    this.changeMode('investigate', target, this.hearingDelay);
                }
            }
        }

        if (this.wait > 0) {
            this.wait = Math.max(0, this.wait - dt);
            return;
        }
        const reached = distance(this.position, this.target) < 0.58;
        if (this.mode === 'patrol' && reached) {
            this.patrolIndex = (this.patrolIndex + 1) % SHADOW_ROUTE.length;
            this.changeMode('patrol', SHADOW_ROUTE[this.patrolIndex]);
            this.wait = 0.32;
            return;
        }
        if (this.mode === 'investigate') {
            this.searchTime += dt;
            if (this.searchTime >= (reached ? 2.2 : 11)) {
                this.changeMode('patrol', SHADOW_ROUTE[this.patrolIndex]);
            }
        }
        this.move(dt);
    }

    move(dt) {
        this.pathTime -= dt;
        if (this.pathTime <= 0) {
            this.pathTime = 0.28;
            const grid = this.terrain.grid;
            const cell = grid.worldToCell(this.target);
            const goal = grid.isWalkable(cell.x, cell.z)
                ? this.target : grid.cellToWorld(grid.nearestWalkable(cell) ?? cell);
            this.path = grid.findPath(this.position, goal).filter((point) => distance(this.position, point) > 0.12);
        }
        const waypoint = this.path[0];
        if (!waypoint) return;
        const length = distance(this.position, waypoint);
        const speed = this.mode === 'chase' ? this.rules.chaseSpeed
            : this.mode === 'investigate' ? this.rules.searchSpeed : this.rules.patrolSpeed;
        const step = Math.min(length, speed * dt);
        if (step > 0) {
            this.forward = {
                x: (waypoint.x - this.position.x) / length,
                z: (waypoint.z - this.position.z) / length,
            };
            this.position = this.terrain.move('shadow', {
                x: this.position.x + this.forward.x * step,
                z: this.position.z + this.forward.z * step,
            });
        }
        if (distance(this.position, waypoint) < 0.14) this.path.shift();
    }
}
