import { RECIPES, RUSH_DURATION, RUSH_RULES, RUSH_SPOTS, RUSH_START, VIP_AT, rushGround } from './CafeRushMap.js';

const WALK = 6.4;
const RUN = 11.6;
const REACH = 2.2;
const SPILL_RADIUS = 1.35;
const EARLY_MENU = ['tea', 'cake', 'espresso', 'tea', 'espresso', 'cake'];
const TABLES = [1, 2, 1, 2, 1, 2, 2, 1];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const rushDistance = (left, right) => Math.hypot(left.x - right.x, left.z - right.z);

export default class CafeRushModel {
    constructor() {
        this.ground = rushGround();
        this.reset();
    }

    reset(difficulty = 'standard', variation = 0) {
        this.difficulty = Object.hasOwn(RUSH_RULES, difficulty) ? difficulty : 'standard';
        this.rules = RUSH_RULES[this.difficulty];
        this.variation = Number.isInteger(variation) ? ((variation % 3) + 3) % 3 : 0;
        this.status = 'ready';
        this.elapsed = 0;
        this.nextTicketAt = 0;
        this.ticketNumber = 0;
        this.regularNumber = 0;
        this.vipIssued = false;
        this.vipServed = false;
        this.orders = [];
        this.tray = null;
        this.puddles = [];
        this.delivered = 0;
        this.score = 0;
        this.combo = 0;
        this.bestCombo = 0;
        this.spills = 0;
        this.expired = 0;
        this.mistakes = 0;
        this.events = [];
        this.velocity = { x: 0, z: 0 };
        this.player = {
            position: { ...RUSH_START }, forward: { x: 0, z: -1 }, speed: 0, motionState: 'idle',
            grounded: true, travelledDistance: 0,
        };
        this.ground.reset('player', RUSH_START);
    }

    start() {
        if (this.status !== 'ready') return;
        this.status = 'running';
        this.schedule();
    }

    get remaining() { return Math.max(0, RUSH_DURATION - this.elapsed); }

    get carriedOrder() { return this.orders.find((order) => order.id === this.tray?.orderId) ?? null; }

    get waitingOrder() {
        return this.orders.find((order) => order.state === 'waiting' && order.vip)
            ?? this.orders.find((order) => order.state === 'waiting') ?? null;
    }
    get acceptedOrder() { return this.orders.find((order) => order.state === 'accepted') ?? null; }

    stationOrder(id) {
        return this.orders.find((order) => RECIPES[order.recipe].station === id
            && (order.state === 'preparing' || order.state === 'ready')) ?? null;
    }

    nearby() {
        const position = this.player.position;
        let nearest = null;
        let distance = REACH;
        for (const spot of RUSH_SPOTS) {
            const gap = rushDistance(position, spot);
            if (gap < distance && this.ground.canSee(position, spot)) {
                distance = gap;
                nearest = spot;
            }
        }
        return nearest;
    }

    interact() {
        if (this.status !== 'running') return;
        const spot = this.nearby();
        if (!spot) return;
        if (spot.kind === 'table') this.serve(spot);
        else if (this.tray) this.events.push({ type: 'tray-full', order: this.carriedOrder });
        else if (spot.kind === 'tickets') this.takeTicket();
        else this.useStation(spot);
    }

    takeTicket() {
        if (this.acceptedOrder) {
            this.events.push({ type: 'accepted', order: this.acceptedOrder });
            return;
        }
        const next = this.waitingOrder;
        if (!next) {
            this.events.push({ type: 'no-tickets' });
            return;
        }
        next.state = 'accepted';
        this.events.push({ type: 'accepted', order: next });
    }

    useStation(spot) {
        const work = this.stationOrder(spot.id);
        if (work?.state === 'ready') {
            work.state = 'carrying';
            this.tray = { orderId: work.id, risk: 0, lean: 0 };
            this.events.push({ type: 'pickup', order: work });
            return;
        }
        if (work) {
            this.events.push({ type: 'preparing', order: work });
            return;
        }
        const order = this.orders.find((ticket) => ticket.state === 'accepted' && RECIPES[ticket.recipe].station === spot.id);
        if (!order) {
            this.events.push({ type: 'check-ticket', order: this.acceptedOrder });
            return;
        }
        order.state = 'preparing';
        order.readyAt = this.elapsed + RECIPES[order.recipe].time;
        this.events.push({ type: 'preparing', order });
    }

    serve(spot) {
        const order = this.carriedOrder;
        if (!order) {
            this.events.push({ type: 'empty-tray' });
            return;
        }
        if (order.table !== spot.table) {
            this.combo = 0;
            this.mistakes += 1;
            this.events.push({ type: 'wrong-table', order, point: spot });
            return;
        }
        this.tray = null;
        this.orders = this.orders.filter((ticket) => ticket !== order);
        this.combo += 1;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        this.delivered += 1;
        this.vipServed ||= order.vip;
        const bonus = this.combo % 3 === 0 ? 50 : 0;
        const points = 100 + bonus + (order.vip ? 75 : 0);
        this.score += points;
        this.events.push({ type: 'served', order, points, bonus, point: spot });
    }

