import { UI_LAYER, assignUiLayer } from '../ui/UiLayer.js';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DEFAULT_REFERENCE_HEIGHT = 360;
const MIN_LOGICAL_HEIGHT = 240;
const MAX_LOGICAL_HEIGHT = 480;
const MAX_PRESENT_SCALE = 6;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function finiteScale(value, fallback = 1) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? clamp(numeric, MIN_SCALE, MAX_SCALE) : fallback;
}

function createCanvas() {
    const canvas = document.createElement('canvas');
    canvas.dataset.gameCanvas = '';
    canvas.dataset.renderer = 'pixel-2d';
    canvas.setAttribute('aria-label', 'Demian pixel game canvas');
    assignUiLayer(canvas, UI_LAYER.LOCAL_BASE);
    Object.assign(canvas.style, {
        position: 'absolute', inset: '0', display: 'block', width: '100%', height: '100%',
        minWidth: '1px', minHeight: '1px', imageRendering: 'pixelated',
    });
    return canvas;
}

/**
 * Shared deterministic HTML5 Canvas renderer.
 *
 * V10 uses an integer presentation scale. The game backbuffer is selected so
 * every logical pixel expands to an exact N×N block of physical pixels. That
 * removes uneven nearest-neighbour resampling, keeps character silhouettes
 * stable while moving, and gives the whole project a genuinely crisp 8-bit
 * presentation on both standard and HiDPI displays.
 */
export default class RendererService {
    constructor(container, { referenceHeight = DEFAULT_REFERENCE_HEIGHT, lowLatency = false } = {}) {
        if (!(container instanceof HTMLElement)) throw new Error('Game renderer container was not found.');

        this.container = assignUiLayer(container, UI_LAYER.CANVAS);
        this.canvas = createCanvas();

        // Keep the primary game canvas on the normal compositor path by default.
        // The opt-in low-latency path is retained for controlled environments.
        const contextOptions = lowLatency
            ? { alpha: false, desynchronized: true }
            : { alpha: false };
        this.context2d = this.canvas.getContext('2d', contextOptions)
            ?? this.canvas.getContext('2d');
        if (!this.context2d) throw new Error('Canvas 2D is not available in this browser.');

        const contextAttributes = this.context2d.getContextAttributes?.();
        this.container.dataset.rendererLowLatency = contextAttributes?.desynchronized ? 'on' : 'off';

        this.bufferCanvas = document.createElement('canvas');
        this.bufferContext = this.bufferCanvas.getContext('2d', { alpha: false });
        if (!this.bufferContext) throw new Error('Canvas 2D backbuffer could not be created.');

        this.referenceHeight = clamp(
            Math.round(Number(referenceHeight) || DEFAULT_REFERENCE_HEIGHT),
            MIN_LOGICAL_HEIGHT,
            MAX_LOGICAL_HEIGHT
        );
        this.pixelRatio = 1;
        this.deviceRatio = 1;
        this.presentationScale = 1;
        this.lastWidth = 0;
        this.lastHeight = 0;
        this.logicalWidth = 640;
        this.logicalHeight = this.referenceHeight;
        this.resizeFrame = null;
        this.frameOpen = false;
        this.container.appendChild(this.canvas);

        // Compatibility object consumed by PerformanceProfile. Rendering no
        // longer depends on a Three/WebGL renderer.
        this.renderer = Object.freeze({
            capabilities: Object.freeze({ maxTextureSize: 8192, isWebGL2: false }),
            domElement: this.canvas,
            backend: 'canvas2d',
        });

        this.onObservedResize = this.onObservedResize.bind(this);
        this.resizeObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(this.onObservedResize)
            : null;
        this.resizeObserver?.observe(this.container);
        this.resize();
        this.queueResize();
    }

    dimensions() {
        const rect = this.container.getBoundingClientRect?.();
        const width = Math.round(this.container.clientWidth || rect?.width || 0);
        const height = Math.round(this.container.clientHeight || rect?.height || 0);
        return { width: Math.max(width, 1), height: Math.max(height, 1) };
    }

    logicalDimensions() {
        return {
            width: this.logicalWidth,
            height: this.logicalHeight,
            presentationScale: this.presentationScale,
        };
    }

