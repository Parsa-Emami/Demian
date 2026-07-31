import * as THREE from 'three';

const DIRECTION_FALLBACKS = Object.freeze({
    n: ['n', 'ne', 'nw'],
    ne: ['ne', 'e', 'n'],
    e: ['e', 'ne', 'se'],
    se: ['se', 'e', 's'],
    s: ['s', 'se', 'sw'],
    sw: ['sw', 'w', 's'],
    w: ['w', 'nw', 'sw'],
    nw: ['nw', 'w', 'n'],
});

const DEFAULT_ANIMATION_FALLBACKS = Object.freeze({
    breathe: 'idle',
    blink: 'idle',
    ready: 'idle',
    sprint: 'run',
    skid: 'run',
    turn: 'walk',
    takeoff: 'jump',
    fall: 'jump',
    land: 'jump',
    combo: 'attack',
    uppercut: 'attack',
    cast: 'attack',
    charge: 'idle',
    hurt: 'attack',
    slide: 'run',
    celebrate: 'win',
    salute: 'win',
    hover: 'jump',
    guitar: 'attack',
    guitar_loop: 'celebrate',
});

export default class SpriteAnimator {
    constructor(texture, atlas) {
        this.texture = texture;
        this.atlas = atlas;
        this.requestedAnimationName = null;
        this.animationName = null;
        this.animation = null;
        this.frameIndex = 0;
        this.elapsed = 0;
        this.finished = false;
        this.facing = 1;
        this.direction = 'e';
        this.playbackRate = 1;
        this.frameSerial = 0;

        this.texture.wrapS = THREE.ClampToEdgeWrapping;
        this.texture.wrapT = THREE.ClampToEdgeWrapping;
        this.texture.magFilter = THREE.NearestFilter;
        this.texture.minFilter = THREE.NearestFilter;
        this.texture.generateMipmaps = false;
        this.texture.colorSpace = THREE.SRGBColorSpace;
    }

    has(name) {
        return Boolean(this.atlas.animations?.[name]);
    }

    resolveName(name) {
        if (this.has(name)) {
            return name;
        }

        const manifestFallback = this.atlas.fallbacks?.[name];
        if (manifestFallback && this.has(manifestFallback)) {
            return manifestFallback;
        }

        const defaultFallback = DEFAULT_ANIMATION_FALLBACKS[name];
        if (defaultFallback && this.has(defaultFallback)) {
            return defaultFallback;
        }

        return this.has('idle') ? 'idle' : Object.keys(this.atlas.animations ?? {})[0];
    }

    play(name, { restart = false } = {}) {
        const resolvedName = this.resolveName(name);

        if (!resolvedName) {
            throw new Error('The atlas does not contain any playable animation.');
        }

        if (
            !restart &&
            this.requestedAnimationName === name &&
            this.animationName === resolvedName
        ) {
            return resolvedName;
        }

        const animation = this.atlas.animations[resolvedName];

        this.requestedAnimationName = name;
        this.animationName = resolvedName;
        this.animation = animation;
        this.frameIndex = 0;
        this.elapsed = 0;
        this.finished = false;
        this.frameSerial += 1;
        this.applyCurrentFrame();
        return resolvedName;
    }

    setFacing(direction) {
        const nextFacing = direction >= 0 ? 1 : -1;

        if (this.facing === nextFacing) {
            return;
        }

        this.facing = nextFacing;
        this.clampFrameIndex();
        this.applyCurrentFrame();
    }

    setDirection(direction) {
        if (!direction || this.direction === direction) {
            return;
        }

        this.direction = direction;
        this.clampFrameIndex();
        this.applyCurrentFrame();
    }

    setPlaybackRate(rate) {
        this.playbackRate = THREE.MathUtils.clamp(Number(rate) || 1, 0.25, 3.25);
    }

    clampFrameIndex() {
        const frames = this.currentFrames();
        this.frameIndex = Math.min(this.frameIndex, Math.max(frames.length - 1, 0));
    }

    framesForDirection(animation, direction) {
        const map = animation?.framesByDirection;

        if (!map || typeof map !== 'object') {
            return null;
        }

        const candidates = DIRECTION_FALLBACKS[direction] ?? [direction];

        for (const candidate of candidates) {
            if (Array.isArray(map[candidate]) && map[candidate].length > 0) {
                return map[candidate];
            }
        }

        return null;
    }

    currentFrames(animation = this.animation) {
        if (!animation) {
            return [];
        }

        const directional = this.framesForDirection(animation, this.direction);
        if (directional) {
            return directional;
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
            this.animation?.framesByDirection ||
            (this.animation?.framesRight?.length && this.animation?.framesLeft?.length)
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
        const frameDuration = 1 / (fps * this.playbackRate);
        this.elapsed += deltaTime;

        let safety = 0;
        while (this.elapsed >= frameDuration && safety < 12) {
            this.elapsed -= frameDuration;
            this.frameIndex += 1;
            safety += 1;

            if (this.frameIndex >= frames.length) {
                if (this.animation.loop !== false) {
                    this.frameIndex = 0;
                } else {
                    this.frameIndex = frames.length - 1;
                    this.finished = true;
                }
            }

            this.frameSerial += 1;
            this.applyCurrentFrame();
        }
    }

    duration(name) {
        const resolvedName = this.resolveName(name);
        const animation = this.atlas.animations?.[resolvedName];

        if (!animation) {
            return 0;
        }

        const frameCount = Math.max(
            animation.frames?.length ?? 0,
            animation.framesRight?.length ?? 0,
            animation.framesLeft?.length ?? 0,
            ...Object.values(animation.framesByDirection ?? {}).map((frames) =>
                Array.isArray(frames) ? frames.length : 0
            ),
            1
        );

        return frameCount / Math.max(Number(animation.fps) || 1, 1);
    }

    progress() {
        const frames = this.currentFrames();
        if (frames.length <= 1) {
            return this.finished ? 1 : 0;
        }

        return THREE.MathUtils.clamp(this.frameIndex / (frames.length - 1), 0, 1);
    }

    currentFrameName() {
        const frames = this.currentFrames();
        return frames[this.frameIndex] ?? frames[0] ?? null;
    }

    applyCurrentFrame() {
        if (!this.animation) {
            return;
        }

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
