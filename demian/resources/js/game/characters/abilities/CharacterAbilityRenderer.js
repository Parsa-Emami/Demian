/** Bounded Canvas presentation; no images, timers or particles allocated per frame. */
export function drawCharacterAbility(ctx, metrics, state) {
    if (!state || state.ability.effect !== 'smile-bloom') return;
    const progress = Math.min(1, Math.max(0, state.progress));
    const alpha = Math.min(1, progress * 8) * Math.min(1, (1 - progress) * 4);
    const size = metrics.bodyHeight;
    const count = Math.min(18, Math.max(4, Number(state.ability.particleCount) || 14));
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(metrics.anchorX, metrics.anchorY - size * .58);
    for (let i = 0; i < count; i += 1) {
        const angle = i * Math.PI * 2 / count + state.elapsed * .9;
        const radius = size * (.28 + progress * .44);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * .65 - progress * size * .28;
        const unit = Math.max(1.5, size * (.027 + (i % 3) * .006));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(i + state.elapsed * 2) * .35);
        if (i % 3 === 0) {
            ctx.fillStyle = '#f48fba';
            ctx.beginPath();
            ctx.moveTo(0, unit * 1.8);
            ctx.bezierCurveTo(-unit * 3, 0, -unit * 2.1, -unit * 2.2, 0, -unit * .8);
            ctx.bezierCurveTo(unit * 2.1, -unit * 2.2, unit * 3, 0, 0, unit * 1.8);
            ctx.fill();
        } else {
            ctx.fillStyle = i % 2 ? '#ffe077' : '#f7c9e2';
            for (let petal = 0; petal < 5; petal += 1) {
                const a = petal * Math.PI * 2 / 5;
                ctx.beginPath();
                ctx.ellipse(Math.cos(a) * unit, Math.sin(a) * unit, unit * .85, unit * .55, a, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = '#fff7d6';
            ctx.beginPath(); ctx.arc(0, 0, unit * .48, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
    ctx.restore();
}