    choosePixelGrid(physicalWidth, physicalHeight) {
        // Higher quality requests target a denser logical image, but the final
        // presentation scale is always an integer. This creates stable pixels
        // instead of the 1.7×/2.3× nearest-neighbour shimmer common in canvas
        // pixel-art implementations.
        const desiredHeight = clamp(
            Math.round(this.referenceHeight * Math.sqrt(this.pixelRatio)),
            MIN_LOGICAL_HEIGHT,
            MAX_LOGICAL_HEIGHT
        );
        const idealScale = physicalHeight / Math.max(1, desiredHeight);
        const scale = clamp(Math.round(idealScale), 1, MAX_PRESENT_SCALE);
        const logicalWidth = Math.max(1, Math.floor(physicalWidth / scale));
        const logicalHeight = Math.max(1, Math.floor(physicalHeight / scale));

        return { scale, logicalWidth, logicalHeight };
    }

    resize(pixelRatio = this.pixelRatio) {
        this.pixelRatio = finiteScale(pixelRatio, this.pixelRatio);
        const { width, height } = this.dimensions();
        this.lastWidth = width;
        this.lastHeight = height;

        this.deviceRatio = clamp(globalThis.devicePixelRatio || 1, 1, 2);
        const physicalWidth = Math.max(1, Math.round(width * this.deviceRatio));
        const physicalHeight = Math.max(1, Math.round(height * this.deviceRatio));
        const grid = this.choosePixelGrid(physicalWidth, physicalHeight);

        this.presentationScale = grid.scale;
        this.logicalWidth = grid.logicalWidth;
        this.logicalHeight = grid.logicalHeight;
        this.canvas.width = physicalWidth;
        this.canvas.height = physicalHeight;
        this.bufferCanvas.width = this.logicalWidth;
        this.bufferCanvas.height = this.logicalHeight;
        this.configureContext(this.context2d);
        this.configureContext(this.bufferContext);
        this.container.dataset.rendererBackend = 'pixel-2d';
        this.container.dataset.pixelGrid = `${this.logicalWidth}x${this.logicalHeight}@${this.presentationScale}x`;

        return {
            width,
            height,
            logicalWidth: this.logicalWidth,
            logicalHeight: this.logicalHeight,
            presentationScale: this.presentationScale,
        };
    }

    configureContext(context) {
        context.imageSmoothingEnabled = false;
        context.textBaseline = 'middle';
        context.lineJoin = 'miter';
        context.lineCap = 'butt';
    }

    queueResize() {
        if (this.resizeFrame !== null || typeof requestAnimationFrame !== 'function') return;
        this.resizeFrame = requestAnimationFrame(() => {
            this.resizeFrame = null;
            this.resize(this.pixelRatio);
        });
    }

    onObservedResize() { this.queueResize(); }

    ensureSize() {
        const { width, height } = this.dimensions();
        if (width !== this.lastWidth || height !== this.lastHeight) return this.resize(this.pixelRatio);
        return {
            width,
            height,
            logicalWidth: this.logicalWidth,
            logicalHeight: this.logicalHeight,
            presentationScale: this.presentationScale,
        };
    }

    resetState({ clear = false } = {}) {
        const dimensions = this.ensureSize();
        this.frameOpen = false;
        this.bufferContext.setTransform(1, 0, 0, 1, 0, 0);
        this.context2d.setTransform(1, 0, 0, 1, 0, 0);
        this.configureContext(this.bufferContext);
        this.configureContext(this.context2d);
        if (clear) {
            this.bufferContext.fillStyle = '#0b1020';
            this.bufferContext.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
            this.present();
        }
        return dimensions;
    }

    beginFrame(clear = '#0b1020') {
        this.ensureSize();
        const ctx = this.bufferContext;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.configureContext(ctx);
        ctx.fillStyle = clear;
        ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
        this.frameOpen = true;
        return ctx;
    }

    prepareFrame() { return this.beginFrame(); }

    present() {
        const ctx = this.context2d;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const drawWidth = this.logicalWidth * this.presentationScale;
        const drawHeight = this.logicalHeight * this.presentationScale;
        const offsetX = Math.floor((width - drawWidth) / 2);
        const offsetY = Math.floor((height - drawHeight) / 2);

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.configureContext(ctx);
        ctx.fillStyle = '#050816';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(
            this.bufferCanvas,
            0,
            0,
            this.logicalWidth,
            this.logicalHeight,
            offsetX,
            offsetY,
            drawWidth,
            drawHeight
        );
        this.frameOpen = false;
        return true;
    }

    render(drawable, camera) {
        if (!drawable) return false;
        const ctx = this.beginFrame();
        if (typeof drawable === 'function') drawable(ctx, camera, this);
        else if (typeof drawable.renderPixel2D === 'function') drawable.renderPixel2D(ctx, camera, this);
        else return false;
        return this.present();
    }

    dispose() {
        this.resizeObserver?.disconnect();
        if (this.resizeFrame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.resizeFrame);
        this.canvas.remove();
        this.bufferCanvas.width = 1;
        this.bufferCanvas.height = 1;
    }
}
