const COLORS = { dash: '#8ddbd9', dodge: '#aac5ea', slide: '#dfceb3', land: '#e8dac6', takeoff: '#f6e9d1', wave: '#f6ca78', celebrate: '#e5a5aa', ability: '#c4b2eb' };
export default class CharacterFeedback {
    constructor({ limit = 48 } = {}) { this.limit = Math.max(0, Math.min(64, limit)); this.items = []; this.sequence = 0; this.footPhase = null; }
    emit(kind, entity) {
        if (!COLORS[kind] || !entity?.isPlayerControlled) return;
        const origin = entity.group.position, direction = entity.actionDirection ?? { x: entity.facing || 1, z: 0 };
        const social = ['wave', 'celebrate', 'ability'].includes(kind), count = social ? 8 : kind === 'dash' ? 7 : 5;
        if (kind === 'land' || kind === 'takeoff') this.add({ x: origin.x, z: origin.z, h: 0, vx: 0, vz: 0, vh: 0, life: .36, age: 0, kind: 'ring', color: COLORS[kind], size: .32 });
        for (let i = 0; i < count; i++) {
            const angle = (i / count + this.sequence++ * .381966) * Math.PI * 2, speed = social ? .9 : 1.4;
            this.add({ x: origin.x, z: origin.z, h: social ? 2.8 : .07, vx: Math.cos(angle) * speed - (social ? 0 : direction.x * .65),
                vz: Math.sin(angle) * speed * .5 - (social ? 0 : direction.z * .65), vh: social ? 1.5 : .6, life: social ? .75 : .38, age: 0,
                kind: social ? 'spark' : kind === 'dash' ? 'wind' : 'dust', color: COLORS[kind], size: social ? .1 : .12 });
        }
    }
    add(item) { if (!this.limit) return; if (this.items.length >= this.limit) this.items.shift(); this.items.push(item); }
    update(dt, entity) {
        const delta = Math.max(0, Math.min(.05, dt));
        for (const item of this.items) { item.age += delta; item.x += item.vx * delta; item.z += item.vz * delta; item.h = Math.max(0, item.h + item.vh * delta); item.vh -= delta * 2; }
        this.items = this.items.filter(item => item.age < item.life);
        const phase = Math.floor((entity?.animator?.locomotionPhase ?? 0) * 2);
        if (phase !== this.footPhase && entity?.isPlayerControlled && entity.grounded && ['run', 'sprint'].includes(entity.state)) {
            const p = entity.group.position;
            this.add({ x: p.x, z: p.z, h: .02, vx: 0, vz: 0, vh: .2, life: .24, age: 0, kind: 'dust', color: '#dfd2bd', size: .08 });
        }
        this.footPhase = phase;
    }
    draw(ctx, camera, { foreground = false, reducedMotion = false } = {}) {
        if (reducedMotion) return;
        ctx.save();
        for (const item of this.items) {
            if ((item.kind === 'spark') !== foreground) continue;
            const p = camera.worldToScreen(item), t = item.age / item.life, scale = camera.pixelsPerUnit;
            const radius = Math.max(.6, item.size * scale * (1 + t)), y = p.y - item.h * scale;
            ctx.globalAlpha = (1 - t) * (item.kind === 'dust' ? .32 : .66);
            ctx.fillStyle = item.color; ctx.strokeStyle = item.color; ctx.lineWidth = Math.max(.8, scale * .035); ctx.beginPath();
            if (item.kind === 'ring') { ctx.ellipse(p.x, p.y, radius * (1 + 3 * t), radius * (.35 + t), 0, 0, Math.PI * 2); ctx.stroke(); }
            else if (item.kind === 'wind') { ctx.moveTo(p.x, y); ctx.lineTo(p.x - item.vx * scale * .22, y - item.vz * scale * .12); ctx.stroke(); }
            else if (item.kind === 'spark') { ctx.moveTo(p.x - radius, y); ctx.lineTo(p.x + radius, y); ctx.moveTo(p.x, y - radius); ctx.lineTo(p.x, y + radius); ctx.stroke(); }
            else { ctx.ellipse(p.x, y, radius, radius * .55, 0, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.restore();
    }
    clear() { this.items.length = 0; this.footPhase = null; }
}
