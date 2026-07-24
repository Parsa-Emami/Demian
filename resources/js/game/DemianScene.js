import * as THREE from 'three';

export default class DemianScene {
    constructor(container) {
        if (!(container instanceof HTMLElement)) {
            throw new Error('Demian scene container was not found.');
        }

        this.container = container;
        this.keys = new Set();
        this.characterSpeed = 4;
        this.walkTime = 0;
        this.lastTimestamp = 0;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#09090b');

        this.camera = new THREE.OrthographicCamera(
            -8,
            8,
            8,
            -8,
            0.1,
            100
        );

        this.camera.position.set(10, 10, 14);
        this.camera.lookAt(0, 2, 0);

        this.renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: false,
            powerPreference: 'high-performance',
        });

        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.container.appendChild(this.renderer.domElement);

        this.createLights();
        this.createEnvironment();
        this.createCharacter();
        this.bindEvents();
        this.resize();

        requestAnimationFrame(this.animate.bind(this));
    }

    createLights() {
        const ambientLight = new THREE.AmbientLight('#ffffff', 1.8);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight('#ffffff', 3);

        directionalLight.position.set(6, 12, 8);
        directionalLight.castShadow = true;

        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;

        directionalLight.shadow.camera.left = -12;
        directionalLight.shadow.camera.right = 12;
        directionalLight.shadow.camera.top = 12;
        directionalLight.shadow.camera.bottom = -12;

        this.scene.add(directionalLight);
    }

    createEnvironment() {
        const floorGeometry = new THREE.PlaneGeometry(40, 40);

        const floorMaterial = new THREE.MeshStandardMaterial({
            color: '#18181b',
            roughness: 0.95,
            metalness: 0,
        });

        const floor = new THREE.Mesh(floorGeometry, floorMaterial);

        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;

        this.scene.add(floor);

        const grid = new THREE.GridHelper(
            40,
            40,
            '#3f3f46',
            '#27272a'
        );

        grid.position.y = 0.01;

        this.scene.add(grid);

        const platformGeometry = new THREE.CylinderGeometry(
            3.4,
            3.4,
            0.35,
            32
        );

        const platformMaterial = new THREE.MeshStandardMaterial({
            color: '#27272a',
            roughness: 0.7,
            metalness: 0.2,
        });

        const platform = new THREE.Mesh(
            platformGeometry,
            platformMaterial
        );

        platform.position.y = 0.17;
        platform.receiveShadow = true;
        platform.castShadow = true;

        this.scene.add(platform);
    }

    createCharacter() {
        this.character = new THREE.Group();
        this.character.position.y = 0.35;

        const skinColor = '#d59a72';
        const hairColor = '#18181b';
        const shirtColor = '#7c3aed';
        const pantsColor = '#172554';
        const shoeColor = '#09090b';

        const body = this.createPart(
            1.5,
            1.8,
            0.8,
            shirtColor,
            0,
            2.55,
            0
        );

        const neck = this.createPart(
            0.5,
            0.35,
            0.45,
            skinColor,
            0,
            3.55,
            0
        );

        const head = this.createPart(
            1.35,
            1.35,
            1.15,
            skinColor,
            0,
            4.3,
            0
        );

        const hairTop = this.createPart(
            1.42,
            0.35,
            1.22,
            hairColor,
            0,
            4.98,
            0
        );

        const hairBack = this.createPart(
            1.42,
            1,
            0.25,
            hairColor,
            0,
            4.47,
            -0.68
        );

        this.leftArm = this.createPart(
            0.45,
            1.7,
            0.55,
            skinColor,
            -1.02,
            2.55,
            0
        );

        this.rightArm = this.createPart(
            0.45,
            1.7,
            0.55,
            skinColor,
            1.02,
            2.55,
            0
        );

        this.leftLeg = this.createPart(
            0.58,
            1.7,
            0.68,
            pantsColor,
            -0.42,
            0.85,
            0
        );

        this.rightLeg = this.createPart(
            0.58,
            1.7,
            0.68,
            pantsColor,
            0.42,
            0.85,
            0
        );

        this.createPart(
            0.64,
            0.35,
            0.95,
            shoeColor,
            -0.42,
            0.1,
            0.14
        );

        this.createPart(
            0.64,
            0.35,
            0.95,
            shoeColor,
            0.42,
            0.1,
            0.14
        );

        this.createFace();

        this.character.add(
            body,
            neck,
            head,
            hairTop,
            hairBack,
            this.leftArm,
            this.rightArm,
            this.leftLeg,
            this.rightLeg
        );

        this.scene.add(this.character);
    }

    createFace() {
        const eyeMaterial = new THREE.MeshBasicMaterial({
            color: '#18181b',
        });

        const eyeGeometry = new THREE.BoxGeometry(
            0.18,
            0.18,
            0.08
        );

        const leftEye = new THREE.Mesh(
            eyeGeometry,
            eyeMaterial
        );

        const rightEye = new THREE.Mesh(
            eyeGeometry,
            eyeMaterial
        );

        leftEye.position.set(-0.3, 4.42, 0.59);
        rightEye.position.set(0.3, 4.42, 0.59);

        const mouthGeometry = new THREE.BoxGeometry(
            0.35,
            0.09,
            0.08
        );

        const mouthMaterial = new THREE.MeshBasicMaterial({
            color: '#7f1d1d',
        });

        const mouth = new THREE.Mesh(
            mouthGeometry,
            mouthMaterial
        );

        mouth.position.set(0, 4.03, 0.6);

        this.character.add(leftEye, rightEye, mouth);
    }

    createPart(width, height, depth, color, x, y, z) {
        const geometry = new THREE.BoxGeometry(
            width,
            height,
            depth
        );

        const material = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.85,
            metalness: 0,
        });

        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    }

    bindEvents() {
        window.addEventListener('keydown', (event) => {
            const key = event.key.toLowerCase();

            if (
                [
                    'arrowup',
                    'arrowdown',
                    'arrowleft',
                    'arrowright',
                    'w',
                    'a',
                    's',
                    'd',
                ].includes(key)
            ) {
                event.preventDefault();
                this.keys.add(key);
            }
        });

        window.addEventListener('keyup', (event) => {
            this.keys.delete(event.key.toLowerCase());
        });

        window.addEventListener('blur', () => {
            this.keys.clear();
        });

        window.addEventListener('resize', () => {
            this.resize();
        });
    }

    updateCharacter(deltaTime) {
        const direction = new THREE.Vector3();

        if (
            this.keys.has('w') ||
            this.keys.has('arrowup')
        ) {
            direction.z -= 1;
        }

        if (
            this.keys.has('s') ||
            this.keys.has('arrowdown')
        ) {
            direction.z += 1;
        }

        if (
            this.keys.has('a') ||
            this.keys.has('arrowleft')
        ) {
            direction.x -= 1;
        }

        if (
            this.keys.has('d') ||
            this.keys.has('arrowright')
        ) {
            direction.x += 1;
        }

        const isMoving = direction.lengthSq() > 0;

        if (isMoving) {
            direction.normalize();

            this.character.position.x +=
                direction.x * this.characterSpeed * deltaTime;

            this.character.position.z +=
                direction.z * this.characterSpeed * deltaTime;

            this.character.position.x = THREE.MathUtils.clamp(
                this.character.position.x,
                -8,
                8
            );

            this.character.position.z = THREE.MathUtils.clamp(
                this.character.position.z,
                -8,
                8
            );

            this.character.rotation.y = Math.atan2(
                direction.x,
                direction.z
            );

            this.walkTime += deltaTime * 10;

            const legRotation =
                Math.sin(this.walkTime) * 0.55;

            this.leftLeg.rotation.x = legRotation;
            this.rightLeg.rotation.x = -legRotation;

            this.leftArm.rotation.x = -legRotation;
            this.rightArm.rotation.x = legRotation;

            this.character.position.y =
                0.35 + Math.abs(Math.sin(this.walkTime)) * 0.08;
        } else {
            this.leftLeg.rotation.x = THREE.MathUtils.lerp(
                this.leftLeg.rotation.x,
                0,
                0.18
            );

            this.rightLeg.rotation.x = THREE.MathUtils.lerp(
                this.rightLeg.rotation.x,
                0,
                0.18
            );

            this.leftArm.rotation.x = THREE.MathUtils.lerp(
                this.leftArm.rotation.x,
                0,
                0.18
            );

            this.rightArm.rotation.x = THREE.MathUtils.lerp(
                this.rightArm.rotation.x,
                0,
                0.18
            );

            this.character.position.y = THREE.MathUtils.lerp(
                this.character.position.y,
                0.35,
                0.15
            );
        }
    }

    resize() {
        const width = Math.max(
            this.container.clientWidth,
            1
        );

        const height = Math.max(
            this.container.clientHeight,
            1
        );

        const aspect = width / height;
        const cameraSize = 7;

        this.camera.left = -cameraSize * aspect;
        this.camera.right = cameraSize * aspect;
        this.camera.top = cameraSize;
        this.camera.bottom = -cameraSize;

        this.camera.updateProjectionMatrix();

        this.renderer.setPixelRatio(
            Math.min(window.devicePixelRatio, 2)
        );

        this.renderer.setSize(width, height, false);
    }

    animate(timestamp) {
        const deltaTime = Math.min(
            (timestamp - this.lastTimestamp) / 1000,
            0.05
        );

        this.lastTimestamp = timestamp;

        this.updateCharacter(deltaTime);

        this.renderer.render(
            this.scene,
            this.camera
        );

        requestAnimationFrame(this.animate.bind(this));
    }
}