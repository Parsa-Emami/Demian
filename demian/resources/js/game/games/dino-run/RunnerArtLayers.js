import art from '../../../../game/art-direction.json' with { type: 'json' };

const P = art.palette;
function panel(ctx, x, y, w, h, color, radius = 3) {
    let gradient = color;
    if (typeof color === 'string') { gradient = ctx.createLinearGradient(x, y, x + w, y + h); gradient.addColorStop(0, P.trim); gradient.addColorStop(.05, color); gradient.addColorStop(1, color); }
    ctx.fillStyle = gradient; ctx.strokeStyle = '#182c2745'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill(); ctx.stroke();
}
function architecture(ctx) {
    ctx.fillStyle = P.plaster; ctx.fillRect(0, 0, 1280, 720);
    for (let x = 0; x < 1280; x += 320) {
        panel(ctx, x + 24, 92, 272, 318, P.walnut);
        const sky = ctx.createLinearGradient(0, 110, 0, 390);
        sky.addColorStop(0, P.sky); sky.addColorStop(.67, '#e0d9b8'); sky.addColorStop(.68, P.sea); sky.addColorStop(1, '#567b78');
        ctx.fillStyle = sky; ctx.fillRect(x + 38, 105, 244, 288);
        ctx.fillStyle = P.trim; ctx.fillRect(x + 155, 105, 8, 288); ctx.fillRect(x + 38, 271, 244, 7);
        ctx.fillStyle = '#ffffff30'; ctx.beginPath(); ctx.moveTo(x + 40, 106); ctx.lineTo(x + 115, 106); ctx.lineTo(x + 278, 300); ctx.lineTo(x + 278, 345); ctx.fill();
        panel(ctx, x + 14, 395, 292, 13, P.walnut);
        ctx.strokeStyle = '#c6d9d02b'; ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + 40, 325 + i * 17); ctx.bezierCurveTo(x + 90, 315 + i * 17, x + 190, 340 + i * 17, x + 280, 326 + i * 17); ctx.stroke(); }
    }
    ctx.fillStyle = P.walnut; ctx.fillRect(0, 42, 1280, 20); ctx.fillStyle = P.trim; ctx.fillRect(0, 39, 1280, 4);
    ctx.fillStyle = P.sage; ctx.fillRect(0, 447, 1280, 172); ctx.fillStyle = P.walnut; ctx.fillRect(0, 442, 1280, 8);
    for (let x = 0; x < 1280; x += 80) { ctx.strokeStyle = '#203e362b'; ctx.strokeRect(x + 5, 460, 68, 140); }
    ctx.fillStyle = P.walnut; ctx.fillRect(0, 609, 1280, 11);
}
function furnishings(ctx) {
    for (let x = 0; x < 1280; x += 640) {
        ctx.fillStyle = '#253b2e30'; ctx.fillRect(x + 54, 138, 230, 298);
        panel(ctx, x + 48, 128, 228, 296, P.walnut);
        for (let row = 0; row < 3; row++) {
            const y = 151 + row * 83; ctx.fillStyle = '#3c4237'; ctx.fillRect(x + 62, y, 198, 72);
            for (let book = 0; book < 11; book++) {
                const height = 43 + (book * 17 + row * 7) % 25, bx = x + 67 + book * 17;
                ctx.fillStyle = [P.trim, P.sage, '#8f6858', '#b49662'][book % 4]; ctx.fillRect(bx, y + 69 - height, 12, height);
                ctx.fillStyle = '#f0d9ab4d'; ctx.fillRect(bx + 2, y + 73 - height, 1, height - 8);
                ctx.fillStyle = '#202d2930'; ctx.fillRect(bx + 1, y + 64, 10, 2);
            }
            ctx.fillStyle = P.oak; ctx.fillRect(x + 58, y + 72, 210, 7); ctx.fillStyle = P.trim; ctx.fillRect(x + 58, y + 72, 210, 1);
        }
        panel(ctx, x + 375, 317, 176, 91, P.ink);
        ctx.fillStyle = P.trim; ctx.textAlign = 'center'; ctx.font = '600 23px Georgia'; ctx.fillText('DEMIAN', x + 463, 355);
        ctx.font = '12px Georgia'; ctx.fillText('COFFEE · SEA · STORIES', x + 463, 382);
    }
}
function foreground(ctx) {
    for (let x = 0; x < 1280; x += 640) {
        const fabric = ctx.createLinearGradient(0, 472, 0, 600);
        fabric.addColorStop(0, '#648270'); fabric.addColorStop(.13, P.upholstery); fabric.addColorStop(1, '#28483f');
        ctx.fillStyle = '#152c2730'; ctx.beginPath(); ctx.ellipse(x + 320, 614, 267, 12, 0, 0, Math.PI * 2); ctx.fill();
        panel(ctx, x + 100, 475, 434, 109, fabric, 17);
        for (let seam = 0; seam < 7; seam++) { ctx.strokeStyle = '#1f392e50'; ctx.beginPath(); ctx.moveTo(x + 133 + seam * 57, 482); ctx.lineTo(x + 133 + seam * 57, 568); ctx.stroke(); }
        panel(ctx, x + 93, 568, 448, 26, '#426553', 8);
        ctx.fillStyle = P.walnut; ctx.fillRect(x + 112, 602, 13, 17); ctx.fillRect(x + 509, 602, 13, 17);
        panel(ctx, x + 25, 562, 52, 49, P.stone, 6);
        for (const [dx, dy, angle, color] of [[0, 0, .2, '#647d60'], [-21, -12, -.6, '#45664d'], [19, -31, .4, '#78916a']]) {
            ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x + 51 + dx, 541 + dy, 18, 36, angle, 0, Math.PI * 2); ctx.fill();
        }
        const center = x + 379;
        ctx.strokeStyle = P.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(center, 0); ctx.lineTo(center, 150); ctx.stroke();
        const glow = ctx.createRadialGradient(center, 180, 0, center, 180, 115); glow.addColorStop(0, '#ffe3a524'); glow.addColorStop(1, '#ffe3a500'); ctx.fillStyle = glow; ctx.fillRect(center - 115, 65, 230, 230);
        ctx.fillStyle = P.upholstery; ctx.beginPath(); ctx.moveTo(center - 27, 149); ctx.lineTo(center + 27, 149); ctx.lineTo(center + 48, 182); ctx.lineTo(center - 48, 182); ctx.fill();
        ctx.fillStyle = P.brass; ctx.fillRect(center - 48, 181, 96, 4); ctx.fillStyle = '#ffe3a8'; ctx.beginPath(); ctx.ellipse(center, 185, 44, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
}
export function createRunnerArtLayers(tier = 'balanced') {
    const scale = art.runner.rasterScale[tier] ?? .8, width = Math.round(1280 * scale), height = Math.round(720 * scale);
    const layers = [architecture, furnishings, foreground].map((paint, index) => {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Runner art canvas unavailable');
        ctx.scale(scale, scale); paint(ctx); return { canvas, parallax: art.runner.parallax[index] };
    });
    const decodedBytes = width * height * 4 * layers.length;
    if (decodedBytes > art.runner.decodedBudgetBytes) throw new RangeError('Runner art image budget exceeded');
    return { version: art.version, layers, width, height, decodedBytes };
}
