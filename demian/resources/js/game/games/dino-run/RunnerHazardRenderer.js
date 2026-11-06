import art from '../../../../game/art-direction.json' with { type: 'json' };
const P = art.palette;
function box(ctx, x, y, w, h, color, radius = 3) {
    ctx.fillStyle = color; ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill(); ctx.stroke();
}
function circle(ctx, x, y, radius, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); }
export function drawRunnerHazard(ctx, o, { time = 0, reducedMotion = false } = {}) {
    const w = o.w, h = o.h;
    ctx.save(); ctx.translate(o.x, -o.y - h);
    if ((o.warningLeft ?? 0) > 0) {
        ctx.globalAlpha *= reducedMotion ? .65 : .45 + .2 * Math.sin(time * Math.PI * 2);
        ctx.strokeStyle = o.attacker === 'amirreza' ? '#e9f1dc' : '#d0a46e'; ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]); ctx.strokeRect(0, 0, w, h); ctx.setLineDash([]);
        ctx.restore(); return;
    }
    ctx.fillStyle = '#1a292a14'; ctx.fillRect(1, 1, w - 2, h - 2);
    const name = o.appearance;
    if (name === 'shadow-ring') {
        box(ctx, 2, 2, w - 4, h - 4, '#293444', 12);
        ctx.strokeStyle = '#b9b4d4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w / 2, h / 2, h * .32, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#ece3bc'; ctx.lineWidth = 1.5;
        const spin = reducedMotion ? 0 : time * 5;
        for (let i = 0; i < 4; i++) { const angle = spin + i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(w / 2, h / 2); ctx.lineTo(w / 2 + Math.cos(angle) * 9, h / 2 + Math.sin(angle) * 9); ctx.stroke(); }
    } else if (name === 'feather-blade') {
        box(ctx, 1, 2, w - 2, h - 4, '#dddcc8', 7);
        ctx.fillStyle = '#faf1d7'; ctx.beginPath(); ctx.moveTo(3, h / 2); ctx.lineTo(w - 5, 4); ctx.lineTo(w - 14, h / 2); ctx.lineTo(w - 5, h - 4); ctx.fill();
        ctx.strokeStyle = P.brass; ctx.beginPath(); ctx.moveTo(4, h / 2); ctx.lineTo(w - 4, h / 2); ctx.stroke();
    } else if (name === 'book-tower') {
        for (let i = 0; i < 5; i++) { const y = h - (i + 1) * h / 5; box(ctx, i % 2 ? 2 : 0, y, w - 2, h / 5 - 1, [P.walnut, P.sage, '#95594f'][i % 3], 2); ctx.fillStyle = P.trim; ctx.fillRect(5, y + 3, w - 10, 2); }
        circle(ctx, w / 2, 5, 3, P.brass);
    } else if (name === 'walking-clock') {
        box(ctx, 2, 1, w - 4, h - 3, P.walnut, 9); circle(ctx, w / 2, h * .36, w * .37, P.trim); circle(ctx, w / 2, h * .36, 2, P.ink);
        ctx.strokeStyle = P.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w / 2 - 7, h * .36 - 4); ctx.lineTo(w / 2, h * .36); ctx.lineTo(w / 2 + 3, h * .36 - 9); ctx.stroke();
        box(ctx, 5, h * .65, w - 10, h * .21, P.brass, 4); circle(ctx, w / 2, h * .75, 3, P.walnut);
    } else if (name === 'coffee-geode') {
        box(ctx, 1, 2, w - 2, h - 3, P.sage, 9);
        ctx.fillStyle = '#86bab5'; ctx.beginPath(); ctx.moveTo(w * .5, 4); ctx.lineTo(w * .78, h * .5); ctx.lineTo(w * .5, h - 4); ctx.lineTo(w * .22, h * .5); ctx.fill();
        ctx.strokeStyle = P.trim; ctx.beginPath(); ctx.moveTo(w * .5, 5); ctx.lineTo(w * .44, h * .52); ctx.lineTo(w * .5, h - 5); ctx.stroke();
    } else if (name === 'spring-mushroom') {
        box(ctx, 2, 2, w - 4, h - 3, P.walnut, 9); box(ctx, 4, 2, w - 8, h * .45, '#936853', 7);
        for (let i = 0; i < 3; i++) circle(ctx, 9 + i * 9, 10 + i % 2 * 4, 2.5, P.trim);
        ctx.strokeStyle = P.brass; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(9, h * .5); for (let i = 0; i < 5; i++) ctx.lineTo(i % 2 ? 11 : w - 11, h * .5 + i * h * .09); ctx.stroke();
    } else if (name === 'flying-cassette') {
        box(ctx, 1, 1, w - 2, h - 2, P.upholstery, 5); box(ctx, 5, 5, w - 10, h - 10, P.trim, 3);
        circle(ctx, w * .30, h / 2, 5, P.walnut); circle(ctx, w * .70, h / 2, 5, P.walnut);
        ctx.fillStyle = P.brass; ctx.fillRect(w * .3, h / 2 - 1, w * .4, 2);
    } else if (name === 'pendulum-eye') {
        box(ctx, 1, 1, w - 2, h - 2, P.brass, 10); ctx.fillStyle = P.trim; ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w * .33, h * .33, 0, 0, Math.PI * 2); ctx.fill(); circle(ctx, w / 2, h / 2, 4, P.upholstery);
    } else {
        box(ctx, 2, 3, w - 4, h - 5, name === 'steam-kettle' ? P.sage : P.oak, 7);
        ctx.strokeStyle = P.brass; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(w * .68, h * .50, h * .22, -Math.PI / 2, Math.PI / 2); ctx.stroke();
        ctx.fillStyle = P.trim; ctx.fillRect(5, 4, w - 10, 3); circle(ctx, w * .47, 4, 3, P.brass);
        ctx.strokeStyle = P.walnut; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(6, h * .45); ctx.lineTo(w - 6, h * .7); ctx.stroke();
    }
    ctx.fillStyle = o.type === 'bird' ? '#dcebd4' : '#ebbe73';
    ctx.beginPath(); ctx.moveTo(w / 2, -5); ctx.lineTo(w / 2 - 3, -10); ctx.lineTo(w / 2 + 3, -10); ctx.fill();
    ctx.restore();
}
