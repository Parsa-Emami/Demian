import contract from '../../game/character-visual-standard-v2.json' with { type: 'json' };

export const PORTRAIT_STANDARD = Object.freeze({ ...contract.portrait });
export const PORTRAIT_LANDMARKS = Object.freeze(Object.fromEntries(
    Object.entries(contract.characters).map(([slug, record]) => [slug, Object.freeze([...record.landmarks])])
));

export function resolvePortraitFrame(slug, width, height) {
    const marks = Object.hasOwn(PORTRAIT_LANDMARKS, slug) ? PORTRAIT_LANDMARKS[slug] : null;
    if (!marks || !Number.isFinite(width) || width <= 0 || width !== height) return null;
    const [eyeX, eyeY, chin, left, top, right] = marks;
    const c = PORTRAIT_STANDARD;
    const side = Math.ceil(Math.max(
        c.minCrop,
        (chin - eyeY) / c.eyeToChin,
        (eyeY - top) / (c.eyeY - c.safeInset),
        (eyeX - left) / (c.eyeX - c.safeInset),
        (right - eyeX) / (1 - c.eyeX - c.safeInset),
    ));
    const x = Math.round(eyeX - side * c.eyeX);
    const y = Math.round(eyeY - side * c.eyeY);
    if (x < 0 || y < 0 || x + side > c.referenceSize || y + side > c.referenceSize) return null;
    const scale = width / c.referenceSize;
    return Object.freeze({ x: x * scale, y: y * scale, w: side * scale, h: side * scale });
}
