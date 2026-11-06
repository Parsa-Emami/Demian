const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export function line(ctx, a, b, width, color) {
    ctx.lineWidth = width; ctx.strokeStyle = color;
    ctx.beginPath(); ctx.moveTo(a.x, -a.y); ctx.lineTo(b.x, -b.y); ctx.stroke();
}
function outline(ctx, a, b, c, width) {
    ctx.strokeStyle = '#171d24'; ctx.lineWidth = width + .008;
    ctx.beginPath(); ctx.moveTo(a.x, -a.y); ctx.lineTo(b.x, -b.y); ctx.lineTo(c.x, -c.y); ctx.stroke();
}
function limb(ctx, a, b, width, color, { material, layer, skin = false } = {}) {
    line(ctx, a, b, width, color);
    const texture = material?.view[layer];
    if (texture) {
        const length = Math.hypot(b.x - a.x, b.y - a.y), angle = Math.atan2(-(b.y - a.y), b.x - a.x);
        ctx.save(); ctx.translate(a.x, -a.y); ctx.rotate(angle);
        ctx.beginPath(); ctx.roundRect(-width * .5, -width * .5, length + width, width, width * .5); ctx.clip();
        ctx.translate(-width * .5, width * .5); ctx.rotate(-Math.PI / 2);
        ctx.drawImage(material.image, ...texture.frame, 0, 0, width, length + width);
        ctx.restore();
    }
    const gradient = ctx.createLinearGradient(a.x - width * .55, -a.y, b.x + width * .55, -b.y);
    gradient.addColorStop(0, '#ffffff25'); gradient.addColorStop(.35, '#ffffff0b');
    gradient.addColorStop(.7, '#00000006'); gradient.addColorStop(1, '#030b1b50');
    line(ctx, a, b, width, gradient);
    if (!skin) {
        const middle = mix(a, b, .78);
        line(ctx, { x: middle.x - width * .24, y: middle.y + .004 }, { x: middle.x + width * .19, y: middle.y - .01 }, .004, '#ffffff20');
    }
}
function shoe(ctx, ankle, look, horizontal, material, side) {
    const x = ankle.x, y = -ankle.y, width = look.dress ? .091 : .128;
    ctx.fillStyle = '#171b22'; ctx.beginPath(); ctx.roundRect(x - width * .48 + horizontal * .015, y - .044, width, .044, .017); ctx.fill();
    ctx.fillStyle = look.sole; ctx.beginPath(); ctx.roundRect(x - width * .48 + horizontal * .015, y - .013, width, .013, .005); ctx.fill();
    const texture = material?.view[side === 'Near' ? 'shoeLeft' : 'shoeRight'];
    if (texture) {
        ctx.save(); ctx.beginPath(); ctx.roundRect(x - width * .48 + horizontal * .015, y - .044, width, .044, .017); ctx.clip();
        ctx.drawImage(material.image, ...texture.frame, x - width * .48 + horizontal * .015, y - .05, width, .05); ctx.restore();
    }
    line(ctx, { x: x - .025, y: ankle.y + .029 }, { x: x + .015, y: ankle.y + .029 }, .005, '#ece2cb70');
}
export function drawArm(ctx, joints, side, look, material) {
    const shoulder = joints[`shoulder${side}`], elbow = joints[`elbow${side}`], wrist = joints[`wrist${side}`];
    outline(ctx, shoulder, elbow, wrist, .066);
    limb(ctx, shoulder, elbow, .074, look.shirt, { material, layer: 'fabricSleeve' });
    const sleeve = Math.max(0, (look.sleeve - .5) * 2), cuff = mix(elbow, wrist, sleeve);
    if (sleeve < 1) limb(ctx, cuff, wrist, .048, look.skin, { skin: true });
    if (sleeve > 0) limb(ctx, elbow, cuff, .068, look.shirt, { material, layer: 'fabricSleeve' });
    ctx.fillStyle = look.skin; ctx.beginPath(); ctx.ellipse(wrist.x, -wrist.y, .025, .029, 0, 0, Math.PI * 2); ctx.fill();
    if (side === 'Far' && (look.watch || look.bracelet)) {
        const point = mix(elbow, wrist, .84);
        line(ctx, { x: point.x - .025, y: point.y }, { x: point.x + .025, y: point.y }, .016, look.watch ?? '#c0a359');
    }
    if (look.tattoo) {
        const point = mix(elbow, wrist, .54);
        line(ctx, { x: point.x - .015, y: point.y + .01 }, { x: point.x + .015, y: point.y - .013 }, .009, '#333a3b');
    }
}
export function drawLeg(ctx, joints, side, look, horizontal, material) {
    const hip = joints[`hip${side}`], knee = joints[`knee${side}`], ankle = joints[`ankle${side}`];
    const width = look.wideLeg ? .12 : .105;
    outline(ctx, hip, knee, { x: ankle.x, y: ankle.y + .035 }, width);
    limb(ctx, hip, knee, width, look.trousers, { material, layer: 'fabricLeg' });
    limb(ctx, knee, { x: ankle.x, y: ankle.y + .035 }, look.shorts ? .062 : width * .94, look.shorts ? look.skin : look.trousers,
        { skin: look.shorts, material: look.shorts ? null : material, layer: 'fabricLeg' });
    shoe(ctx, ankle, look, horizontal, material, side);
}
export function drawTorso(ctx, joints, look, horizontal) {
    const top = joints.chest, hip = joints.pelvis, width = .115 - Math.abs(horizontal) * .017;
    ctx.fillStyle = look.shirt; ctx.strokeStyle = '#1b2028'; ctx.lineWidth = .009;
    ctx.beginPath(); ctx.moveTo(top.x - width, -top.y - .018); ctx.quadraticCurveTo(top.x, -top.y - .047, top.x + width, -top.y - .018);
    ctx.lineTo(hip.x + width * .88, -hip.y + .013); ctx.quadraticCurveTo(hip.x, -hip.y + .027, hip.x - width * .88, -hip.y + .013); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff0c'; ctx.beginPath(); ctx.moveTo(top.x - width * .7, -top.y); ctx.lineTo(hip.x - width * .5, -hip.y); ctx.lineTo(hip.x, -hip.y); ctx.lineTo(top.x, -top.y); ctx.fill();
    if (look.style === 'collar' || look.style === 'blazer') {
        line(ctx, { x: top.x - .035, y: top.y + .01 }, { x: top.x, y: top.y - .032 }, .009, '#ffffff45');
        line(ctx, { x: top.x + .035, y: top.y + .01 }, { x: top.x, y: top.y - .032 }, .009, '#10182090');
    }
    if (look.necklace) { ctx.strokeStyle = '#bd9c59'; ctx.lineWidth = .005; ctx.beginPath(); ctx.arc(top.x, -top.y - .018, .034, 0, Math.PI); ctx.stroke(); }
    if (look.scarf) {
        ctx.fillStyle = '#e7dccc'; ctx.beginPath(); ctx.moveTo(top.x - .055, -top.y - .02); ctx.lineTo(top.x + .07, -top.y - .03); ctx.lineTo(top.x + .05, -top.y + .08); ctx.lineTo(top.x - .02, -top.y + .025); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#bb7f8e'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(top.x + .01 + i * .01, -top.y + .012 + i * .011, .005, 0, Math.PI * 2); ctx.fill(); }
    }
    if (look.belt) line(ctx, { x: hip.x - width * .85, y: hip.y + .013 }, { x: hip.x + width * .85, y: hip.y + .013 }, .016, '#1d2027');
    if (look.tie) {
        ctx.fillStyle = '#7f414b'; ctx.beginPath(); ctx.moveTo(top.x - .015, -top.y + .015); ctx.lineTo(top.x + .018, -top.y + .015); ctx.lineTo(hip.x + .025, -hip.y - .035); ctx.lineTo(hip.x, -hip.y - .015); ctx.closePath(); ctx.fill();
    }
}
