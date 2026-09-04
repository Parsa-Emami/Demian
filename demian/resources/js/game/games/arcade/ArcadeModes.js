import { PIXEL_PALETTE as P } from '../../rendering2d/PixelPalette.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const dist = (a, b) => Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.z ?? 0) - (b.z ?? 0));

function worldRect(camera, x, z, w, h) {
    const a = camera.worldToScreen({ x: x - w / 2, z: z - h / 2 });
    const b = camera.worldToScreen({ x: x + w / 2, z: z + h / 2 });
    return { x: a.x, y: a.y, w: Math.max(1, b.x - a.x), h: Math.max(1, b.y - a.y) };
}

function fillWorldRect(ctx, camera, x, z, w, h, color, stroke = null) {
    const r = worldRect(camera, x, z, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x + .5, r.y + .5, Math.max(1, r.w - 1), Math.max(1, r.h - 1));
    }
}

function label(ctx, camera, text, x, z, color = P.white, size = 9) {
    const p = camera.worldToScreen({ x, z });
    ctx.font = `700 ${size}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#050816';
    ctx.fillText(text, p.x + 1, p.y + 1);
    ctx.fillStyle = color;
    ctx.fillText(text, p.x, p.y);
}

function setMovementActor(game, { x, z, vx = 0, vz = 0, airborne = false, jumpVelocity = 0, motionState = null }) {
    const actor = game.player;
    actor.position.x = x;
    actor.position.z = z;
    actor.velocity.x = vx;
    actor.velocity.z = vz;
    actor.forward.x = Math.abs(vx) > 0.01 ? Math.sign(vx) : actor.forward.x;
    actor.forward.z = Math.abs(vz) > 0.01 ? Math.sign(vz) : 0;
    actor.speed = Math.hypot(vx, vz);
    actor.airborne = airborne;
    actor.grounded = !airborne;
    actor.jumpVelocity = jumpVelocity;
    actor.motionState = motionState;
}

function collideCircleRect(point, radius, rect) {
    const dx = Math.max(Math.abs(point.x - rect.x) - rect.w / 2, 0);
    const dz = Math.max(Math.abs(point.z - rect.z) - rect.h / 2, 0);
    return dx * dx + dz * dz < radius * radius;
}

const neonRun = {
    reset(game) {
        game.modeState = { spawn: .6, speed: 7.4, jump: 0, dash: 0, obstacles: [], meters: 0, hitFlash: 0 };
        setMovementActor(game, { x: -10, z: 4.2, vx: 6.5, vz: 0 });
    },
    fixedUpdate(game, dt, input) {
        const s = game.modeState;
        s.speed = Math.min(13, s.speed + dt * .06);
        s.meters += s.speed * dt;
        s.spawn -= dt;
        s.jump = Math.max(0, s.jump - dt);
        s.dash = Math.max(0, s.dash - dt);
        s.hitFlash = Math.max(0, s.hitFlash - dt);
        if (input.jump && s.jump <= 0) s.jump = .78;
        if (input.dash && s.dash <= 0) { s.dash = .46; game.bumpCombo(1); }
        if (s.spawn <= 0) {
            s.spawn = game.randomRange(.62, 1.1);
            s.obstacles.push({ x: 17, z: 4.5, w: game.randomRange(.9, 1.45), h: game.randomRange(1.1, 2.0), passed: false });
        }
        s.obstacles.forEach((o) => { o.x -= s.speed * dt; });
        for (const o of s.obstacles) {
            if (!o.passed && o.x < game.player.position.x) {
                o.passed = true; game.addScore(80 * game.session.combo); game.bumpCombo(1);
            }
            const jumping = s.jump > .18;
            if (!o.hit && !jumping && s.dash <= 0 && Math.abs(o.x - game.player.position.x) < (o.w + 1.2) * .5) {
                o.hit = true; s.hitFlash = .25; game.damage('مانع خوردی!');
            }
        }
        s.obstacles = s.obstacles.filter((o) => o.x > -18);
        const jumpProgress = s.jump > 0 ? 1 - s.jump / .78 : 0;
        const jumpVelocity = s.jump > 0 ? Math.cos(jumpProgress * Math.PI) * 7 : 0;
        setMovementActor(game, { x: -10, z: 4.2, vx: s.speed, airborne: s.jump > 0, jumpVelocity, motionState: s.dash > 0 ? 'dash' : null });
        game.addScore(dt * 10);
        game.session.status = `${Math.floor(s.meters)}m · سرعت ${s.speed.toFixed(1)}`;
    },
    draw(game, ctx, camera) {
        const s = game.modeState;
        fillWorldRect(ctx, camera, 0, 5.6, 34, 1.2, '#171f38', P.pink);
        for (let x = -16; x < 16; x += 2.2) fillWorldRect(ctx, camera, x - (s.meters % 2.2), 5.6, 1.1, .08, '#f0b04d');
        s.obstacles.forEach((o) => {
            fillWorldRect(ctx, camera, o.x, o.z, o.w, o.h, o.hit ? '#4b263c' : '#f05a88', '#ffd166');
            fillWorldRect(ctx, camera, o.x, o.z - o.h * .22, o.w * .5, .16, '#ffd166');
        });
        label(ctx, camera, 'NEON TRACK', 0, -7.4, P.gold, 11);
        if (s.hitFlash > 0) {
            ctx.fillStyle = 'rgba(240,82,82,.18)';
            ctx.fillRect(0, 0, game.context.renderer.logicalWidth, game.context.renderer.logicalHeight);
        }
    },
};

const starCatcher = {
    reset(game) {
        game.modeState = { spawn: .2, items: [], streak: 0 };
        setMovementActor(game, { x: 0, z: 5.5 });
    },
    fixedUpdate(game, dt, input) {
        const s = game.modeState;
        const speed = input.run ? 10.5 : 7.2;
        const vx = (Number(input.x) || 0) * speed;
        const x = clamp(game.player.position.x + vx * dt, -13.7, 13.7);
        setMovementActor(game, { x, z: 5.5, vx });
        if (input.dash) { setMovementActor(game, { x, z: 5.5, vx, motionState: 'dash' }); }
        s.spawn -= dt;
        if (s.spawn <= 0) {
            s.spawn = game.randomRange(.22, .48);
            const bomb = game.random() < .22;
            s.items.push({ x: game.randomRange(-13, 13), z: -9.5, vy: game.randomRange(5.2, 8.4), type: bomb ? 'bomb' : 'star', spin: 0 });
        }
        for (const item of s.items) {
            item.z += item.vy * dt; item.spin += dt * 8;
            if (!item.done && dist(item, game.player.position) < 1.35) {
                item.done = true;
                if (item.type === 'star') { game.addScore(125 * game.session.combo); game.bumpCombo(1); s.streak += 1; }
                else { game.damage('BOMB! ستاره‌ها را بگیر، بمب‌ها را نه.'); s.streak = 0; }
            }
            if (!item.done && item.z > 8.8) {
                item.done = true;
                if (item.type === 'star') game.resetCombo();
            }
        }
        s.items = s.items.filter((i) => !i.done);
        game.session.status = `STREAK ${s.streak} · فقط ستاره‌های طلایی`;
    },
    draw(game, ctx, camera) {
        fillWorldRect(ctx, camera, 0, 6.4, 31, .8, '#16213d', P.cyan);
        game.modeState.items.forEach((item) => {
            const p = camera.worldToScreen(item);
            if (item.type === 'star') {
                ctx.fillStyle = P.gold; ctx.fillRect(p.x - 3, p.y, 7, 1); ctx.fillRect(p.x, p.y - 3, 1, 7);
                ctx.fillStyle = P.white; ctx.fillRect(p.x, p.y, 1, 1);
            } else {
                ctx.fillStyle = P.red; ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
                ctx.fillStyle = '#111827'; ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
            }
        });
        label(ctx, camera, 'STAR CATCHER', 0, -7.4, P.pink, 11);
    },
};

const cafeDrift = {
    reset(game) {
        game.modeState = { spawn: .45, hazards: [], roadOffset: 0, nearMisses: 0 };
        setMovementActor(game, { x: 0, z: 4.8 });
    },
    fixedUpdate(game, dt, input) {
        const s = game.modeState;
        const vx = (Number(input.x) || 0) * 7.8;
        const vz = (Number(input.z) || 0) * 5.8;
        const x = clamp(game.player.position.x + vx * dt, -9.2, 9.2);
        const z = clamp(game.player.position.z + vz * dt, -5.5, 6.2);
        setMovementActor(game, { x, z, vx, vz, motionState: input.dash ? 'dodge' : null });
        s.roadOffset += dt * 10;
        s.spawn -= dt;
        if (s.spawn <= 0) {
            s.spawn = game.randomRange(.42, .76);
            s.hazards.push({ x: game.randomRange(-8.6, 8.6), z: -10, w: game.randomRange(1.3, 2.2), h: game.randomRange(1.0, 1.8), speed: game.randomRange(6.4, 10.4), checked: false });
        }
        for (const h of s.hazards) {
            h.z += h.speed * dt;
            if (!h.hit && collideCircleRect(game.player.position, .75, h)) { h.hit = true; game.damage('برخورد! مسیرت را عوض کن.'); }
            if (!h.checked && h.z > game.player.position.z + 1.1) {
                h.checked = true;
                const dx = Math.abs(h.x - game.player.position.x);
                if (!h.hit && dx < 2.1) { s.nearMisses += 1; game.addScore(160 * game.session.combo); game.bumpCombo(1); }
            }
        }
        s.hazards = s.hazards.filter((h) => h.z < 10);
        game.addScore(dt * 12);
        game.session.status = `NEAR MISS ${s.nearMisses} · بین موانع دریفت کن`;
    },
    draw(game, ctx, camera) {
        fillWorldRect(ctx, camera, 0, .5, 21, 19, '#111c31', '#2c3754');
        for (let lane = -2; lane <= 2; lane += 1) {
            const x = lane * 3.7;
            for (let z = -9; z < 9; z += 3.2) fillWorldRect(ctx, camera, x, z + (game.modeState.roadOffset % 3.2), .08, 1.5, '#f0c765');
        }
        game.modeState.hazards.forEach((h, index) => {
            fillWorldRect(ctx, camera, h.x, h.z, h.w, h.h, h.hit ? '#593047' : (index % 2 ? '#43e6e9' : '#ff6fb5'), '#ffd166');
        });
        label(ctx, camera, 'CAFE DRIFT', 0, -7.8, P.gold, 11);
    },
};

const MAZE_WALLS = Object.freeze([
    { x: -12, z: -5, w: 1, h: 8 }, { x: -7, z: 1, w: 1, h: 10 },
    { x: -2, z: -4, w: 1, h: 9 }, { x: 3, z: 2, w: 1, h: 10 },
    { x: 8, z: -3, w: 1, h: 9 }, { x: 12, z: 3, w: 1, h: 8 },
    { x: -9.5, z: -1.5, w: 4, h: 1 }, { x: -4.5, z: 5.5, w: 4, h: 1 },
    { x: .5, z: -7, w: 4, h: 1 }, { x: 5.5, z: 6, w: 4, h: 1 },
    { x: 10, z: 1, w: 3, h: 1 },
]);

const shadowMaze = {
    reset(game) {
        const keys = [
            { x: -14, z: -7 }, { x: -9, z: 7 }, { x: -4, z: -1 }, { x: 5, z: -6 }, { x: 13, z: 7 },
        ].map((k, i) => ({ ...k, id: i, got: false }));
        game.modeState = { keys, ghosts: [{ x: -5, z: -6, vx: 3.1 }, { x: 7, z: 5, vx: -2.7 }], collected: 0, exit: { x: 14, z: -7 } };
        setMovementActor(game, { x: -14, z: 7 });
    },
    fixedUpdate(game, dt, input) {
        const s = game.modeState;
        const speed = input.run ? 7.1 : 5.1;
        const vx = (Number(input.x) || 0) * speed;
        const vz = (Number(input.z) || 0) * speed;
        const next = { x: clamp(game.player.position.x + vx * dt, -14.6, 14.6), z: clamp(game.player.position.z + vz * dt, -7.6, 7.6) };
        const blocked = MAZE_WALLS.some((wall) => collideCircleRect(next, .58, wall));
        if (!blocked) setMovementActor(game, { x: next.x, z: next.z, vx, vz, motionState: input.dash ? 'dodge' : null });
        else setMovementActor(game, { x: game.player.position.x, z: game.player.position.z });
        s.keys.forEach((key) => {
            if (!key.got && dist(key, game.player.position) < 1.0) { key.got = true; s.collected += 1; game.addScore(300 * game.session.combo); game.bumpCombo(1); }
        });
        s.ghosts.forEach((g, index) => {
            g.x += g.vx * dt;
            if (g.x < -14 || g.x > 14) g.vx *= -1;
            g.z += Math.sin(game.session.elapsed * 1.4 + index) * dt * .8;
            if (!g.cooldown && dist(g, game.player.position) < 1.1) { g.cooldown = .9; game.damage('سایه لمس‌ات کرد!'); }
            g.cooldown = Math.max(0, (g.cooldown ?? 0) - dt);
        });
        const open = s.collected === s.keys.length;
        if (open && dist(s.exit, game.player.position) < 1.25) game.finish(true, 'MAZE CLEARED');
        game.session.status = `KEYS ${s.collected}/${s.keys.length} · ${open ? 'EXIT OPEN' : 'کلیدها را پیدا کن'}`;
    },
    draw(game, ctx, camera) {
        fillWorldRect(ctx, camera, 0, 0, 31, 17, '#0d1830', '#4c3768');
        MAZE_WALLS.forEach((wall) => fillWorldRect(ctx, camera, wall.x, wall.z, wall.w, wall.h, '#31284f', '#ff6fb5'));
        game.modeState.keys.filter((k) => !k.got).forEach((key) => {
            const p = camera.worldToScreen(key); ctx.fillStyle = P.gold; ctx.fillRect(p.x - 3, p.y - 1, 7, 3); ctx.fillRect(p.x + 2, p.y - 4, 2, 7);
        });
        game.modeState.ghosts.forEach((g) => {
            const p = camera.worldToScreen(g); ctx.fillStyle = 'rgba(169,134,255,.78)'; ctx.fillRect(p.x - 5, p.y - 5, 10, 10); ctx.fillStyle = P.white; ctx.fillRect(p.x - 2, p.y - 1, 1, 1); ctx.fillRect(p.x + 2, p.y - 1, 1, 1);
        });
        fillWorldRect(ctx, camera, game.modeState.exit.x, game.modeState.exit.z, 1.5, 1.5, game.modeState.collected === game.modeState.keys.length ? '#52d273' : '#44243b', '#ffd166');
        label(ctx, camera, 'SHADOW MAZE', 0, -8, P.pink, 11);
    },
};

const skyHop = {
    reset(game) {
        const platforms = [];
        for (let i = 0; i < 9; i += 1) platforms.push({ x: (i % 2 ? 5 : -5) + game.randomRange(-2, 2), z: 6 - i * 2.2, w: game.randomRange(3.5, 5.5) });
        platforms[0] = { x: 0, z: 6.5, w: 8 };
        game.modeState = { vy: -7.2, height: 0, platforms, landed: 0, cameraLift: 0 };
        setMovementActor(game, { x: 0, z: 5.4, airborne: true, jumpVelocity: 7 });
    },
    fixedUpdate(game, dt, input) {
        const s = game.modeState;
        const vx = (Number(input.x) || 0) * (input.run ? 8.4 : 6.0);
        const prevZ = game.player.position.z;
        s.vy += 13.4 * dt;
        let x = clamp(game.player.position.x + vx * dt, -14, 14);
        let z = game.player.position.z + s.vy * dt;
        if (z < -2.2) {
            const shift = -2.2 - z;
            z = -2.2;
            s.height += shift * 5;
            s.platforms.forEach((p) => { p.z += shift; });
        }
        if (s.vy > 0) {
            for (const p of s.platforms) {
                const crossed = prevZ <= p.z - .7 && z >= p.z - .7;
                if (crossed && Math.abs(x - p.x) <= p.w / 2 + .45) {
                    z = p.z - .9; s.vy = input.jump ? -9.1 : -7.5; s.landed += 1; game.addScore(140 * game.session.combo); game.bumpCombo(1); break;
                }
            }
        }
        if (z > 9.2) { game.damage('افتادی!'); x = 0; z = 4.5; s.vy = -8.2; game.resetCombo(); }
        while (s.platforms.some((p) => p.z > 8.5)) {
            const p = s.platforms.find((entry) => entry.z > 8.5); p.z -= 19.5; p.x = game.randomRange(-10, 10); p.w = game.randomRange(3.5, 5.5);
        }
        setMovementActor(game, { x, z, vx, vz: s.vy, airborne: true, jumpVelocity: -s.vy });
        game.addScore(Math.max(0, -s.vy) * dt * 2);
        game.session.status = `HEIGHT ${Math.floor(s.height)}m · LAND ${s.landed}`;
        if (s.height >= 100) game.finish(true, '100M SKY CLEAR');
    },
    draw(game, ctx, camera) {
        game.modeState.platforms.forEach((p, index) => fillWorldRect(ctx, camera, p.x, p.z, p.w, .55, index % 2 ? '#ff6fb5' : '#43e6e9', '#ffd166'));
        label(ctx, camera, 'SKY HOP · 100M', 0, -8, P.gold, 11);
    },
};

const rhythmRush = {
    reset(game) {
        game.modeState = { notes: [], beat: .25, bpm: 116, hits: 0, misses: 0, pulse: 0, lastAction: null };
        setMovementActor(game, { x: 0, z: 5.6 });
    },
    fixedUpdate(game, dt, input) {
        const s = game.modeState;
        const beatDuration = 60 / s.bpm;
        s.beat -= dt; s.pulse = Math.max(0, s.pulse - dt * 4);
        if (s.beat <= 0) {
            s.beat += beatDuration;
            if (game.random() < .88) s.notes.push({ lane: Math.floor(game.random() * 3), z: -9, hit: false, missed: false });
        }
        s.notes.forEach((note) => { note.z += 7.2 * dt; });
        const actions = [input.jump, input.interact, input.dash];
        actions.forEach((pressed, lane) => {
            if (!pressed) return;
            const candidates = s.notes.filter((n) => !n.hit && !n.missed && n.lane === lane).sort((a, b) => Math.abs(a.z - 3.7) - Math.abs(b.z - 3.7));
            const note = candidates[0];
            if (note && Math.abs(note.z - 3.7) < 1.4) {
                const accuracy = 1 - Math.min(1, Math.abs(note.z - 3.7) / 1.4);
                note.hit = true; s.hits += 1; s.pulse = 1; game.addScore(Math.round((100 + accuracy * 150) * game.session.combo)); game.bumpCombo(1);
                s.lastAction = lane === 0 ? 'jump' : lane === 1 ? 'wave' : 'dash';
            } else { game.resetCombo(); }
        });
        s.notes.forEach((note) => {
            if (!note.hit && !note.missed && note.z > 5.5) { note.missed = true; s.misses += 1; game.resetCombo(); }
        });
        s.notes = s.notes.filter((n) => n.z < 9 && !n.hit);
        setMovementActor(game, { x: 0, z: 5.6, motionState: s.lastAction });
        s.lastAction = null;
        game.session.status = `HIT ${s.hits} · MISS ${s.misses} · BPM ${s.bpm}`;
    },
    draw(game, ctx, camera) {
        const lanes = [-7, 0, 7];
        lanes.forEach((x, i) => {
            fillWorldRect(ctx, camera, x, 0, 5.7, 17, i === 1 ? '#101c38' : '#0d1730', i === 1 ? '#ff6fb5' : '#43e6e9');
            label(ctx, camera, ['JUMP', 'USE', 'DASH'][i], x, 7.4, i === 1 ? P.pink : P.cyan, 8);
        });
        fillWorldRect(ctx, camera, 0, 3.7, 31, .12, game.modeState.pulse > 0 ? '#fff4d6' : '#ffd166');
        game.modeState.notes.forEach((note) => {
            const x = lanes[note.lane]; fillWorldRect(ctx, camera, x, note.z, 2.4, .72, note.lane === 1 ? '#ff6fb5' : note.lane === 0 ? '#43e6e9' : '#a986ff', '#ffd166');
        });
        label(ctx, camera, 'RHYTHM RUSH', 0, -8, P.gold, 11);
    },
};

const MODES = Object.freeze({
    'neon-run': neonRun,
    'star-catcher': starCatcher,
    'cafe-drift': cafeDrift,
    'shadow-maze': shadowMaze,
    'sky-hop': skyHop,
    'rhythm-rush': rhythmRush,
});

export function arcadeMode(id) {
    const mode = MODES[id];
    if (!mode) throw new Error(`Unknown arcade mode: ${id}`);
    return mode;
}
