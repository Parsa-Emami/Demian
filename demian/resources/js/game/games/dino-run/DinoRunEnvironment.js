/** MIT — source-drawn scenery. Six small cached tiles; no shaders or per-frame textures. */
const TAU = Math.PI * 2;
const mod = (x, n) => ((x % n) + n) % n;
const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
const DAY = { top: [153, 200, 211], horizon: [247, 231, 190], ground: '#d4bd91', ink: '#30574c' };
const NIGHT = { top: [18, 29, 52], horizon: [61, 77, 91], ground: '#253b40', ink: '#b3d6b9' };
const rgb = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

export function runnerLighting(time = 0) {
    const phase = mod(Number(time) || 0, 90);
    const night = phase < 26 ? 0 : phase < 38 ? smooth((phase - 26) / 12)
        : phase < 62 ? 1 : phase < 76 ? 1 - smooth((phase - 62) / 14) : 0;
    return { phase, night, twilight: 4 * night * (1 - night),
        skyTop: rgb(DAY.top, NIGHT.top, night),
        horizon: rgb(DAY.horizon, NIGHT.horizon, night), ink: night > .5 ? NIGHT.ink : DAY.ink };
}

function tile(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    draw(ctx, width, height);
    return canvas;
}

function mountains(ctx, w, h, color, detail, near) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, h);
    const steps = near ? 24 : 16;
    const ridge = [];
    for (let i = 0; i <= steps; i += 1) {
        const x = i / steps * w;
        const y = h * (near ? .42 : .3) + Math.sin(i / steps * TAU * 3) * h * .17
            + Math.cos(i / steps * TAU * 5) * h * .1;
        ridge.push({ x, y }); ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = detail;
    for (let i = 1; i < ridge.length - 1; i += 2) {
        const p = ridge[i]; ctx.beginPath(); ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 28, h); ctx.lineTo(p.x + 65, h); ctx.closePath(); ctx.fill();
    }
    if (near) {
        ctx.strokeStyle = detail; ctx.lineWidth = 2;
        for (let i = 0; i < 5; i += 1) {
            const x = 52 + i * 139, y = h * .8;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 22);
            ctx.moveTo(x, y - 10); ctx.lineTo(x - 7, y - 10); ctx.lineTo(x - 7, y - 17);
            ctx.moveTo(x, y - 6); ctx.lineTo(x + 8, y - 6); ctx.lineTo(x + 8, y - 14); ctx.stroke();
        }
    }
}

