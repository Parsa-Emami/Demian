/** Bounded Canvas presentation; no images, timers or particles allocated per frame. */
export function drawCharacterAbility(ctx, metrics, state, reducedMotion = false) {
    const effect = state?.ability?.effect;
    const focusAura = effect === 'focus-aura';
    const meowMode = effect === 'meow-mode';
    if (!focusAura && !meowMode && effect !== 'smile-bloom') return;
    const progress = Math.min(1, Math.max(0, state.progress));
    const alpha = Math.min(1, progress * 8) * Math.min(1, (1 - progress) * 4);
    const size = metrics.bodyHeight;
    const still = (focusAura || meowMode) && reducedMotion;
    const count = still ? 4 : Math.min(18, Math.max(4, Number(state.ability.particleCount) || 14));
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(metrics.anchorX, metrics.anchorY - size * .58);
    for (let i = 0; i < count; i += 1) {
        const angle = i * Math.PI * 2 / count + (still ? 0 : state.elapsed * .9);
        const radius = size * (still ? .45 : .28 + progress * .44);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * .65 - (still ? 0 : progress * size * .28);
        const unit = Math.max(1.5, size * (.027 + (i % 3) * .006));
        ctx.save();
        ctx.translate(x, y);
        if (!still) ctx.rotate(Math.sin(i + state.elapsed * 2) * .35);
        if (focusAura) {
            ctx.fillStyle = i % 3 === 0 ? '#ffe2a1' : '#d8a4fa';
            ctx.beginPath();
            ctx.moveTo(0, -unit * 1.8);
            ctx.lineTo(unit, 0);
            ctx.lineTo(0, unit * 1.8);
            ctx.lineTo(-unit, 0);
            ctx.closePath();
            ctx.fill();
        } else if (meowMode) {
            ctx.fillStyle = i % 2 ? '#ff78be' : '#ffc549';
            ctx.beginPath();
            ctx.ellipse(0, unit * .45, unit, unit * .75, 0, 0, Math.PI * 2);
            for (let toe = 0; toe < 4; toe += 1) {
                const angle = (toe + 1) * Math.PI / 5;
                const toeX = Math.cos(angle) * unit * 1.45;
                const toeY = -Math.sin(angle) * unit * 1.25;
                ctx.moveTo(toeX + unit * .34, toeY);
                ctx.arc(toeX, toeY, unit * .34, 0, Math.PI * 2);
            }
            ctx.fill();
        } else if (i % 3 === 0) {
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
