import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export default class PostProcessingPipeline {
    constructor(renderer, scene, camera, width, height, performanceProfile = null) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.performanceProfile = performanceProfile;
        this.enabled =
            performanceProfile?.tier !== 'performance' &&
            !performanceProfile?.reducedMotion;
        this.composer = null;
        this.bloom = null;

        if (!this.enabled) {
            return;
        }

        this.composer = new EffectComposer(renderer);
        this.composer.addPass(new RenderPass(scene, camera));

        const balanced = performanceProfile?.tier === 'balanced';
        this.bloom = new UnrealBloomPass(
            new THREE.Vector2(width, height),
            balanced ? 0.3 : 0.46,
            balanced ? 0.2 : 0.28,
            balanced ? 0.88 : 0.82
        );
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());
    }

    render(deltaTime) {
        if (this.composer) {
            this.composer.render(deltaTime);
            return;
        }

        this.renderer.render(this.scene, this.camera);
    }

    resize(width, height, pixelRatio = 1) {
        if (!this.composer) {
            return;
        }

        this.composer.setPixelRatio(pixelRatio);
        this.composer.setSize(width, height);
    }

    dispose() {
        this.composer?.dispose();
    }
}
