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
        this.coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
        this.maxPixelRatio = this.coarsePointer ? 1.35 : 1.75;
        this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
        this.qualityAccumulator = 0;
        this.qualityFrames = 0;
        this.qualityCooldown = 0;
        this.currentCharacterLabel = 'کاراکتر';

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
        this.onVisibilityChange = this.onVisibilityChange.bind(this);

        window.addEventListener('resize', this.onResize);
        document.addEventListener('visibilitychange', this.onVisibilityChange);
        this.bindCameraButtons();
        this.bindCharacterEvents();
    }

    async boot() {
        await this.characterManager.boot();
        this.resize();
        if (this.coarsePointer || window.innerWidth <= 900) {
            this.focusCharacter({ close: true, follow: true });
        } else {
            this.cameraController.overview({ immediate: true });
            this.updateCameraButtons('OVERVIEW');
            this.eventBus.emit('camera:mode', 'OVERVIEW');
        }
        this.animationFrame = requestAnimationFrame(this.animate);
    }

    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance',
        });

        this.renderer.setPixelRatio(this.pixelRatio);
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
        this.eventBus.on('character:selected', ({ record }) => {
            this.currentCharacterLabel = this.shortCharacterName(record);
            this.updateCameraButtons(this.cameraController.mode);

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

    shortCharacterName(record) {
        const name = String(record?.name ?? record?.slug ?? 'کاراکتر');
        const parts = name
            .split('/')
            .map((part) => part.trim())
            .filter(Boolean);

        return parts[1] ?? parts[0] ?? 'کاراکتر';
    }

    updateCameraButtons(mode) {
        const button = document.querySelector('[data-camera-toggle]');

        if (button) {
            button.textContent =
                mode === 'FOLLOW'
                    ? 'نمای کامل · F'
                    : `دنبال‌کردن ${this.currentCharacterLabel} · F`;
        }
    }

    handleLayoutChange() {
        this.resize();
        window.setTimeout(() => this.resize(), 360);
    }

    animate() {
        const deltaTime = Math.min(this.clock.getDelta(), 0.05);
        this.updateAdaptiveQuality(deltaTime);
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


    updateAdaptiveQuality(deltaTime) {
        this.qualityCooldown = Math.max(0, this.qualityCooldown - deltaTime);
        this.qualityAccumulator += deltaTime;
        this.qualityFrames += 1;

        if (this.qualityFrames < 90 || this.qualityCooldown > 0) {
            return;
        }

        const averageFrame = this.qualityAccumulator / this.qualityFrames;
        const deviceRatio = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
        let nextRatio = this.pixelRatio;

        if (averageFrame > 1 / 43 && this.pixelRatio > 0.9) {
            nextRatio = Math.max(0.9, this.pixelRatio - 0.2);
        } else if (averageFrame < 1 / 57 && this.pixelRatio < deviceRatio) {
            nextRatio = Math.min(deviceRatio, this.pixelRatio + 0.1);
        }

        this.qualityAccumulator = 0;
        this.qualityFrames = 0;

        if (Math.abs(nextRatio - this.pixelRatio) < 0.01) {
            return;
        }

        this.pixelRatio = nextRatio;
        this.qualityCooldown = 3;
        this.resize();
        this.eventBus.emit('studio:quality', {
            pixelRatio: this.pixelRatio,
            label: this.pixelRatio >= 1.45 ? 'HIGH' : this.pixelRatio >= 1.1 ? 'BALANCED' : 'PERFORMANCE',
        });
    }

    onVisibilityChange() {
        if (!document.hidden) {
            this.clock.getDelta();
        }
    }

    resize() {
        const width = Math.max(this.container.clientWidth, 1);
        const height = Math.max(this.container.clientHeight, 1);

        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(width, height, false);
        this.cameraController.resize(width, height);
        this.pipeline.resize(width, height);
    }

    dispose() {
        cancelAnimationFrame(this.animationFrame);
        window.removeEventListener('resize', this.onResize);
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
        this.input.dispose();
        this.cameraController.dispose();
        this.characterManager.dispose();
        this.world.dispose();
        this.pipeline.dispose();
        this.renderer.dispose();
        this.eventBus.clear();
    }
}
