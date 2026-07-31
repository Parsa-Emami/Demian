import * as THREE from 'three';
import { UI_LAYER, assignUiLayer } from '../ui/UiLayer.js';

/** Owns the single WebGLRenderer shared by every game. */
export default class RendererService {
    constructor(container) {
        if (!(container instanceof HTMLElement)) {
            throw new Error('Game renderer container was not found.');
        }

        this.container = assignUiLayer(container, UI_LAYER.CANVAS);
        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance',
        });
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.sortObjects = true;
        this.renderer.domElement.dataset.gameCanvas = '';
        assignUiLayer(this.renderer.domElement, UI_LAYER.LOCAL_BASE);
        this.container.appendChild(this.renderer.domElement);
        this.resize(1);
    }

    get canvas() {
        return this.renderer.domElement;
    }

    dimensions() {
        return {
            width: Math.max(this.container.clientWidth, 1),
            height: Math.max(this.container.clientHeight, 1),
        };
    }

    resize(pixelRatio = 1) {
        const { width, height } = this.dimensions();
        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.setSize(width, height, false);
        return { width, height };
    }

    dispose() {
        this.renderer.dispose();
        this.canvas.remove();
    }
}
