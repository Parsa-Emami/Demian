import * as THREE from 'three';
import EventBus from './core/EventBus';
import InputController from './core/InputController';
import CameraController from './core/CameraController';
import PostProcessingPipeline from './core/PostProcessingPipeline';
import CharacterRepository from './data/CharacterRepository';
import CharacterManager from './managers/CharacterManager';
import ArcadeWorld from './world/ArcadeWorld';

export default class DemianStudio {
    constructor(container, options) {
        if (!(container instanceof HTMLElement)) {
            throw new Error('Demian Studio container was not found.');
        }

        this.container = container;
        this.options = options;
        this.eventBus = new EventBus();
        this.input = new InputController(document);
        this.clock = new THREE.Clock();

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050714);

        this.initRenderer();
        this.initCamera();

        this.cameraController = new CameraController(
            this.camera,
            this.renderer.domElement
        );

        this.world = new ArcadeWorld(this.scene);

        this.repository = new CharacterRepository({
            baseUrl: options.apiBase,
            csrfToken: options.csrfToken,
        });

        this.characterManager = new CharacterManager({
            scene: this.scene,
            repository: this.repository,
            eventBus: this.eventBus,
        });

        this.pipeline = new PostProcessingPipeline(
            this.renderer,
            this.scene,
            this.camera,
            container.clientWidth,
            container.clientHeight
        );

        this.onResize = this.resize.bind(this);
        this.animate = this.animate.bind(this);

        window.addEventListener('resize', this.onResize);
        this.bindCameraButtons();
        this.bindCharacterEvents();
    }

    async boot() {
        await this.characterManager.boot();
        this.resize();
        this.cameraController.overview({ immediate: true });
        this.updateCameraButtons('OVERVIEW');
        this.eventBus.emit('camera:mode', 'OVERVIEW');
        this.animationFrame = requestAnimationFrame(this.animate);
    }

    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance',
        });

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
        this.renderer.setSize(
            Math.max(this.container.clientWidth, 1),
            Math.max(this.container.clientHeight, 1),
            false
        );
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.NoToneMapping;
        this.renderer.sortObjects = true;
        this.container.appendChild(this.renderer.domElement);
    }

    initCamera() {
        this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 120);
    }

    bindCameraButtons() {
        document.querySelector('[data-camera-toggle]')?.addEventListener(
            'click',
            () => this.toggleCamera()
        );

        document.querySelector('[data-camera-reset]')?.addEventListener(
            'click',
            () => this.focusCharacter({ close: true })
        );

        window.addEventListener('keydown', (event) => {
            const target = event.target;
            const isTyping =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement ||
                target?.isContentEditable;

            if (isTyping || event.repeat) {
                return;
            }

            const key = event.key.toLowerCase();

            if (key === 'f') {
                this.toggleCamera();
            }

            if (key === 'r') {
                this.focusCharacter({ close: true });
            }
        });
    }

    bindCharacterEvents() {
        this.eventBus.on('character:selected', () => {
            requestAnimationFrame(() => {
                if (this.cameraController.mode === 'FOLLOW') {
                    this.focusCharacter({ close: true });
                }
            });
        });
    }

    toggleCamera() {
        const mode = this.cameraController.toggle(
            this.characterManager.focusPoint()
        );
        this.updateCameraButtons(mode);
        this.eventBus.emit('camera:mode', mode);
    }

    focusCharacter({ close = true, follow = true } = {}) {
        const mode = this.cameraController.focus(
            this.characterManager.focusPoint(),
            { close, follow }
        );
        this.updateCameraButtons(mode);
        this.eventBus.emit('camera:mode', mode);
    }

    updateCameraButtons(mode) {
        const button = document.querySelector('[data-camera-toggle]');

        if (button) {
            button.textContent =
                mode === 'FOLLOW' ? 'نمای کامل · F' : 'دنبال‌کردن تیام · F';
        }
    }

    handleLayoutChange() {
        this.resize();
        window.setTimeout(() => this.resize(), 360);
    }

    animate() {
        const deltaTime = Math.min(this.clock.getDelta(), 0.05);
        const input = this.input.snapshot();
        const basis = this.cameraController.movementBasis();

        this.characterManager.update(deltaTime, input, basis);
        this.world.update(deltaTime);
        this.cameraController.update(
            this.characterManager.focusPoint(),
            deltaTime
        );

        this.eventBus.emit('studio:frame', {
            state: this.characterManager.state(),
            speed: this.characterManager.speed(),
            position: this.characterManager.position(),
            cameraMode: this.cameraController.mode,
        });

        this.pipeline.render(deltaTime);
        this.animationFrame = requestAnimationFrame(this.animate);
    }

    resize() {
        const width = Math.max(this.container.clientWidth, 1);
        const height = Math.max(this.container.clientHeight, 1);

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
        this.renderer.setSize(width, height, false);
        this.cameraController.resize(width, height);
        this.pipeline.resize(width, height);
    }

    dispose() {
        cancelAnimationFrame(this.animationFrame);
        window.removeEventListener('resize', this.onResize);
        this.input.dispose();
        this.cameraController.dispose();
        this.characterManager.dispose();
        this.world.dispose();
        this.pipeline.dispose();
        this.renderer.dispose();
        this.eventBus.clear();
    }
}
