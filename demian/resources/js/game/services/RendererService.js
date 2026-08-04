import * as THREE from 'three';
import { UI_LAYER, assignUiLayer } from '../ui/UiLayer.js';

const MIN_PIXEL_RATIO = 0.5;
const MAX_PIXEL_RATIO = 2;

function finitePixelRatio(value, fallback = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
    return Math.min(MAX_PIXEL_RATIO, Math.max(MIN_PIXEL_RATIO, numeric));
}

/** Owns the single WebGLRenderer shared by every game. */
export default class RendererService {
    constructor(container) {
        if (!(container instanceof HTMLElement)) {
            throw new Error('Game renderer container was not found.');
        }

        this.container = assignUiLayer(container, UI_LAYER.CANVAS);
        this.pixelRatio = 1;
        this.lastWidth = 0;
        this.lastHeight = 0;
        this.contextLost = false;
        this.resizeFrame = null;

        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance',
            failIfMajorPerformanceCaveat: false,
        });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.sortObjects = true;
        this.renderer.domElement.dataset.gameCanvas = '';
        assignUiLayer(this.renderer.domElement, UI_LAYER.LOCAL_BASE);

        Object.assign(this.renderer.domElement.style, {
            position: 'absolute',
            inset: '0',
            display: 'block',
            width: '100%',
            height: '100%',
            minWidth: '1px',
            minHeight: '1px',
        });

        this.onContextLost = this.onContextLost.bind(this);
        this.onContextRestored = this.onContextRestored.bind(this);
        this.onObservedResize = this.onObservedResize.bind(this);
        this.canvas.addEventListener('webglcontextlost', this.onContextLost, false);
        this.canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);
        this.container.appendChild(this.canvas);

        this.resizeObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(this.onObservedResize)
            : null;
        this.resizeObserver?.observe(this.container);
        this.resize(1);
        this.queueResize();
    }

    get canvas() {
        return this.renderer.domElement;
    }

    dimensions() {
        const rect = this.container.getBoundingClientRect?.();
        const width = Math.round(this.container.clientWidth || rect?.width || 0);
        const height = Math.round(this.container.clientHeight || rect?.height || 0);
        return {
            width: Math.max(width, 1),
            height: Math.max(height, 1),
        };
    }

    resize(pixelRatio = this.pixelRatio) {
        this.pixelRatio = finitePixelRatio(pixelRatio, this.pixelRatio);
        const { width, height } = this.dimensions();
        this.lastWidth = width;
        this.lastHeight = height;
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(width, height, false);
        return { width, height };
    }

    queueResize() {
        if (this.resizeFrame !== null || typeof requestAnimationFrame !== 'function') return;
        this.resizeFrame = requestAnimationFrame(() => {
            this.resizeFrame = null;
            this.resize(this.pixelRatio);
        });
    }

    onObservedResize() {
        this.queueResize();
    }

    ensureSize() {
        const { width, height } = this.dimensions();
        if (width !== this.lastWidth || height !== this.lastHeight) {
            return this.resize(this.pixelRatio);
        }
        return { width, height };
    }

    resetState({ clear = false } = {}) {
        const { width, height } = this.ensureSize();
        this.renderer.setRenderTarget(null);
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, width, height);
        this.renderer.autoClear = true;
        this.renderer.resetState?.();
        if (clear && !this.contextLost) this.renderer.clear(true, true, true);
        return { width, height };
    }

    prepareFrame() {
        if (this.contextLost) return null;
        this.resetState();
        return this.renderer;
    }

    render(scene, camera) {
        if (!scene || !camera || this.contextLost) return false;

        try {
            this.prepareFrame();
            this.renderer.render(scene, camera);
            return true;
        } catch (error) {
            // EffectComposer and multi-pass games can leave stale GL state behind
            // during a game switch. Reset once and retry before surfacing the error.
            this.renderer.setRenderTarget(null);
            this.renderer.setScissorTest(false);
            this.renderer.resetState?.();
            this.ensureSize();
            try {
                this.renderer.render(scene, camera);
                return true;
            } catch (retryError) {
                retryError.cause ??= error;
                throw retryError;
            }
        }
    }

    onContextLost(event) {
        event.preventDefault();
        this.contextLost = true;
        this.container.dataset.webglState = 'lost';
    }

    onContextRestored() {
        this.contextLost = false;
        this.container.dataset.webglState = 'ready';
        this.resize(this.pixelRatio);
        this.resetState({ clear: true });
    }

    dispose() {
        this.resizeObserver?.disconnect();
        if (this.resizeFrame !== null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.resizeFrame);
            this.resizeFrame = null;
        }
        this.canvas.removeEventListener('webglcontextlost', this.onContextLost, false);
        this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored, false);
        this.renderer.dispose();
        this.canvas.remove();
    }
}
