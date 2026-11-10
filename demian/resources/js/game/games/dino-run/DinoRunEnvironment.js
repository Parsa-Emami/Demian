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
    async load() {
        const image = new Image(); image.decoding = 'async';
        image.src = new URL('assets/environments/cafe-runner-v1/interior.webp', document.baseURI).href;
        try {
            if (typeof image.decode === 'function') await image.decode();
            else if (!image.complete) await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
            });
            if (!this.disposed && image.naturalWidth) this.image = image;
        } catch {}
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
        if (this.image) {
            const tileHeight = ground / .711, tileWidth = tileHeight * this.image.width / this.image.height;
            const offset = mod(distance * s * .22, tileWidth);
            for (let x = -offset; x < w; x += tileWidth) ctx.drawImage(this.image, x, 0, tileWidth, tileHeight);
        } else this.drawFallback(ctx, w, ground, distance, s);
        if (light.night > 0) {
            ctx.fillStyle = `rgba(14,27,35,${light.night * .28})`;
            ctx.fillRect(0, 0, w, ground);
        }
        if (this.gradientHeight !== h || this.gradientGround !== ground) {
            this.gradientHeight = h;
            this.gradientGround = ground;
            this.floor = ctx.createLinearGradient(0, ground, 0, h);
            this.floor.addColorStop(0, '#8d7b66');
            this.floor.addColorStop(1, '#403d37');
            this.vignette = ctx.createLinearGradient(0, 0, 0, h);
            this.vignette.addColorStop(0, 'rgba(10,15,18,.40)');
            this.vignette.addColorStop(.3, 'rgba(10,15,18,0)');
            this.vignette.addColorStop(.82, 'rgba(10,15,18,0)');
            this.vignette.addColorStop(1, 'rgba(10,15,18,.25)');
        }
        ctx.fillStyle = this.floor; ctx.fillRect(0, ground, w, h - ground);
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
        if (this.tier !== 'performance') {
            ctx.fillStyle = this.vignette;
            ctx.fillRect(0, 0, w, h);
        }
        return light;
    }
    drawObstacles(ctx, obstacles, { ground, scale: s }) {
        ctx.save(); ctx.translate(0, ground); ctx.scale(s, s);
        for (const o of obstacles) {
            if (o.attacker || o.x + o.w < -12 || o.x > ctx.canvas.width / s + 12) continue;
            const x = o.x, y = -o.y - o.h;
            ctx.fillStyle = 'rgba(12,18,17,.30)'; ctx.beginPath(); ctx.ellipse(x + o.w / 2, 2, o.w * .72, 3, 0, 0, TAU); ctx.fill();
            if (o.appearance === 'hanging-sign') {
                ctx.strokeStyle = '#b49362'; ctx.lineWidth = 2;
                for (const dx of [8, o.w - 8]) { ctx.beginPath(); ctx.moveTo(x + dx, y - 58); ctx.lineTo(x + dx, y); ctx.stroke(); }
                ctx.fillStyle = '#284c43'; ctx.fillRect(x, y, o.w, o.h);
                ctx.strokeStyle = '#ebc88e'; ctx.strokeRect(x + 2, y + 2, o.w - 4, o.h - 4);
                ctx.fillStyle = '#f3dab1'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('CAFÉ', x + o.w / 2, y + o.h * .7);
            } else if (o.appearance === 'serving-tray') {
                ctx.fillStyle = '#b87a43'; ctx.fillRect(x, y + o.h - 7, o.w, 7);
                ctx.fillStyle = '#e8e0cb'; ctx.fillRect(x + 9, y, 14, o.h - 7); ctx.fillRect(x + o.w - 24, y + 3, 14, o.h - 10);
                ctx.fillStyle = '#654331'; ctx.fillRect(x + 11, y + 1, 10, 3); ctx.fillRect(x + o.w - 22, y + 4, 10, 3);
                ctx.strokeStyle = '#e9c59a'; ctx.strokeRect(x + 8, y + 2, 17, 7);
            } else if (o.appearance === 'pipe') {
                ctx.fillStyle = '#6b7776'; ctx.fillRect(x, y + 4, o.w, o.h - 8);
                ctx.fillStyle = '#b8c6bc'; ctx.fillRect(x, y + 5, o.w, 4);
                ctx.fillStyle = '#b07f50'; ctx.fillRect(x + 9, y, 7, o.h); ctx.fillRect(x + o.w - 16, y, 7, o.h);
                ctx.strokeStyle = '#303f3e'; ctx.lineWidth = 2; ctx.strokeRect(x, y + 4, o.w, o.h - 8);
            } else if (o.type === 'bird') {
                ctx.strokeStyle = '#c79853'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + o.w / 2, y - 70); ctx.lineTo(x + o.w / 2, y + 2); ctx.stroke();
                ctx.fillStyle = '#243d37'; ctx.beginPath(); ctx.moveTo(x + 10, y); ctx.lineTo(x + o.w - 10, y);
                ctx.lineTo(x + o.w, y + o.h - 4); ctx.lineTo(x, y + o.h - 4); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#ffd998'; ctx.fillRect(x, y + o.h - 4, o.w, 4);
                ctx.strokeStyle = '#e3b96e'; ctx.strokeRect(x + 1, y + 1, o.w - 2, o.h - 1);
            } else if (o.appearance === 'traffic-cone') {
                ctx.fillStyle = '#d56a32'; ctx.beginPath(); ctx.moveTo(x + o.w / 2, y); ctx.lineTo(x + o.w - 2, 0); ctx.lineTo(x + 2, 0); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#ffedc9'; ctx.fillRect(x + o.w * .3, y + o.h * .4, o.w * .4, 6);
                ctx.fillRect(x + o.w * .16, y + o.h * .7, o.w * .68, 6);
                ctx.fillStyle = '#353d38'; ctx.fillRect(x - 2, -5, o.w + 4, 5);
            } else if (o.appearance === 'plant-pot') {
                ctx.fillStyle = '#396a46';
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath(); ctx.ellipse(x + o.w * (.2 + i * .15), y + 12 + i % 2 * 7, 5, 13, (i - 2) * .28, 0, TAU); ctx.fill();
                }
                ctx.fillStyle = '#ad6042'; ctx.fillRect(x + 3, y + o.h * .52, o.w - 6, o.h * .48);
                ctx.fillStyle = '#df9462'; ctx.fillRect(x, y + o.h * .5, o.w, 6);
            } else if (o.appearance === 'book-stack') {
                for (let i = 0; i < 4; i++) {
                    const by = y + o.h * i / 4, inset = i % 2 * 3;
                    ctx.fillStyle = ['#70494a', '#314f50', '#a37b4b', '#556448'][i];
                    ctx.fillRect(x + inset, by, o.w - 3, o.h / 4);
                    ctx.fillStyle = '#e4d5b5'; ctx.fillRect(x + inset + 3, by + 3, o.w - 10, Math.max(2, o.h / 4 - 5));
                }
            } else if (o.appearance === 'barrel') {
                ctx.fillStyle = '#91633f'; ctx.fillRect(x + 1, y + 3, o.w - 2, o.h - 3);
                ctx.fillStyle = '#bc8a53'; ctx.beginPath(); ctx.ellipse(x + o.w / 2, y + 4, o.w / 2, 4, 0, 0, TAU); ctx.fill();
                ctx.fillStyle = '#414c47'; ctx.fillRect(x, y + o.h * .25, o.w, 5); ctx.fillRect(x, y + o.h * .75, o.w, 5);
                ctx.strokeStyle = '#6c492e'; ctx.lineWidth = 2;
                for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + o.w * i / 4, y + 8); ctx.lineTo(x + o.w * i / 4, -2); ctx.stroke(); }
            } else if (o.appearance === 'floor-fan') {
                const radius = o.w / 2 - 2, centerX = x + o.w / 2, centerY = y + radius;
                ctx.fillStyle = '#576b61'; ctx.fillRect(centerX - 3, centerY, 6, -centerY); ctx.fillRect(x + 4, -5, o.w - 8, 5);
                ctx.fillStyle = '#91a494'; ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, TAU); ctx.fill();
                ctx.strokeStyle = '#31483e'; ctx.lineWidth = 3; ctx.stroke();
                for (let i = 0; i < 4; i++) {
                    const angle = i * TAU / 4;
                    ctx.beginPath(); ctx.moveTo(centerX, centerY); ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius); ctx.stroke();
                }
            } else if (o.appearance === 'suitcase') {
                ctx.fillStyle = '#334b48'; ctx.fillRect(x, y + 5, o.w, o.h - 5);
                ctx.strokeStyle = '#d6b480'; ctx.lineWidth = 2; ctx.strokeRect(x + o.w * .35, y, o.w * .3, 7);
                ctx.fillStyle = '#b78a54'; ctx.fillRect(x + 9, y + 5, 4, o.h - 5); ctx.fillRect(x + o.w - 13, y + 5, 4, o.h - 5);
                ctx.fillStyle = '#eccb91'; ctx.fillRect(x + o.w / 2 - 3, y + o.h * .4, 6, 7);
            } else if (o.appearance === 'chair') {
                ctx.fillStyle = '#67452c'; ctx.fillRect(x + 2, y + 3, 5, o.h - 3); ctx.fillRect(x + o.w - 7, y + 3, 5, o.h - 3);
                ctx.fillStyle = '#c7985f'; ctx.fillRect(x, y, o.w, 7); ctx.fillRect(x, y + 18, o.w, 4);
                ctx.fillStyle = '#ba8d55'; ctx.fillRect(x - 2, y + 30, o.w + 4, 7);
                ctx.fillStyle = '#e1bf88'; ctx.fillRect(x, y + 30, o.w, 2);
            } else {
                ctx.fillStyle = '#a57547'; ctx.fillRect(x, y + 2, o.w, o.h - 2);
                ctx.fillStyle = '#d0a46a'; ctx.fillRect(x - 1, y, o.w + 2, 4);
                ctx.fillStyle = '#3b5140'; ctx.fillRect(x + 4, y + 9, o.w - 8, o.h - 16);
                ctx.fillStyle = '#eed4a4'; ctx.fillRect(x + 7, y + 14, o.w - 14, 4);
                ctx.fillStyle = '#725335'; ctx.fillRect(x + 3, y + o.h - 5, o.w - 6, 2);
            }
            ctx.fillStyle = '#ebbe73'; ctx.beginPath(); ctx.moveTo(x + o.w / 2, y - 10);
            ctx.lineTo(x + o.w / 2 - 3, y - 15); ctx.lineTo(x + o.w / 2 + 3, y - 15); ctx.fill();
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
    dispose() { this.disposed = true; this.image = null; }
}
