import rules from '../../../../game/cafe-drift-rules.json' with { type: 'json' };

export const DRIFT = Object.freeze({ ...rules, lanes: Object.freeze(rules.lanes) });
const bound = DRIFT.targetMax * DRIFT.targetUnit;
const epoch = Date.parse(DRIFT.weekEpoch);
export const driftSeed = (time = Date.now()) => 4096 + Math.floor((time - epoch) / 604800000);
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function driftCourse(seed) {
    let rng = seed;
    const draw = size => {
        rng = (rng * 48271) % 2147483647;
        return rng % size;
    };
    const gates = [];
    for (let tick = DRIFT.firstGate; tick + DRIFT.contactTicks <= DRIFT.ticks;) {
        const index = gates.length;
        const lane = draw(DRIFT.lanes.length);
        const blocked = [lane];
        if (index >= 7 && index % 3 !== 1) {
            const second = DRIFT.lanes.map((_, i) => i).filter(i => Math.abs(i - lane) >= 2);
            blocked.push(second[draw(second.length)]);
        }
        const free = DRIFT.lanes.map((_, i) => i).filter(i => !blocked.includes(i));
        const bean = index % 3 === 2 ? DRIFT.lanes[free[draw(free.length)]] : null;
        const obstacles = blocked.map(i => ({ x: DRIFT.lanes[i], style: draw(3) }));
        gates.push({ tick, obstacles, bean });
        tick += Math.max(DRIFT.minimumGap, DRIFT.gateGap - Math.floor(tick / DRIFT.gapRamp)) + draw(13) - 6;
    }
    return gates;
}

export default class CafeDriftModel {
    constructor(seed) {
        this.gates = driftCourse(seed);
        this.tick = 0;
        this.x = 0;
        this.previousX = 0;
        this.velocity = 0;
        this.index = 0;
        this.clearance = Infinity;
        this.collected = false;
        this.score = 0;
        this.passed = 0;
        this.nearMisses = 0;
        this.beans = 0;
        this.cups = DRIFT.cups;
        this.combo = 0;
        this.bestCombo = 0;
        this.done = false;
    }

    step(target) {
        if (this.done) return null;
        // Canonical finite target only. Ordinary replay inputs are unchanged;
        // malformed/dead touch coordinates cannot poison position or score.
        const steering = Number.isFinite(target)
            ? clamp(Math.round(target), -DRIFT.targetMax, DRIFT.targetMax) : 0;
        const wanted = clamp(steering * DRIFT.targetUnit - this.x, -DRIFT.maxSpeed, DRIFT.maxSpeed);
        this.velocity += clamp(wanted - this.velocity, -DRIFT.accel, DRIFT.accel);
        this.previousX = this.x;
        this.x = clamp(this.x + this.velocity, -bound, bound);
        this.tick++;
        const gate = this.gates[this.index];
        let event = null;
        if (gate && Math.abs(gate.tick - this.tick) <= DRIFT.contactTicks) {
            for (const obstacle of gate.obstacles) {
                this.clearance = Math.min(this.clearance, Math.abs(this.x - obstacle.x));
            }
            this.collected ||= gate.bean !== null && Math.abs(this.x - gate.bean) <= DRIFT.beanReach;
            if (this.tick === gate.tick + DRIFT.contactTicks) event = this.resolveGate();
        }
        if (this.tick === DRIFT.ticks) this.score += this.cups * DRIFT.cupBonus;
        this.done = this.cups === 0 || this.tick === DRIFT.ticks;
        return event;
    }

    resolveGate() {
        const hit = this.clearance <= DRIFT.collision;
        const near = !hit && this.clearance <= DRIFT.near;
        const bean = !hit && this.collected;
        if (hit) {
            this.cups--;
            this.combo = 0;
        } else {
            this.passed++;
            this.score += DRIFT.passPoints;
            if (near || bean) {
                this.combo = Math.min(DRIFT.comboMax, this.combo + 1);
                this.bestCombo = Math.max(this.bestCombo, this.combo);
                if (near) this.nearMisses++;
                if (bean) this.beans++;
                this.score += ((near ? DRIFT.nearPoints : 0) + (bean ? DRIFT.beanPoints : 0)) * this.combo;
            } else {
                this.combo = 0;
            }
        }
        this.index++;
        this.clearance = Infinity;
        this.collected = false;
        return hit ? 'hit' : near ? (bean ? 'double' : 'near') : bean ? 'bean' : null;
    }
}
