const PREVIEW_ANIMATIONS = Object.freeze([
    'idle',
    'ready',
    'breathe',
    'walk',
    'run',
    'win',
]);

const PREVIEW_DIRECTIONS = Object.freeze(['e', 'se', 's', 'ne', 'n', 'w', 'sw', 'nw']);

function firstString(values) {
    if (!Array.isArray(values)) return null;
    return values.find((value) => typeof value === 'string' && value.length > 0) ?? null;
}

export function resolvePreviewFrameName(atlas) {
    const animations = atlas?.animations ?? {};

    for (const animationName of PREVIEW_ANIMATIONS) {
        const animation = animations[animationName];
        if (!animation || typeof animation !== 'object') continue;

        for (const direction of PREVIEW_DIRECTIONS) {
            const frameName = firstString(animation.framesByDirection?.[direction]);
            if (frameName) return frameName;
        }

        const frameName = firstString(animation.framesRight)
            ?? firstString(animation.frames)
            ?? firstString(animation.framesLeft);
        if (frameName) return frameName;
    }

    return Object.keys(atlas?.frames ?? {})[0] ?? null;
}

export function resolvePreviewFrame(atlas) {
    const name = resolvePreviewFrameName(atlas);
    if (!name) return null;

    const raw = atlas?.frames?.[name];
    const frame = raw?.frame ?? raw;
    if (!frame || typeof frame !== 'object') return null;

    const x = Number(frame.x);
    const y = Number(frame.y);
    const w = Number(frame.w ?? frame.width);
    const h = Number(frame.h ?? frame.height);

    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
        return null;
    }

    return Object.freeze({ name, x, y, w, h });
}

function resolveUrl(value, baseUrl = globalThis.document?.baseURI) {
    if (!value) return null;
    try {
        return new URL(value, baseUrl).toString();
    } catch {
        return String(value);
    }
}

export default class CharacterPreviewRenderer {
    constructor({ fetchImpl = globalThis.fetch?.bind(globalThis) } = {}) {
        this.fetchImpl = fetchImpl;
        this.atlasPromises = new Map();
        this.imagePromises = new Map();
        this.renderSerial = 0;
    }

    async render(canvas, character) {
        if (!canvas || typeof canvas.getContext !== 'function' || !character) return;

        const renderId = String(++this.renderSerial);
        canvas.dataset.previewRenderId = renderId;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', character.name ?? character.slug ?? 'Character preview');
        this.prepareCanvas(canvas);
        this.clear(canvas);

        try {
            const atlasUrl = resolveUrl(character.atlas_url);
            if (!atlasUrl || !this.fetchImpl) {
                throw new Error('Character preview atlas URL is unavailable.');
            }

            const atlas = await this.loadAtlas(atlasUrl);
            const frame = resolvePreviewFrame(atlas);
            if (!frame) {
                throw new Error('Character preview frame could not be resolved.');
            }

            const declaredImage = atlas?.meta?.image;
            const spriteUrl = declaredImage
                ? resolveUrl(declaredImage, atlasUrl)
                : resolveUrl(character.sprite_url);
            if (!spriteUrl) {
                throw new Error('Character preview sprite URL is unavailable.');
            }

            const image = await this.loadImage(spriteUrl);
            if (canvas.dataset.previewRenderId !== renderId) return;

            this.prepareCanvas(canvas);
            this.drawFrame(canvas, image, frame);
            canvas.dataset.previewState = 'ready';
        } catch (error) {
            if (canvas.dataset.previewRenderId !== renderId) return;
            this.drawFallback(canvas, character);
            canvas.dataset.previewState = 'fallback';
            console.warn('Character card preview could not be rendered.', {
                slug: character.slug,
                error,
            });
        }
    }

    prepareCanvas(canvas) {
        const width = Math.max(1, Math.round(canvas.clientWidth || 128));
        const height = Math.max(1, Math.round(canvas.clientHeight || width));
        const dpr = Math.min(2, Math.max(1, Number(globalThis.devicePixelRatio) || 1));
        const bitmapWidth = Math.round(width * dpr);
        const bitmapHeight = Math.round(height * dpr);

        if (canvas.width !== bitmapWidth) canvas.width = bitmapWidth;
        if (canvas.height !== bitmapHeight) canvas.height = bitmapHeight;
    }

    clear(canvas) {
        const context = canvas.getContext('2d');
        context?.clearRect(0, 0, canvas.width, canvas.height);
    }

    drawFrame(canvas, image, frame) {
        const context = canvas.getContext('2d');
        if (!context) return;

        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, canvas.width, canvas.height);

        // Preserve the square cell contract and leave a tiny optical inset so
        // hair, wings, and companions never touch the card border.
        const inset = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) * 0.035));
        const targetWidth = canvas.width - inset * 2;
        const targetHeight = canvas.height - inset * 2;
        const scale = Math.min(targetWidth / frame.w, targetHeight / frame.h);
        const drawWidth = Math.max(1, Math.round(frame.w * scale));
        const drawHeight = Math.max(1, Math.round(frame.h * scale));
        const dx = Math.round((canvas.width - drawWidth) / 2);
        const dy = Math.round((canvas.height - drawHeight) / 2);

        context.drawImage(
            image,
            frame.x,
            frame.y,
            frame.w,
            frame.h,
            dx,
            dy,
            drawWidth,
            drawHeight
        );
    }

    drawFallback(canvas, character) {
        const context = canvas.getContext('2d');
        if (!context) return;

        context.clearRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = false;
        context.fillStyle = 'rgba(9, 9, 11, 0.82)';
        context.fillRect(0, 0, canvas.width, canvas.height);

        const label = String(character.slug ?? character.name ?? '?')
            .trim()
            .slice(0, 2)
            .toUpperCase();
        context.fillStyle = 'rgba(165, 243, 252, 0.9)';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = `900 ${Math.max(12, Math.round(canvas.height * 0.18))}px ui-monospace, monospace`;
        context.fillText(label || '?', canvas.width / 2, canvas.height / 2);
    }

    loadAtlas(url) {
        let pending = this.atlasPromises.get(url);
        if (!pending) {
            pending = this.fetchImpl(url, {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
            }).then((response) => {
                if (!response.ok) {
                    throw new Error(`Preview atlas load failed (${response.status}).`);
                }
                return response.json();
            }).catch((error) => {
                this.atlasPromises.delete(url);
                throw error;
            });
            this.atlasPromises.set(url, pending);
        }
        return pending;
    }

    loadImage(url) {
        let pending = this.imagePromises.get(url);
        if (!pending) {
            pending = new Promise((resolve, reject) => {
                const image = new Image();
                image.decoding = 'async';
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error(`Preview sprite load failed (${url}).`));
                image.src = url;
            }).catch((error) => {
                this.imagePromises.delete(url);
                throw error;
            });
            this.imagePromises.set(url, pending);
        }
        return pending;
    }
}