    addTicket(vip) {
        const index = this.regularNumber + this.variation;
        const recipe = vip ? 'vip' : EARLY_MENU[index % EARLY_MENU.length];
        const table = vip ? 2 : TABLES[index % TABLES.length];
        const order = {
            id: ++this.ticketNumber, recipe, table, vip, state: 'waiting',
            due: Math.min(RUSH_DURATION, this.elapsed + (vip ? 30 : this.rules.patience)),
            readyAt: 0,
        };
        this.orders.push(order);
        if (vip) this.vipIssued = true;
        else {
            this.regularNumber += 1;
            this.nextTicketAt = this.elapsed + this.rules.cadence;
        }
        this.events.push({ type: vip ? 'vip' : 'arrival', order });
    }

    schedule() {
        if (this.orders.length >= this.rules.capacity) return;
        if (this.elapsed >= VIP_AT && !this.vipIssued) {
            this.addTicket(true);
        } else if (this.elapsed >= this.nextTicketAt && (this.elapsed < 77 || (this.vipIssued && this.elapsed < 108))) {
            this.addTicket(false);
        }
    }

    updateTickets() {
        for (const order of this.orders) {
            if (order.due <= this.elapsed + 1e-6) {
                order.state = 'expired';
                this.expired += 1;
                this.combo = 0;
                if (this.tray?.orderId === order.id) this.tray = null;
                this.events.push({ type: 'expired', order });
            } else if (order.state === 'preparing' && order.readyAt <= this.elapsed + 1e-6) {
                order.state = 'ready';
                this.events.push({ type: 'ready', order });
            }
        }
        this.orders = this.orders.filter((order) => order.state !== 'expired');
    }

    advance(dt, input = {}) {
        if (this.status !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
        this.elapsed = Math.min(RUSH_DURATION, this.elapsed + dt);
        const closing = this.remaining <= 1e-6;
        if (closing) this.elapsed = RUSH_DURATION;
        this.updateTickets();
        if (closing) {
            this.status = 'finished';
            this.events.push({ type: 'finished' });
            return;
        }
        this.move(dt, input);
        if (input.interact) this.interact();
        this.schedule();
    }

    move(dt, input) {
        const player = this.player;
        const x = clamp(Number(input.x) || 0, -1, 1);
        const z = clamp(Number(input.z) || 0, -1, 1);
        const magnitude = Math.hypot(x, z);
        const moving = magnitude > .02;
        const direction = moving ? { x: x / magnitude, z: z / magnitude } : player.forward;
        const run = Boolean(input.run && moving);
        const slippery = this.puddles.some((point) => rushDistance(point, player.position) < SPILL_RADIUS);
        const speed = moving ? (run ? RUN : WALK) * Math.min(1, magnitude) : 0;
        const blend = slippery ? 1 - Math.exp(-dt * 4.9) : 1;
        const before = player.position;
        const oldSpeed = player.speed;
        this.velocity.x += (direction.x * speed - this.velocity.x) * blend;
        this.velocity.z += (direction.z * speed - this.velocity.z) * blend;
        if (speed > 0 || Math.hypot(this.velocity.x, this.velocity.z) > .02) {
            player.position = this.ground.move('player', {
                x: before.x + this.velocity.x * dt, z: before.z + this.velocity.z * dt,
            });
        }
        player.travelledDistance = rushDistance(before, player.position);
        player.speed = player.travelledDistance / dt;
        if (this.tray) this.balanceTray(dt, direction, run, slippery, oldSpeed);
        player.forward = direction;
        player.motionState = player.speed < .12 ? 'idle' : run ? 'sprint' : 'walk';
    }

    balanceTray(dt, direction, run, slippery, oldSpeed) {
        const tray = this.tray;
        const facing = this.player.forward;
        const angle = clamp(1 - (facing.x * direction.x + facing.z * direction.z), 0, 2);
        const turn = run && oldSpeed > WALK + .75 ? angle * .51 : 0;
        const load = this.carriedOrder?.vip ? 1.23 : 1;
        const slip = slippery && this.player.speed > 2 ? dt * (run ? .48 : .13) : 0;
        tray.risk = clamp(tray.risk + (turn + slip) * load - dt * (run ? .23 : .68), 0, 1);
        const side = facing.x * direction.z - facing.z * direction.x;
        tray.lean = clamp(tray.lean * Math.exp(-dt * 6) + Math.sign(side || 1) * turn, -1, 1);
        if (tray.risk >= 1) this.spill();
    }

    spill() {
        const order = this.carriedOrder;
        const point = { ...this.player.position };
        this.tray = null;
        this.spills += 1;
        this.combo = 0;
        if (order) order.state = 'accepted';
        if (this.puddles.length < 64 && !this.puddles.some((puddle) => rushDistance(puddle, point) < 0.8)) {
            this.puddles.push(point);
        }
        this.events.push({ type: 'spill', order, point });
    }

    drainEvents() { return this.events.splice(0); }

    result() {
        return {
            won: this.status === 'finished' && this.delivered >= this.rules.quota,
            score: this.score, delivered: this.delivered, quota: this.rules.quota,
            bestCombo: this.bestCombo, vipServed: this.vipServed,
            expired: this.expired, spills: this.spills, mistakes: this.mistakes,
        };
    }

    dispose() { this.ground.dispose(); }
}
