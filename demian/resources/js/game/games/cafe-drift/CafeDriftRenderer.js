import { clamp, DRIFT } from './CafeDriftModel.js';

const MAX_X = DRIFT.targetMax * DRIFT.targetUnit;
const LOOKAHEAD = 112;
const TAU = Math.PI * 2;
const COLORS = ['#ca8965', '#72b6a0', '#e2ae6d'];

function ellipse(ctx, x, y, w, h, color) {
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
}

function roundBox(ctx, x, y, w, h, radius, color) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = color;
    ctx.fill();
}

export default class CafeDriftRenderer {
    constructor(surface) {
        this.surface = surface;
    }

    resize() {
        this.surface.resizeSmooth();
        const { width, height } = this.surface.logicalDimensions();
        this.width = width;
        this.height = height;
        this.halfRoad = Math.min(width * .405, height * .55, 430);
        this.center = width / 2;
        this.horizon = height * .245;
        this.playerY = height * .77;
    }

    target(relativeX) {
        const worldX = (relativeX * this.width - this.center) * MAX_X / this.halfRoad;
        return clamp(Math.round(worldX / DRIFT.targetUnit), -DRIFT.targetMax, DRIFT.targetMax);
    }

    project(x, progress) {
        const depth = .26 + .74 * progress;
        return {
            x: this.center + this.halfRoad * depth * x / MAX_X,
            y: this.horizon + (this.playerY - this.horizon) * progress,
            size: this.halfRoad * depth,
        };
    }

    backdrop(ctx, time) {
        const { width: w, height: h, center: cx, halfRoad: road, horizon: y } = this;
        const wall = ctx.createLinearGradient(0, 0, 0, h);
        wall.addColorStop(0, '#24191a');
        wall.addColorStop(.47, '#3a2929');
        wall.addColorStop(1, '#1b2022');
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, w, h);

