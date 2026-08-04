import * as THREE from 'three';
import { TETROMINO_COLORS } from '../domain/Tetrominoes.js';
import BlockPool from './BlockPool.js';
import TetrisEffects from './TetrisEffects.js';
import { createCafeEnvironment, updateCafeEnvironmentVisibility } from '../../../shared/cafe/CafeSceneFactory.js';

const GHOST_COLOR = 0xbff7ff;

export default class TetrisRenderer {
    constructor(context, config) {
        this.context = context;
        this.config = config;
        this.scene = new THREE.Scene();
        this.scene.background = null;
        this.cafeScene = new THREE.Scene();
        this.cafeScene.background = new THREE.Color(0xdad5cc);
        this.cafeScene.fog = new THREE.FogExp2(0xdad5cc, 0.012);
        this.cafeCamera = new THREE.PerspectiveCamera(48, 1, 0.1, 180);
        this.cafeCamera.position.set(0, 8.8, 15.4);
        this.cafeCamera.lookAt(0, 0.8, -3.5);
        this.createCafeBackdrop();
        this.camera = new THREE.OrthographicCamera(-6, 6, 11, -11, 0.1, 50);
        this.camera.position.set(0, 0, 12);
        this.camera.lookAt(0, 0, 0);
        this.pixelRatio = 1;

        this.blockGeometry = new THREE.BoxGeometry(0.88, 0.88, 0.26);
        this.blockMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
        this.ghostMaterial = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
            wireframe: true,
        });

        this.blocks = new BlockPool({
            capacity: (config.board.width * config.board.visibleRows) + 4,
            geometry: this.blockGeometry,
            material: this.blockMaterial,
            scene: this.scene,
            z: 0.25,
        });
        this.ghost = new BlockPool({
            capacity: 4,
            geometry: this.blockGeometry,
            material: this.ghostMaterial,
            scene: this.scene,
            z: 0.1,
        });

        this.createBoardFrame();
        this.createAmbientBackdrop();
        this.effects = new TetrisEffects(this.scene, config.board);
        this.resize();
    }

    createCafeBackdrop() {
        this.cafeScene.add(new THREE.HemisphereLight(0xf3f0e8, 0x756d64, 1.45));
        const key = new THREE.DirectionalLight(0xfff0d7, 1.85);
        key.position.set(-10, 18, 12);
        const counter = new THREE.PointLight(0xffd89a, 5.5, 16, 2);
        counter.position.set(14, 3.0, 4.5);
        const lounge = new THREE.PointLight(0xffbd72, 4.5, 12, 2);
        lounge.position.set(-20, 2.4, -9.0);
        this.cafeScene.add(key, counter, lounge);
        this.cafeEnvironment = createCafeEnvironment(this.cafeScene, { includeCeiling: false });
        updateCafeEnvironmentVisibility(this.cafeEnvironment, this.cafeCamera);
    }

    createBoardFrame() {
        const { width, visibleRows } = this.config.board;
        const panelGeometry = new THREE.PlaneGeometry(width + 0.35, visibleRows + 0.35);
        const panelMaterial = new THREE.MeshBasicMaterial({ color: 0x080b1d });
        this.panel = new THREE.Mesh(panelGeometry, panelMaterial);
        this.panel.position.z = -0.25;
        this.scene.add(this.panel);

        const points = [];
        for (let x = 0; x <= width; x += 1) {
            const worldX = x - (width / 2);
            points.push(new THREE.Vector3(worldX, -visibleRows / 2, -0.05));
            points.push(new THREE.Vector3(worldX, visibleRows / 2, -0.05));
        }
        for (let y = 0; y <= visibleRows; y += 1) {
            const worldY = y - (visibleRows / 2);
            points.push(new THREE.Vector3(-width / 2, worldY, -0.05));
            points.push(new THREE.Vector3(width / 2, worldY, -0.05));
        }

        this.gridGeometry = new THREE.BufferGeometry().setFromPoints(points);
        this.gridMaterial = new THREE.LineBasicMaterial({ color: 0x19213d, transparent: true, opacity: 0.72 });
        this.grid = new THREE.LineSegments(this.gridGeometry, this.gridMaterial);
        this.scene.add(this.grid);

        const frame = new THREE.EdgesGeometry(panelGeometry);
        this.frameGeometry = frame;
        this.frameMaterial = new THREE.LineBasicMaterial({ color: 0x4de7ff });
        this.frame = new THREE.LineSegments(frame, this.frameMaterial);
        this.frame.position.z = 0.5;
        this.scene.add(this.frame);
    }

    createAmbientBackdrop() {
        const geometry = new THREE.PlaneGeometry(40, 40);
        const material = new THREE.MeshBasicMaterial({ color: 0x050614, transparent: true, opacity: 0.48, depthWrite: false });
        this.backdrop = new THREE.Mesh(geometry, material);
        this.backdrop.position.z = -2;
        this.scene.add(this.backdrop);

        const glowGeometry = new THREE.RingGeometry(7.8, 8.1, 64);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xa855f7,
            transparent: true,
            opacity: 0.12,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        this.glow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.glow.position.z = -1;
        this.scene.add(this.glow);
    }

    cellToWorld(x, boardY) {
        return {
            x: x - (this.config.board.width / 2) + 0.5,
            y: (this.config.board.visibleRows / 2) - (boardY - this.config.board.hiddenRows) - 0.5,
        };
    }

    render(snapshot, deltaTime) {
        if (!snapshot) return;
        this.effects.update(deltaTime);
        this.glow.rotation.z += deltaTime * 0.04;

        this.blocks.begin();
        snapshot.board.forEach((row, y) => {
            if (y < this.config.board.hiddenRows) return;
            row.forEach((type, x) => {
                if (!type) return;
                const position = this.cellToWorld(x, y);
                this.blocks.add({ ...position, color: TETROMINO_COLORS[type] });
            });
        });

        snapshot.activePiece?.cells().forEach(({ x, y }) => {
            if (y < this.config.board.hiddenRows) return;
            const position = this.cellToWorld(x, y);
            this.blocks.add({ ...position, color: TETROMINO_COLORS[snapshot.activePiece.type] });
        });
        this.blocks.commit();

        this.ghost.begin();
        snapshot.ghostPiece?.cells().forEach(({ x, y }) => {
            if (y < this.config.board.hiddenRows) return;
            const position = this.cellToWorld(x, y);
            this.ghost.add({ ...position, color: GHOST_COLOR, scale: 0.92 });
        });
        this.ghost.commit();

        const renderer = this.context.renderer.renderer;
        const previousAutoClear = renderer.autoClear;
        renderer.autoClear = false;
        renderer.clear(true, true, true);
        renderer.render(this.cafeScene, this.cafeCamera);
        renderer.clearDepth();
        renderer.render(this.scene, this.camera);
        renderer.autoClear = previousAutoClear;
    }

    flashRows(rows) {
        this.effects.flashRows(rows);
    }

    resize(pixelRatio = this.pixelRatio) {
        this.pixelRatio = pixelRatio;
        const { width, height } = this.context.renderer.resize(pixelRatio);
        const aspect = width / Math.max(height, 1);
        let viewHeight = 22;
        let viewWidth = viewHeight * aspect;
        if (viewWidth < 12) {
            viewWidth = 12;
            viewHeight = viewWidth / aspect;
        }

        this.camera.left = -viewWidth / 2;
        this.camera.right = viewWidth / 2;
        this.camera.top = viewHeight / 2;
        this.camera.bottom = -viewHeight / 2;
        this.camera.updateProjectionMatrix();
        this.cafeCamera.aspect = aspect;
        this.cafeCamera.updateProjectionMatrix();
        return { width, height };
    }

    dispose() {
        this.blocks.dispose(this.scene);
        this.ghost.dispose(this.scene);
        this.effects.dispose();
        this.scene.remove(this.panel, this.grid, this.frame, this.backdrop, this.glow);
        this.blockGeometry.dispose();
        this.blockMaterial.dispose();
        this.ghostMaterial.dispose();
        this.panel.geometry.dispose();
        this.panel.material.dispose();
        this.gridGeometry.dispose();
        this.gridMaterial.dispose();
        this.frameGeometry.dispose();
        this.frameMaterial.dispose();
        this.backdrop.geometry.dispose();
        this.backdrop.material.dispose();
        this.glow.geometry.dispose();
        this.glow.material.dispose();
        this.cafeEnvironment?.traverse?.((child) => {
            child.geometry?.dispose?.();
            if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
            else child.material?.dispose?.();
        });
        this.cafeScene.clear();
        this.scene.clear();
    }
}
