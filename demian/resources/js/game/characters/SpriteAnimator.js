import * as THREE from 'three';
import FrameAnimator from './FrameAnimator.js';

export default class SpriteAnimator extends FrameAnimator {
    constructor(texture, atlas) {
        super(atlas);
        this.texture = texture;

        this.texture.wrapS = THREE.ClampToEdgeWrapping;
        this.texture.wrapT = THREE.ClampToEdgeWrapping;
        this.texture.magFilter = THREE.NearestFilter;
        this.texture.minFilter = THREE.NearestFilter;
        this.texture.generateMipmaps = false;
        this.texture.colorSpace = THREE.SRGBColorSpace;
    }

    setPlaybackRate(rate) {
        super.setPlaybackRate(THREE.MathUtils.clamp(Number(rate) || 1, 0.25, 3.25));
    }

    applyCurrentFrame() {
        if (!this.animation) return;

        const frameName = this.currentFrameName();
        const frame = this.atlas.frames?.[frameName];
        if (!frame) {
            throw new Error(`Frame "${frameName}" is not defined in the atlas.`);
        }

        const width = Number(this.atlas.meta?.size?.w);
        const height = Number(this.atlas.meta?.size?.h);
        if (!width || !height) {
            throw new Error('Atlas meta.size is invalid.');
        }

        this.texture.repeat.set(frame.w / width, frame.h / height);
        this.texture.offset.set(frame.x / width, 1 - (frame.y + frame.h) / height);
        this.texture.updateMatrix();
    }
}