        for (const side of [-1, 1]) {
            const lampX = cx + side * Math.min(w * .38, road * .9);
            const glow = ctx.createRadialGradient(lampX, y * .58, 5, lampX, y * .58, road * .53);
            glow.addColorStop(0, '#e2a45735');
            glow.addColorStop(1, '#e2a45700');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, w, h * .66);
            ctx.fillStyle = '#6a4b3e';
            ctx.fillRect(lampX - 1, 0, 2, y * .52);
            roundBox(ctx, lampX - 13, y * .49, 26, 9, 5, '#bb825b');
            ellipse(ctx, lampX, y * .58, 10, 3, '#ffd89d');
        }

        const far = this.project(-MAX_X * 1.14, 0);
        const floor = this.project(-MAX_X * 1.14, 1.43);
        ctx.beginPath();
        ctx.moveTo(far.x, far.y);
        ctx.lineTo(w - far.x, far.y);
        ctx.lineTo(w - floor.x, floor.y);
        ctx.lineTo(floor.x, floor.y);
        ctx.closePath();
        const wood = ctx.createLinearGradient(0, far.y, 0, h);
        wood.addColorStop(0, '#795044');
        wood.addColorStop(1, '#443132');
        ctx.fillStyle = wood;
        ctx.fill();
        ctx.strokeStyle = '#d99f746e';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.strokeStyle = '#eebc8a24';
        ctx.lineWidth = 1;
        for (let i = -2; i <= 2; i++) {
            const top = this.project(i * 1200, 0), bottom = this.project(i * 1200, 1.43);
            ctx.beginPath();
            ctx.moveTo(top.x, top.y);
            ctx.lineTo(bottom.x, bottom.y);
            ctx.stroke();
        }
        for (let i = 0; i < 15; i++) {
            const p = ((i + time / 14) % 15) / 13;
            const line = this.project(-MAX_X * 1.14, p ** 1.4);
            ctx.beginPath();
            ctx.moveTo(line.x, line.y);
            ctx.lineTo(w - line.x, line.y);
            ctx.stroke();
        }

        const line = this.project(-MAX_X, 1);
        ctx.setLineDash([3, 7]);
        ctx.strokeStyle = '#a4efce4a';
        ctx.beginPath();
        ctx.moveTo(line.x, line.y);
        ctx.lineTo(w - line.x, line.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    drawGate(ctx, gate, time) {
        const remaining = gate.tick - time;
        if (remaining > LOOKAHEAD || remaining < -25) return;
        const progress = (1 - remaining / LOOKAHEAD) ** 1.6;
        ctx.globalAlpha = clamp((LOOKAHEAD - remaining) / 16, 0, 1);
        for (const obstacle of gate.obstacles) {
            const p = this.project(obstacle.x, progress);
            const width = p.size * .25;
            ellipse(ctx, p.x, p.y + width * .07, width * .57, width * .16, '#2c1f24a0');
            const color = COLORS[obstacle.style];
            if (obstacle.style === 0) {
                roundBox(ctx, p.x - width * .39, p.y - width * .65, width * .78, width * .63, width * .07, color);
                roundBox(ctx, p.x - width * .31, p.y - width * .52, width * .62, width * .07, width * .02, '#633e35');
                roundBox(ctx, p.x - width * .31, p.y - width * .21, width * .62, width * .07, width * .02, '#633e35');
            } else if (obstacle.style === 1) {
                roundBox(ctx, p.x - width * .32, p.y - width * .41, width * .64, width * .42, width * .08, '#c08a70');
                ellipse(ctx, p.x - width * .19, p.y - width * .51, width * .23, width * .18, '#497c6e');
                ellipse(ctx, p.x + width * .17, p.y - width * .62, width * .26, width * .2, color);
                ellipse(ctx, p.x, p.y - width * .45, width * .24, width * .17, '#6ba086');
            } else {
                roundBox(ctx, p.x - width * .38, p.y - width * .81, width * .76, width * .40, width * .07, color);
                roundBox(ctx, p.x - width * .32, p.y - width * .52, width * .10, width * .50, width * .03, '#ac7759');
                roundBox(ctx, p.x + width * .22, p.y - width * .52, width * .10, width * .50, width * .03, '#ac7759');
                roundBox(ctx, p.x - width * .42, p.y - width * .31, width * .84, width * .16, width * .07, color);
            }
        }
        if (gate.bean !== null && remaining >= -DRIFT.contactTicks) {
            const p = this.project(gate.bean, progress);
            const r = p.size * .062;
            ellipse(ctx, p.x, p.y, r * 1.65, r * .53, '#ffe19340');
            ellipse(ctx, p.x, p.y - r * .75, r * .75, r, '#ffc86d');
            ctx.strokeStyle = '#8b593e';
            ctx.lineWidth = Math.max(1, r * .14);
            ctx.beginPath();
            ctx.moveTo(p.x + r * .2, p.y - r * 1.47);
            ctx.lineTo(p.x - r * .2, p.y - r * .18);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    drawTray(ctx, model, alpha, reduced) {
        const p = this.project(model.previousX + (model.x - model.previousX) * alpha, 1);
        const scale = p.size / 125;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(scale, scale);
        ctx.rotate(reduced ? 0 : model.velocity * .0015);
        ellipse(ctx, 0, 5, 12, 4, '#21191a9e');
        ellipse(ctx, 0, 0, 12, 5, '#a8e4c0');
        ellipse(ctx, 0, 0, 9.7, 3.8, '#487f77');
        for (let cup = 0; cup < model.cups; cup++) {
            const x = (cup - (model.cups - 1) / 2) * 6.5;
            ellipse(ctx, x + 2.6, -3.2, 1.5, 1.3, '#fbebcf');
            roundBox(ctx, x - 2.7, -7, 5.4, 6.7, 1.7, '#fbebcf');
            ellipse(ctx, x, -6.3, 2.1, .8, '#593726');
        }
        ctx.restore();
    }

    render(model, alpha, effect, reduced) {
        const ctx = this.surface.beginFrame('#24191a');
        const time = model.tick ? model.tick - 1 + alpha : 0;
        this.backdrop(ctx, reduced ? 0 : time);
        const visible = model.gates.slice(Math.max(0, model.index - 1), model.index + 5).reverse();
        for (const gate of visible) this.drawGate(ctx, gate, time);
        this.drawTray(ctx, model, alpha, reduced);
        if (effect && !reduced && model.tick - effect.tick < 25) {
            const age = (model.tick - effect.tick + alpha) / 25;
            const spot = this.project(effect.x, 1);
            ctx.globalAlpha = 1 - age;
            ctx.strokeStyle = effect.kind === 'hit' ? '#ff8b78' : '#ffe0a0';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(spot.x, spot.y, 13 + age * 28, 6 + age * 14, 0, 0, TAU);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        this.surface.present();
    }
}
