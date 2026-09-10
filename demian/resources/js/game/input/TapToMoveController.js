/** Deterministic tap-to-move adapter. Navigation is injected, keeping input
 * independent from Phaser and allowing the same controller on desktop/mobile. */
export default class TapToMoveController {
    constructor({ navigation = null, stopDistance = 0.18, maxWaypoints = 128 } = {}) {
        this.navigation = navigation; this.stopDistance = Math.max(0.01, stopDistance); this.maxWaypoints = maxWaypoints; this.path = []; this.destination = null;
    }
    setDestination(origin, destination, options = {}) {
        if (!origin || !destination) return false;
        const path = this.navigation?.findPath?.(origin, destination, options) ?? [destination];
        if (!Array.isArray(path) || path.length === 0) { this.cancel(); return false; }
        this.path = path.slice(0, this.maxWaypoints).map(p => ({ x: Number(p.x), z: Number(p.z) })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.z));
        this.destination = this.path.at(-1) ?? null; return Boolean(this.destination);
    }
    update(position, speed, deltaSeconds) {
        if (!this.path.length) return { x: 0, z: 0, arrived: true, destination: this.destination };
        let next = this.path[0]; let dx = next.x - position.x, dz = next.z - position.z; let distance = Math.hypot(dx, dz);
        while (distance <= this.stopDistance && this.path.length > 1) { this.path.shift(); next = this.path[0]; dx=next.x-position.x; dz=next.z-position.z; distance=Math.hypot(dx,dz); }
        if (distance <= this.stopDistance) { this.cancel(); return { x:0, z:0, arrived:true, destination:this.destination }; }
        const amount = Math.min(distance, Math.max(0, Number(speed)||0) * Math.max(0, Number(deltaSeconds)||0));
        return { x: dx/distance * amount, z: dz/distance * amount, arrived:false, destination:this.destination };
    }
    cancel() { this.path=[]; this.destination=null; }
    get active() { return this.path.length > 0; }
}
