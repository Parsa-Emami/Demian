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
        this.input = new InputController();
        this.clock = new THREE.Clock();

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x050610);
        this.scene.fog = new THREE.FogExp2(0x050610, 0.026);

        this.initRenderer();
        this.initCamera();
        this.initLights();

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
    }

    async boot() {
        await this.characterManager.boot();
        this.cameraController.reset(this.characterManager.position());
        this.resize();
        this.animationFrame = requestAnimationFrame(this.animate);
    }

    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
        });

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(
            Math.max(this.container.clientWidth, 1),
            Math.max(this.container.clientHeight, 1),
            false
        );

        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.container.appendChild(this.renderer.domElement);
    }

    initCamera() {
        this.camera = new THREE.PerspectiveCamera(
            48,
            Math.max(this.container.clientWidth, 1) /
                Math.max(this.container.clientHeight, 1),
            0.1,
            200
        );
    }

    initLights() {
        this.scene.add(new THREE.HemisphereLight(0xbdd6ff, 0x190b2b, 1.35));

        const key = new THREE.DirectionalLight(0xffffff, 2.6);
        key.position.set(8, 14, 7);
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        key.shadow.camera.left = -22;
        key.shadow.camera.right = 22;
        key.shadow.camera.top = 22;
        key.shadow.camera.bottom = -22;
        key.shadow.camera.near = 0.5;
        key.shadow.camera.far = 55;
        this.scene.add(key);

        const pink = new THREE.PointLight(0xff4fd8, 26, 30, 2);
        pink.position.set(-8, 5, -8);
        this.scene.add(pink);

        const cyan = new THREE.PointLight(0x22d3ee, 22, 28, 2);
        cyan.position.set(8, 5, 8);
        this.scene.add(cyan);
    }

    bindCameraButtons() {
        document.querySelector('[data-camera-toggle]')?.addEventListener(
            'click',
            () => this.toggleCamera()
        );

        document.querySelector('[data-camera-reset]')?.addEventListener(
            'click',
            () => this.cameraController.reset(this.characterManager.position())
        );

        window.addEventListener('keydown', (event) => {
            const key = event.key.toLowerCase();

            if (key === 'f') {
                this.toggleCamera();
            }

            if (key === 'r') {
                this.cameraController.reset(this.characterManager.position());
            }
        });
    }

    toggleCamera() {
        const mode = this.cameraController.toggle(
            this.characterManager.position()
        );

        this.eventBus.emit('camera:mode', mode);
    }

    animate() {
        const deltaTime = Math.min(this.clock.getDelta(), 0.05);
        const input = this.input.snapshot();
        const basis = this.cameraController.movementBasis();

        this.characterManager.update(deltaTime, input, basis);
        this.world.update(deltaTime);
        this.cameraController.update(
            this.characterManager.position(),
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

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(width, height, false);
        this.pipeline.resize(width, height);
    }

    dispose() {
        cancelAnimationFrame(this.animationFrame);
        window.removeEventListener('resize', this.onResize);
        this.input.dispose();
        this.cameraController.dispose();
        this.characterManager.dispose();
        this.pipeline.dispose();
        this.renderer.dispose();
        this.eventBus.clear();
    }
}
