/**
 * Portrait framing v1. Coordinates are reviewed against the frontal 224px
 * V14 posters, not the gameplay atlas. Never resize the face non-uniformly.
 * Each tuple: eye centre X/Y, chin Y, head left/top/right (including hair).
 */
export const PORTRAIT_STANDARD = Object.freeze({
    version: 1, referenceSize: 224, eyeX: .5, eyeY: .56,
    eyeToChin: .21, safeInset: .04, minCrop: 72,
});

export const PORTRAIT_LANDMARKS = Object.freeze(Object.fromEntries(
    Object.entries({
        darya:      [112, 106, 124, 60, 52, 161],
        setayesh:   [112, 114, 134, 60, 56, 169],
        uzudi:      [109, 88, 112, 68, 43, 142],
        elaheh:     [113,  99, 122, 62, 47, 158],
        marjan:     [113,  93, 111, 70, 55, 145],
        mohana:     [110,  99, 117, 71, 55, 149],
        zohre:      [112, 100, 118, 73, 57, 149],
        kiana:      [110,  90, 106, 74, 53, 142],
        mobina:     [113,  96, 117, 68, 52, 153],
        negar:      [115, 101, 122, 60, 52, 153],
        dandelox:   [111,  94, 113, 72, 55, 144],
        tiam:       [109, 99, 119, 73, 54, 159],
        amirreza:   [111, 100, 123, 79, 59, 143],
        hanna:      [111, 92, 109, 73, 55, 149],
        ainaz:      [113, 91, 110, 78, 50, 150],
        arsal:      [113, 96, 119, 82, 55, 145],
        sadro:      [112, 96, 116, 75, 50, 149],
        mojtaba:    [112, 100, 123, 79, 56, 146],
        iman:       [112, 101, 126, 76, 55, 146],
        amin:       [112, 104, 129, 78, 61, 145],
        hossein:    [119, 107, 129, 77, 60, 146],
        'taher-db': [111, 99, 124, 79, 53, 151],
        sorkhi:     [113, 93, 116, 79, 45, 148],
        yalda:      [113, 86, 109, 63, 42, 151],
        mori:       [112, 95, 116, 80, 54, 144],
        mahyar:     [111, 90, 111, 85, 53, 139],
    }).map(([slug, landmarks]) => [slug, Object.freeze(landmarks)])
));

/**
 * Return a square crop at the common optical eye anchor. Face scale is
 * based on eye-to-chin distance; large hair is given extra breathing room.
 * Only calibrated square posters are eligible. Unknown or incompatible
 * art is rendered uncropped by the caller rather than guessing a face.
 */
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
