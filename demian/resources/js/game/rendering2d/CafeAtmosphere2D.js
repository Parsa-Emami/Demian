import { CAFE_MATERIALS as M } from './CafeWalkthroughPalette.js';
import { CAFE_BOUNDS, HIDE_LIGHT_ZONES } from '../shared/cafe/CafeReferenceLayout.js';

// Pure, decorative-only 2D rendering. No access to gameplay state, input,
// physics, random server seeds, scores, user identity or persistence.
export const CAFE_VISUAL_PROFILES = Object.freeze({
    performance: Object.freeze({ glowSources: 0, dust: 0, shadowPasses: 1 }),
    balanced: Object.freeze({ glowSources: 2, dust: 6, shadowPasses: 2 }),
    high: Object.freeze({ glowSources: 3, dust: 12, shadowPasses: 2 }),
});

export const CAFE_LIGHTING = Object.freeze({
    day: Object.freeze({ wash: 'rgba(248,222,174,.035)', lamp: 'rgba(255,208,146,.17)' }),
    night: Object.freeze({ wash: 'rgba(19,30,41,.17)', lamp: 'rgba(255,204,136,.29)' }),
});

export function cafeVisualProfile(quality = 'balanced', reducedMotion = false) {
    const profile = CAFE_VISUAL_PROFILES[quality] ?? CAFE_VISUAL_PROFILES.balanced;
    return reducedMotion ? { ...profile, dust: 0 } : profile;
}

/** The floorplan and all collision objects use exactly the same world projection. */
export function cafeObjectScreenRect(camera, object) {
    if (!Number.isFinite(object?.position?.x) || !Number.isFinite(object?.position?.z)
        || !Number.isFinite(object?.halfExtents?.x) || !Number.isFinite(object?.halfExtents?.z)
        || object.halfExtents.x <= 0 || object.halfExtents.z <= 0) return null;
    const rect = camera.worldRect(object.position, object.halfExtents);
    return Object.values(rect).every(Number.isFinite) && rect.width > 0 && rect.height > 0 ? rect : null;
}

/**
 * Clip atmospheric wash and real-plan light anchors to the baked FBX footprint.
 * Lamps are derived from actual named café light zones, never arbitrary props
 * drawn over walkable floor. Canvas state is balanced on every exit path.
 */
export function drawCafeLightfield(ctx, camera, {
    atmosphere = 'day', quality = 'balanced', reducedMotion = false,
} = {}) {
    const width = camera.viewportWidth, height = camera.viewportHeight;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0;
    const profile = cafeVisualProfile(quality, reducedMotion);
    const theme = CAFE_LIGHTING[atmosphere] ?? CAFE_LIGHTING.day;
    const room = cafeObjectScreenRect(camera, {
        position: { x: (CAFE_BOUNDS.minX + CAFE_BOUNDS.maxX) / 2,
            z: (CAFE_BOUNDS.minZ + CAFE_BOUNDS.maxZ) / 2 },
        halfExtents: { x: (CAFE_BOUNDS.maxX - CAFE_BOUNDS.minX) / 2,
            z: (CAFE_BOUNDS.maxZ - CAFE_BOUNDS.minZ) / 2 },
    });
    if (!room) return 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(room.x, room.y, room.width, room.height);
    ctx.clip();
    ctx.fillStyle = theme.wash;
    ctx.fillRect(room.x, room.y, room.width, room.height);
    let sources = 0;
    // On low-end devices draw only the flat, stable lighting wash.
    if (profile.glowSources) for (const zone of HIDE_LIGHT_ZONES) {
        if (sources >= profile.glowSources) break;
        const point = camera.worldToScreen(zone.position);
        const radius = Math.min(200, Math.max(3, zone.radius * camera.pixelsPerUnit * .66));
        if (![point.x, point.y, radius].every(Number.isFinite)
            || point.x < -radius || point.y < -radius
            || point.x > width + radius || point.y > height + radius) continue;
        const grad = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
        grad.addColorStop(0, theme.lamp);
        grad.addColorStop(1, 'rgba(255,204,136,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
        sources++;
    }
    ctx.restore();
    return sources;
}

const fract = value => value - Math.floor(value);
const sample = (i, salt) => fract(Math.sin(i * 91.43 + salt * 73.11) * 43758.5453);

/** Cosmetic parallax/dust at camera-relative coordinates; never an obstacle. */
export function drawCafeAmbientMotes(ctx, camera, {
    time = 0, quality = 'balanced', reducedMotion = false, atmosphere = 'day',
} = {}) {
    const profile = cafeVisualProfile(quality, reducedMotion);
    const count = profile.dust;
    if (!count || !Number.isFinite(camera.viewportWidth)
        || !Number.isFinite(camera.viewportHeight)
        || camera.viewportWidth <= 0 || camera.viewportHeight <= 0) return 0;
    const w = camera.viewportWidth, h = camera.viewportHeight;
    const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
    const px = Number.isFinite(camera.position?.x) ? camera.position.x : 0;
    const pz = Number.isFinite(camera.position?.z) ? camera.position.z : 0;
    ctx.save();
    ctx.fillStyle = atmosphere === 'night' ? 'rgba(255,224,162,.23)' : 'rgba(255,238,203,.18)';
    for (let i = 0; i < count; i++) {
        const offset = (safeTime * (2 + (i % 3)) * .35);
        // World-relative drift supplies mild parallax without painting false
        // furniture or landmarks. Wrap fully within the viewport.
        const x = ((sample(i, 1) * w - px * .08 + offset) % w + w) % w;
        const y = ((sample(i, 2) * h - pz * .045 - offset * .38) % h + h) % h;
        const r = i % 4 === 0 ? 2 : 1;
        ctx.fillRect(Math.round(x), Math.round(y), r, r);
    }
    ctx.restore();
    return count;
}

export function drawCafeGroundShadow(ctx, {
    x, y, bodyWidth, bodyHeight, elevation = 0, quality = 'balanced',
} = {}) {
    if (![x,y,bodyWidth,bodyHeight,elevation].every(Number.isFinite)
        || bodyWidth <= 0 || bodyHeight <= 0) return false;
    const lift = Math.min(1, Math.max(0, elevation) / 3.2);
    const width = Math.max(3, Math.min(250, bodyWidth * (1 - .28 * lift)));
    const depth = Math.max(1.5, Math.min(25, bodyHeight * .055));
    const profile = cafeVisualProfile(quality);
    ctx.save();
    ctx.fillStyle = `rgba(20,14,12,${(.18 * (1 - .65 * lift)).toFixed(4)})`;
    ctx.beginPath();
    ctx.ellipse(x, y + 1, width * .58, depth * .70, 0, 0, Math.PI * 2);
    ctx.fill();
    if (profile.shadowPasses > 1) {
        ctx.fillStyle = `rgba(20,14,12,${(.25 * (1 - .90 * lift)).toFixed(4)})`;
        ctx.beginPath();
        ctx.ellipse(x, y + 1, width * .38, depth * .32, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
    return true;
}
