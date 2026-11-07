import AfterHoursShadow from './AfterHoursShadow.js';
import {
    CIRCUITS, SHIFT_EXIT, SHIFT_LAYOUTS, SHIFT_LOCKER, SHIFT_PANELS, SHIFT_RULES, SHIFT_START,
    circuitAt, createShiftTerrain, distance,
} from './AfterHoursMap.js';

const REACH = 2.3;
const CAPTURE_RADIUS = 1.08;
const WALK_SPEED = 5.4;
const RUN_SPEED = 10.8;
const clampAxis = (value) => Math.max(-1, Math.min(1, Number(value) || 0));

export default class AfterHoursModel {
    constructor() {
        this.terrain = createShiftTerrain();
        this.reset();
    }

    reset(difficulty = 'standard', layout = 0) {
        this.difficulty = Object.hasOwn(SHIFT_RULES, difficulty) ? difficulty : 'standard';
        this.rules = SHIFT_RULES[this.difficulty];
        this.layout = Number.isInteger(layout) && layout >= 0 && layout < SHIFT_LAYOUTS.length ? layout : 0;
        this.status = 'ready';
        this.elapsed = 0;
        this.darkCircuit = 'storage';
        this.cards = SHIFT_LAYOUTS[this.layout].map((point, index) => ({
            ...point, id: `card-${index + 1}`, label: `کارت شیفت ${index + 1}`, kind: 'card', collected: false,
        }));
        this.relic = false;
        this.noise = null;
        this.stepDistance = 0;
        this.player = {
            position: { ...SHIFT_START }, forward: { x: 0, z: -1 }, grounded: true,
            speed: 0, motionState: 'idle', travelledDistance: 0,
        };
        this.terrain.reset('player', this.player.position);
        this.shadow = new AfterHoursShadow(this.terrain, this.difficulty, this.rules);
        this.events = [];
    }

    start() {
        if (this.status === 'ready') this.status = 'running';
    }

    get remaining() { return Math.max(0, this.rules.duration - this.elapsed); }
    get cardCount() { return this.cards.filter((card) => card.collected).length; }
    get exitReady() { return this.cardCount === this.cards.length && this.darkCircuit !== 'exit'; }

    targets() {
        return [...SHIFT_PANELS, SHIFT_EXIT, SHIFT_LOCKER, ...this.cards];
    }

    nearby() {
        const position = this.player.position;
        let nearest = null;
        let gap = REACH;
        for (const target of this.targets()) {
            if (target.collected || (target.kind === 'locker' && this.relic)) continue;
            const candidate = distance(position, target);
            if (candidate >= gap || !this.terrain.canSee(position, target)) continue;
            nearest = target;
            gap = candidate;
        }
        return nearest;
    }

    interact() {
        if (this.status !== 'running') return null;
        const target = this.nearby();
        if (!target) return null;
        switch (target.kind) {
            case 'panel':
                return target;
            case 'card':
                target.collected = true;
                this.events.push({ type: 'card', point: target });
                break;
            case 'locker':
                if (this.darkCircuit === 'storage') {
                    this.events.push({ type: 'locker-off' });
                } else {
                    this.relic = true;
                    this.emitNoise(target, 14, 'metal');
                    this.events.push({ type: 'relic', point: target });
                }
                break;
            case 'exit':
                if (this.exitReady) this.finish('escaped');
                else this.events.push({ type: 'exit-locked' });
                break;
        }
        return null;
    }

    switchPower(darkCircuit) {
        if (this.status !== 'running' || this.nearby()?.kind !== 'panel'
            || this.darkCircuit === darkCircuit || !CIRCUITS.some((circuit) => circuit.id === darkCircuit)) return false;
        this.darkCircuit = darkCircuit;
        this.events.push({ type: 'power', point: this.player.position });
        return true;
    }

    emitNoise(point, radius, kind) {
        this.noise = { x: point.x, z: point.z, radius: radius * this.rules.hearing, time: this.elapsed, kind };
        this.events.push({ type: kind, point });
    }

    advance(dt, input = {}) {
        if (this.status !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
        const before = this.elapsed;
        this.elapsed = Math.min(this.rules.duration, this.elapsed + dt);
        if (this.remaining <= 1e-6) {
            this.elapsed = this.rules.duration;
            this.finish('timeout');
            return;
        }
        if (before < this.rules.duration - 60 && this.remaining <= 60) this.events.push({ type: 'last-minute' });
        this.movePlayer(dt, input);
        const active = this.elapsed >= this.rules.grace;
        const previousMode = this.shadow.mode;
        this.shadow.tick(dt, {
            player: this.player.position,
            noise: this.noise && this.elapsed - this.noise.time < 0.85 ? this.noise : null,
            active,
            lit: circuitAt(this.player.position) !== this.darkCircuit,
        });
        if (this.shadow.mode !== previousMode) this.events.push({ type: this.shadow.mode, point: this.shadow.position });
        if (active && distance(this.player.position, this.shadow.position) <= CAPTURE_RADIUS
            && this.terrain.canSee(this.player.position, this.shadow.position)) this.finish('caught');
    }

    movePlayer(dt, input) {
        const x = clampAxis(input.x);
        const z = clampAxis(input.z);
        const magnitude = Math.hypot(x, z);
        const player = this.player;
        player.speed = 0;
        player.travelledDistance = 0;
        player.motionState = 'idle';
        if (magnitude < 0.02) return;

        const run = Boolean(input.run);
        const speed = (run ? RUN_SPEED : WALK_SPEED) * Math.min(magnitude, 1);
        const direction = { x: x / magnitude, z: z / magnitude };
        const before = player.position;
        player.position = this.terrain.move('player', {
            x: before.x + direction.x * speed * dt,
            z: before.z + direction.z * speed * dt,
        });
        player.forward = direction;
        player.travelledDistance = distance(before, player.position);
        player.speed = player.travelledDistance / dt;
        if (player.speed < 0.15) return;
        player.motionState = run ? 'sprint' : 'walk';
        this.stepDistance += player.travelledDistance;
        if (this.stepDistance >= (run ? 3.2 : 2.4)) {
            this.stepDistance = 0;
            if (run) this.emitNoise(player.position, 11.5, 'sprint');
            else this.events.push({ type: 'walk', point: player.position });
        }
    }

    finish(status) {
        this.status = status;
        this.events.push({ type: status, point: this.player.position });
    }

    drainEvents() { return this.events.splice(0); }

    result() {
        const won = this.status === 'escaped';
        const securedRelic = won && this.relic;
        return {
            won, securedRelic, reason: this.status, elapsed: Math.floor(this.elapsed),
            cards: this.cardCount,
            score: won ? 1000 + Math.floor(this.remaining) * 2 + (securedRelic ? 300 : 0) : this.cardCount * 100,
        };
    }

    dispose() { this.terrain.dispose(); }
}
