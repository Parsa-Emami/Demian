import * as THREE from 'three';

export default class ArcadeWorld {
    constructor(scene) {
        this.scene = scene;
        this.root = new THREE.Group();
        this.time = 0;
        this.pulsingMaterials = [];
        this.floaters = [];

        scene.add(this.root);

        this.createFloor();
        this.createStage();
        this.createCabinets();
        this.createPillars();
        this.createFloaters();
    }

    material(color, emissive = 0x000000, emissiveIntensity = 0) {
        const material = new THREE.MeshStandardMaterial({
            color,
            emissive,
            emissiveIntensity,
            roughness: 0.58,
            metalness: 0.18,
        });

        if (emissiveIntensity > 0) {
            this.pulsingMaterials.push({
                material,
                base: emissiveIntensity,
                phase: Math.random() * Math.PI * 2,
            });
        }

        return material;
    }

    createFloor() {
        const floor = new THREE.Mesh(
            new THREE.PlaneGeometry(50, 50),
            this.material(0x060711)
        );

        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.root.add(floor);

        const grid = new THREE.GridHelper(50, 50, 0xff4fd8, 0x244cff);
        grid.position.y = 0.018;
        grid.material.transparent = true;
        grid.material.opacity = 0.34;
        this.root.add(grid);

        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(15, 0.055, 10, 128),
            this.material(0x431663, 0x8b5cf6, 1.8)
        );

        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.045;
        this.root.add(ring);
    }

    createStage() {
        const stage = new THREE.Mesh(
            new THREE.CylinderGeometry(4, 4, 0.42, 64),
            this.material(0x12131f, 0x4c1d95, 0.62)
        );

        stage.position.y = 0.21;
        stage.receiveShadow = true;
        stage.castShadow = true;
        this.root.add(stage);

        const neonRing = new THREE.Mesh(
            new THREE.TorusGeometry(3.35, 0.1, 12, 128),
            this.material(0xff4fd8, 0xff4fd8, 2.4)
        );

        neonRing.rotation.x = Math.PI / 2;
        neonRing.position.y = 0.45;
        this.root.add(neonRing);
    }

    createCabinets() {
        const definitions = [
            [-10, -8, Math.PI / 4, 0x7c3aed],
            [10, -8, -Math.PI / 4, 0xec4899],
            [-10, 8, -Math.PI / 4, 0x06b6d4],
            [10, 8, Math.PI / 4, 0xf59e0b],
        ];

        definitions.forEach(([x, z, rotation, accent]) => {
            const cabinet = new THREE.Group();

            const body = new THREE.Mesh(
                new THREE.BoxGeometry(1.8, 3.2, 1.75),
                this.material(0x0d0e17)
            );

            body.position.y = 1.6;
            body.castShadow = true;

            const screen = new THREE.Mesh(
                new THREE.PlaneGeometry(1.08, 0.82),
                new THREE.MeshBasicMaterial({ color: accent })
            );

            screen.position.set(0, 2.12, 0.881);

            const panel = new THREE.Mesh(
                new THREE.BoxGeometry(1.35, 0.26, 0.82),
                this.material(0x171827, accent, 0.8)
            );

            panel.position.set(0, 1.35, 0.58);
            panel.rotation.x = -0.38;

            cabinet.add(body, screen, panel);
            cabinet.position.set(x, 0, z);
            cabinet.rotation.y = rotation;
            this.root.add(cabinet);
        });
    }

    createPillars() {
        const positions = [
            [-15, -15],
            [15, -15],
            [-15, 15],
            [15, 15],
        ];

        positions.forEach(([x, z], index) => {
            const accent = index % 2 === 0 ? 0x8b5cf6 : 0x22d3ee;

            const pillar = new THREE.Mesh(
                new THREE.CylinderGeometry(0.16, 0.16, 5.5, 18),
                this.material(0x10111a, accent, 2.2)
            );

            pillar.position.set(x, 2.75, z);
            pillar.castShadow = true;
            this.root.add(pillar);

            const light = new THREE.PointLight(accent, 22, 12, 2);
            light.position.set(x, 4.7, z);
            this.root.add(light);
        });
    }

    createFloaters() {
        const colors = [0xff4fd8, 0x22d3ee, 0xf59e0b, 0x8b5cf6];

        for (let index = 0; index < 12; index += 1) {
            const color = colors[index % colors.length];
            const mesh = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.14, 0),
                this.material(color, color, 2.6)
            );

            mesh.position.set(
                (Math.random() - 0.5) * 28,
                1.8 + Math.random() * 4,
                (Math.random() - 0.5) * 28
            );

            this.floaters.push({
                mesh,
                baseY: mesh.position.y,
                phase: Math.random() * Math.PI * 2,
                speed: 0.6 + Math.random(),
            });

            this.root.add(mesh);
        }
    }

    update(deltaTime) {
        this.time += deltaTime;

        this.pulsingMaterials.forEach(({ material, base, phase }) => {
            material.emissiveIntensity =
                base + Math.sin(this.time * 2.2 + phase) * base * 0.18;
        });

        this.floaters.forEach(({ mesh, baseY, phase, speed }, index) => {
            mesh.position.y = baseY + Math.sin(this.time * speed + phase) * 0.32;
            mesh.rotation.x += deltaTime * (0.35 + index * 0.01);
            mesh.rotation.y += deltaTime * 0.5;
        });
    }
}
