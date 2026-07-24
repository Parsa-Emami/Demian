import * as THREE from 'three';
import TiamCharacter from './characters/TiamCharacter';

export default class DemianStudio {
    constructor(container) {
        if (!(container instanceof HTMLElement)) {
            throw new Error('Container not found.');
        }

        this.container = container;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#09090b');

        this.clock = new THREE.Clock();

        this.input = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            run: false,
        };

        this.ui = {
            state: document.querySelector('[data-state-label]'),
            speed: document.querySelector('[data-speed-label]'),
            position: document.querySelector('[data-position-label]'),
        };

        this.initRenderer();
        this.initCamera();
        this.initLights();
        this.initWorld();
        this.initCharacter();
        this.bindEvents();
        this.resize();

        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);
    }

    initRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
        });

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.container.appendChild(this.renderer.domElement);
    }

    initCamera() {
        this.camera = new THREE.PerspectiveCamera(
            45,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );

        this.camera.position.set(7.5, 7.5, 10.5);
        this.camera.lookAt(0, 2.8, 0);
    }

    initLights() {
        const ambient = new THREE.AmbientLight('#ffffff', 1.8);
        this.scene.add(ambient);

        const mainLight = new THREE.DirectionalLight('#ffffff', 2.8);
        mainLight.position.set(8, 15, 8);
        mainLight.castShadow = true;

        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 1;
        mainLight.shadow.camera.far = 50;
        mainLight.shadow.camera.left = -20;
        mainLight.shadow.camera.right = 20;
        mainLight.shadow.camera.top = 20;
        mainLight.shadow.camera.bottom = -20;

        this.scene.add(mainLight);

        const rim = new THREE.PointLight('#7c3aed', 20, 30, 2);
        rim.position.set(-6, 5, -6);
        this.scene.add(rim);
    }

    initWorld() {
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(60, 60),
            new THREE.MeshStandardMaterial({
                color: '#141418',
                roughness: 0.96,
                metalness: 0.05,
            })
        );

        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);

        const grid = new THREE.GridHelper(60, 60, '#3f3f46', '#202028');
        grid.position.y = 0.01;
        this.scene.add(grid);

        const platform = new THREE.Mesh(
            new THREE.CylinderGeometry(3.2, 3.2, 0.35, 48),
            new THREE.MeshStandardMaterial({
                color: '#1f1f28',
                roughness: 0.75,
                metalness: 0.15,
            })
        );
        platform.position.set(0, 0.18, 0);
        platform.castShadow = true;
        platform.receiveShadow = true;
        this.scene.add(platform);

        this.addWorldDecor();
    }

    addWorldDecor() {
        const positions = [
            [-8, 0.75, -8],
            [8, 0.75, -6],
            [-9, 0.75, 7],
            [9, 0.75, 8],
        ];

        positions.forEach((pos, index) => {
            const cube = new THREE.Mesh(
                new THREE.BoxGeometry(1.2, 1.5 + (index % 2), 1.2),
                new THREE.MeshStandardMaterial({
                    color: index % 2 === 0 ? '#1d4ed8' : '#7c3aed',
                    roughness: 0.7,
                    metalness: 0.1,
                })
            );

            cube.position.set(pos[0], pos[1], pos[2]);
            cube.castShadow = true;
            cube.receiveShadow = true;
            this.scene.add(cube);
        });
    }

    initCharacter() {
        this.tiam = new TiamCharacter();
        this.scene.add(this.tiam.group);
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resize());

        window.addEventListener('keydown', (event) => {
            const key = event.key.toLowerCase();

            if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) {
                event.preventDefault();
            }

            if (key === 'w' || key === 'arrowup') this.input.forward = true;
            if (key === 's' || key === 'arrowdown') this.input.backward = true;
            if (key === 'a' || key === 'arrowleft') this.input.left = true;
            if (key === 'd' || key === 'arrowright') this.input.right = true;
            if (key === 'shift') this.input.run = true;
        });

        window.addEventListener('keyup', (event) => {
            const key = event.key.toLowerCase();

            if (key === 'w' || key === 'arrowup') this.input.forward = false;
            if (key === 's' || key === 'arrowdown') this.input.backward = false;
            if (key === 'a' || key === 'arrowleft') this.input.left = false;
            if (key === 'd' || key === 'arrowright') this.input.right = false;
            if (key === 'shift') this.input.run = false;
        });

        window.addEventListener('blur', () => {
            this.input.forward = false;
            this.input.backward = false;
            this.input.left = false;
            this.input.right = false;
            this.input.run = false;
        });
    }

    getMovementVector() {
        let x = 0;
        let z = 0;

        if (this.input.left) x -= 1;
        if (this.input.right) x += 1;
        if (this.input.forward) z -= 1;
        if (this.input.backward) z += 1;

        return { x, z, run: this.input.run };
    }

    updateCamera(deltaTime) {
        const target = new THREE.Vector3(
            this.tiam.group.position.x + 7.5,
            7.5,
            this.tiam.group.position.z + 10.5
        );

        const alpha = 1 - Math.exp(-3 * deltaTime);
        this.camera.position.lerp(target, alpha);
        this.camera.lookAt(
            this.tiam.group.position.x,
            2.8,
            this.tiam.group.position.z
        );
    }

    updateHud() {
        const speed = Math.sqrt(
            this.tiam.velocity.x * this.tiam.velocity.x +
            this.tiam.velocity.z * this.tiam.velocity.z
        );

        if (this.ui.state) {
            this.ui.state.textContent = this.tiam.state;
        }

        if (this.ui.speed) {
            this.ui.speed.textContent = speed.toFixed(2);
        }

        if (this.ui.position) {
            this.ui.position.textContent = `${this.tiam.group.position.x.toFixed(1)} , ${this.tiam.group.position.z.toFixed(1)}`;
        }
    }

    resize() {
        const width = Math.max(this.container.clientWidth, 1);
        const height = Math.max(this.container.clientHeight, 1);

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(width, height, false);
    }

    animate() {
        const deltaTime = Math.min(this.clock.getDelta(), 0.05);

        const input = this.getMovementVector();
        this.tiam.update(deltaTime, input);

        this.updateCamera(deltaTime);
        this.updateHud();

        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(this.animate);
    }
}