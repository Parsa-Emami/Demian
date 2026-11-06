import { createRunnerArtLayers } from './RunnerArtLayers.js';
import { drawRunnerHazard } from './RunnerHazardRenderer.js';
import art from '../../../../game/art-direction.json' with { type: 'json' };
const TAU = Math.PI * 2;
const mod = (x, n) => ((x % n) + n) % n;
const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const rgb = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

export function runnerLighting(time = 0) {
    const phase = mod(Number(time) || 0, 90);
    const night = phase < 26 ? 0 : phase < 38 ? smooth((phase - 26) / 12)
        : phase < 62 ? 1 : phase < 76 ? 1 - smooth((phase - 62) / 14) : 0;
    return { phase, night, twilight: 4 * night * (1 - night),
        skyTop: rgb([153, 200, 211], [18, 29, 52], night),
        horizon: rgb([247, 231, 190], [61, 77, 91], night), ink: '#f6e8cd' };
}

export default class DinoRunEnvironment {
    constructor({ tier = 'balanced', reducedMotion = false } = {}) { this.tier = tier; this.reducedMotion = reducedMotion; this.image = null; }
    async load() { this.setQuality(this.tier); }
    setQuality(tier) {
        if (this.tier === tier && this.art) return;
        this.dispose(); this.tier = tier;
        try { this.art = createRunnerArtLayers(tier); } catch { this.art = null; }
    }
    drawFallback(ctx, w, ground, distance, s) {
        ctx.fillStyle = '#494e49'; ctx.fillRect(0, 0, w, ground);
        const step = 520 * s, offset = mod(distance * s * .22, step);
        for (let x = -step; x < w + step; x += step) {
            const left = x - offset;
            ctx.fillStyle = '#285448'; ctx.fillRect(left + 30 * s, ground * .58, 310 * s, ground * .25);
            ctx.fillStyle = '#aa784b'; ctx.fillRect(left + 22 * s, ground * .56, 326 * s, 9 * s);
            for (let i = 0; i < 3; i++) {
                ctx.fillStyle = '#ac8055'; ctx.fillRect(left + 50 * s, ground * (.22 + i * .105), 200 * s, 5 * s);
                for (let b = 0; b < 9; b++) {
                    ctx.fillStyle = ['#c7ad75', '#754a4d', '#acb7a3'][b % 3];
                    ctx.fillRect(left + (60 + b * 19) * s, ground * (.22 + i * .105) - 20 * s, 12 * s, 20 * s);
                }
            }
        }
    }
    draw(ctx, { width: w, height: h, ground, scale: s, distance, time }) {
        const light = runnerLighting(time);
        ctx.fillStyle = '#524d45'; ctx.fillRect(0, 0, w, h);
        if (this.art?.layers) {
            const tileHeight = ground / art.runner.groundFraction, tileWidth = tileHeight * art.runner.layerWidth / art.runner.layerHeight;
            for (const layer of this.art.layers) {
                const offset = this.reducedMotion ? 0 : mod(distance * s * layer.parallax, tileWidth);
                for (let x = -offset; x < w; x += tileWidth) ctx.drawImage(layer.canvas, x, 0, tileWidth, tileHeight);
            }
        } else this.drawFallback(ctx, w, ground, this.reducedMotion ? 0 : distance, s);
        ctx.fillStyle = `rgba(14,27,35,${light.night * .28})`; ctx.fillRect(0, 0, w, h);
        const floor = ctx.createLinearGradient(0, ground, 0, h);
        floor.addColorStop(0, art.palette.oak); floor.addColorStop(1, art.palette.walnut);
        ctx.fillStyle = floor; ctx.fillRect(0, ground, w, h - ground);
        ctx.fillStyle = '#d0a46e'; ctx.fillRect(0, ground, w, Math.max(1, s * 1.5));
        ctx.strokeStyle = 'rgba(232,206,166,.10)'; ctx.lineWidth = 1;
        const tile = 100 * s, offset = mod(distance * s, tile);
        for (let x = -offset; x < w; x += tile) { ctx.beginPath(); ctx.moveTo(x, ground + s * 5); ctx.lineTo(x - 35 * s, h); ctx.stroke(); }
        for (let row = 1; row < 4; row++) {
            const y = ground + (h - ground) * row / 4;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        if (!this.reducedMotion) {
            ctx.fillStyle = '#ffdba2';
            for (let i = 0; i < (this.tier === 'performance' ? 4 : 10); i++) {
                ctx.globalAlpha = .13 + Math.sin(time * .7 + i) * .06;
                ctx.fillRect(mod(i * 193 + time * (3 + i % 4), w), ground * (.18 + mod(i * .173, .6)), s, s);
            }
            ctx.globalAlpha = 1;
        }
        const vignette = ctx.createLinearGradient(0, 0, 0, h);
        vignette.addColorStop(0, 'rgba(10,15,18,.40)'); vignette.addColorStop(.3, 'rgba(10,15,18,0)');
        vignette.addColorStop(.82, 'rgba(10,15,18,0)'); vignette.addColorStop(1, 'rgba(10,15,18,.25)');
        ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h); return light;
    }
    drawObstacles(ctx, obstacles, { ground, scale, time = 0 }) {
        ctx.save(); ctx.translate(0, ground); ctx.scale(scale, scale);
        for (const obstacle of obstacles) {
            ctx.fillStyle = '#14201d40'; ctx.beginPath(); ctx.ellipse(obstacle.x + obstacle.w / 2, 2, obstacle.w * .65, 3, 0, 0, TAU); ctx.fill();
            drawRunnerHazard(ctx, obstacle, { time, reducedMotion: this.reducedMotion });
        }
        ctx.restore();
    }
    drawDust(ctx, { x, ground, scale: s, time, sliding, running }) {
        if (this.reducedMotion || (!sliding && !running)) return;
        const count = this.tier === 'performance' ? 2 : sliding ? 6 : 3; ctx.fillStyle = '#e9cfa7';
        for (let i = 0; i < count; i++) {
            const age = mod(time * (sliding ? 2.2 : 3.3) + i / count, 1); ctx.globalAlpha = (1 - age) * .28; ctx.beginPath();
            ctx.arc(x - (17 + age * 44) * s, ground - (2 + Math.sin(age * Math.PI) * 8) * s, (1 + age * 3) * s, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
    dispose() { for (const layer of this.art?.layers ?? []) { layer.canvas.width = 1; layer.canvas.height = 1; } this.art = null; this.image = null; }
}