export default class DinoRunEnvironment {
    constructor({ tier = 'balanced', reducedMotion = false } = {}) {
        this.tier = tier; this.reducedMotion = reducedMotion; this.tiles = null;
        this.stars = Array.from({ length: tier === 'performance' ? 18 : 32 }, (_, i) => ({
            x: mod(i * .61803398875 + .07, 1), y: .12 + mod(i * .38196601125, .34), size: i % 5 === 0 ? 2 : 1,
        }));
    }
    prepare() {
        if (this.tiles) return;
        this.tiles = ['day', 'night'].map((mode) => {
            const night = mode === 'night';
            return {
                far: tile(768, 140, (ctx, w, h) => mountains(ctx, w, h,
                    night ? '#3c535c' : '#a4b6a1', night ? '#354851' : '#8ea88e', false)),
                near: tile(768, 92, (ctx, w, h) => mountains(ctx, w, h,
                    night ? '#2c454b' : '#79988a', night ? '#253b41' : '#678879', true)),
                ground: tile(512, 96, (ctx, w, h) => {
                    ctx.fillStyle = night ? NIGHT.ground : DAY.ground; ctx.fillRect(0, 0, w, h);
                    ctx.fillStyle = night ? '#52726a' : '#779276'; ctx.fillRect(0, 0, w, 3);
                    ctx.fillStyle = night ? '#334d50' : '#c5ad82'; ctx.fillRect(0, 5, w, 5);
                    for (let i = 0; i < 66; i += 1) {
                        const x = mod(i * 79 + 23, w), y = 16 + mod(i * 17, h - 18);
                        ctx.fillStyle = i % 2 ? (night ? '#3c5655' : '#b29c77') : (night ? '#1e333a' : '#ecd8b2');
                        ctx.fillRect(x, y, 2 + i % 4, 1 + i % 2);
                    }
                }),
            };
        });
    }
    drawLayer(ctx, layer, y, height, speed, distance, w, scale, night) {
        const images = this.tiles.map((pack) => pack[layer]);
        const tileWidth = images[0].width * scale;
        const offset = mod(distance * scale * speed, tileWidth);
        for (let i = -1; i * tileWidth - offset < w; i += 1) {
            const x = i * tileWidth - offset;
            ctx.drawImage(images[0], x, y, tileWidth, height);
            if (night > 0) {
                ctx.globalAlpha = night; ctx.drawImage(images[1], x, y, tileWidth, height); ctx.globalAlpha = 1;
            }
        }
    }
    draw(ctx, { width: w, height: h, ground, scale: s, distance, time }) {
        this.prepare(); const light = runnerLighting(time);
        const sky = ctx.createLinearGradient(0, 0, 0, ground);
        sky.addColorStop(0, light.skyTop); sky.addColorStop(1, light.horizon);
        ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
        if (light.twilight > .01) {
            ctx.globalAlpha = light.twilight * .42;
            const warm = ctx.createLinearGradient(0, h * .35, 0, ground);
            warm.addColorStop(0, 'rgba(238,155,114,0)'); warm.addColorStop(1, '#edb27c');
            ctx.fillStyle = warm; ctx.fillRect(0, 0, w, ground); ctx.globalAlpha = 1;
        }
        if (light.night > .05) {
            ctx.fillStyle = '#deedf0'; ctx.globalAlpha = light.night * .85;
            for (const star of this.stars) ctx.fillRect(star.x * w, star.y * h, star.size * s, star.size * s);
            ctx.globalAlpha = 1;
        }
        const sunY = h * (.23 + light.night * .29);
        ctx.globalAlpha = 1 - light.night; ctx.fillStyle = '#ffdb95';
        ctx.beginPath(); ctx.arc(w * .79, sunY, 23 * s, 0, TAU); ctx.fill();
        ctx.globalAlpha = light.night; ctx.fillStyle = '#e3ebd9';
        ctx.beginPath(); ctx.arc(w * .76, h * .23, 18 * s, 0, TAU); ctx.fill();
        ctx.fillStyle = '#a4bbbc'; ctx.beginPath(); ctx.arc(w * .76 - 4 * s, h * .23 + 3 * s, 4 * s, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        const cloudWidth = 320 * s, drift = this.reducedMotion ? 0 : .07;
        ctx.fillStyle = '#f0f2e6'; ctx.globalAlpha = .62 - light.night * .39;
        for (let i = -1; i < w / cloudWidth + 2; i += 1) {
            const x = i * cloudWidth - mod(distance * s * drift, cloudWidth), y = h * .29 + mod(i, 3) * 13 * s;
            ctx.beginPath(); ctx.ellipse(x, y, 36 * s, 6 * s, 0, 0, TAU);
            ctx.ellipse(x + 13 * s, y - 4 * s, 20 * s, 9 * s, 0, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
        this.drawLayer(ctx, 'far', ground - 140 * s, 140 * s, this.reducedMotion ? .1 : .14, distance, w, s, light.night);
        this.drawLayer(ctx, 'near', ground - 80 * s, 92 * s, .28, distance, w, s, light.night);
        this.drawLayer(ctx, 'ground', ground, h - ground, 1, distance, w, s, light.night);
        return light;
    }
    drawObstacles(ctx, obstacles, { ground, scale: s, time, night }) {
        ctx.save(); ctx.translate(0, ground); ctx.scale(s, -s);
        for (const o of obstacles) {
            if (o.type === 'cactus') {
                ctx.fillStyle = rgb([49, 94, 77], [131, 183, 160], night);
                ctx.beginPath(); ctx.roundRect(o.x + o.w * .37, 0, o.w * .32, o.h, 3); ctx.fill();
                ctx.beginPath(); ctx.roundRect(o.x, o.h * .34, o.w, 7, 3); ctx.fill();
                ctx.beginPath(); ctx.roundRect(o.x, o.h * .34, 6, o.h * .42, 3); ctx.fill();
                ctx.beginPath(); ctx.roundRect(o.x + o.w - 6, o.h * .34, 6, o.h * .32, 3); ctx.fill();
                ctx.fillStyle = rgb([110, 153, 119], [198, 222, 192], night);
                ctx.fillRect(o.x + o.w * .42, 3, 2, o.h - 8);
            } else {
                const flap = Math.sin(time * 19 + o.id * .7);
                ctx.fillStyle = rgb([56, 73, 89], [197, 213, 206], night);
                ctx.beginPath(); ctx.ellipse(o.x + 20, o.y + 9, 12, 5, -.12, 0, TAU); ctx.fill();
                ctx.beginPath(); ctx.moveTo(o.x + 14, o.y + 10); ctx.lineTo(o.x + 6, o.y + 12 + flap * 9);
                ctx.lineTo(o.x + 27, o.y + 10); ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.moveTo(o.x + 12, o.y + 10); ctx.lineTo(o.x + 2, o.y + 8); ctx.lineTo(o.x + 10, o.y + 5); ctx.fill();
                ctx.fillRect(o.x + 30, o.y + 10, 5, 5);
                ctx.fillStyle = '#e5b677'; ctx.fillRect(o.x + 35, o.y + 11, 5, 2);
                ctx.fillStyle = night > .5 ? '#263743' : '#edf0dc'; ctx.fillRect(o.x + 32, o.y + 13, 1.5, 1.5);
            }
        }
        ctx.restore();
    }
    drawDust(ctx, { x, ground, scale: s, time, sliding, running }) {
        if (this.reducedMotion || (!sliding && !running)) return;
        const count = this.tier === 'performance' ? 2 : sliding ? 6 : 3;
        ctx.fillStyle = '#e9d9b9';
        for (let i = 0; i < count; i += 1) {
            const age = mod(time * (sliding ? 2.2 : 3.3) + i / count, 1);
            ctx.globalAlpha = (1 - age) * .32;
            ctx.beginPath(); ctx.arc(x - (17 + age * 44) * s, ground - (2 + Math.sin(age * Math.PI) * 8) * s,
                (1 + age * 3) * s, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
    dispose() {
        for (const pack of this.tiles ?? []) for (const canvas of Object.values(pack)) { canvas.width = 1; canvas.height = 1; }
        this.tiles = null; this.stars = [];
    }
}
