import * as THREE from 'three';

export default class SpriteAnimator {
    constructor(texture, atlas) {
        this.texture = texture;
        this.atlas = atlas;
        this.animationName = null;
        this.animation = null;
        this.frameIndex = 0;
        this.elapsed = 0;
        this.finished = false;
        this.facing = 1;

        this.texture.wrapS = THREE.ClampToEdgeWrapping;
        this.texture.wrapT = THREE.ClampToEdgeWrapping;
        this.texture.magFilter = THREE.NearestFilter;
        this.texture.minFilter = THREE.NearestFilter;
        this.texture.generateMipmaps = false;
        this.texture.colorSpace = THREE.SRGBColorSpace;
    }

    play(name, { restart = false } = {}) {
        if (!restart && this.animationName === name) {
            return;
        }

        const animation = this.atlas.animations[name];

        if (!animation) {
            throw new Error(`Animation "${name}" is not defined in the atlas.`);
        }

        this.animationName = name;
        this.animation = animation;
        this.frameIndex = 0;
        this.elapsed = 0;
        this.finished = false;
        this.applyCurrentFrame();
    }

    setFacing(direction) {
        const nextFacing = direction >= 0 ? 1 : -1;

        if (this.facing === nextFacing) {
            return;
        }

        this.facing = nextFacing;
        this.frameIndex = Math.min(
            this.frameIndex,
            Math.max(this.currentFrames().length - 1, 0)
        );
        this.applyCurrentFrame();
    }

    currentFrames(animation = this.animation) {
        if (!animation) {
            return [];
        }

        if (this.facing < 0 && Array.isArray(animation.framesLeft)) {
            return animation.framesLeft;
        }

        if (this.facing >= 0 && Array.isArray(animation.framesRight)) {
            return animation.framesRight;
        }

        return animation.frames ?? animation.framesRight ?? animation.framesLeft ?? [];
    }

    usesDirectionalFrames() {
        return Boolean(
            this.animation?.framesRight?.length && this.animation?.framesLeft?.length
        );
    }

    update(deltaTime) {
        if (!this.animation || this.finished) {
            return;
        }

        const frames = this.currentFrames();

        if (frames.length === 0) {
            return;
        }

        const fps = Math.max(Number(this.animation.fps) || 1, 1);
        const frameDuration = 1 / fps;
        this.elapsed += deltaTime;

        while (this.elapsed >= frameDuration) {
            this.elapsed -= frameDuration;
            this.frameIndex += 1;

            if (this.frameIndex >= frames.length) {
                if (this.animation.loop !== false) {
                    this.frameIndex = 0;
                } else {
                    this.frameIndex = frames.length - 1;
                    this.finished = true;
                }
            }

            this.applyCurrentFrame();
        }
    }

    duration(name) {
        const animation = this.atlas.animations[name];

        if (!animation) {
            return 0;
        }

        const frameCount = Math.max(
            animation.frames?.length ?? 0,
            animation.framesRight?.length ?? 0,
            animation.framesLeft?.length ?? 0,
            1
        );

        return frameCount / Math.max(Number(animation.fps) || 1, 1);
    }

    applyCurrentFrame() {
        if (!this.animation) {
            return;
        }

        const frames = this.currentFrames();
        const frameName = frames[this.frameIndex] ?? frames[0];
        const frame = this.atlas.frames[frameName];

        if (!frame) {
            throw new Error(`Frame "${frameName}" is not defined in the atlas.`);
        }

        const width = this.atlas.meta.size.w;
        const height = this.atlas.meta.size.h;

        this.texture.repeat.set(frame.w / width, frame.h / height);
        this.texture.offset.set(
            frame.x / width,
            1 - (frame.y + frame.h) / height
        );

        this.texture.needsUpdate = true;
    }
}
