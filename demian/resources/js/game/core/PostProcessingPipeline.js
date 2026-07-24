import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export default class PostProcessingPipeline {
    constructor(renderer, scene, camera, width, height) {
        this.composer = new EffectComposer(renderer);
        this.composer.addPass(new RenderPass(scene, camera));

        this.bloom = new UnrealBloomPass(
            new THREE.Vector2(width, height),
            0.72,
            0.5,
            0.86
        );

        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());
    }

    render(deltaTime) {
        this.composer.render(deltaTime);
    }

    resize(width, height) {
        this.composer.setSize(width, height);
    }

    dispose() {
        this.composer.dispose();
    }
}
