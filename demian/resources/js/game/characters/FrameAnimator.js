import { sanitizeCharacterAnimation } from './CharacterVisualContract.js';

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
    tiptoe: 'walk',
    sprint: 'run',
    skid: 'run',
    turn: 'walk',
    takeoff: 'jump',
    hop: 'jump',
    hover: 'jump',
    fall: 'jump',
    land: 'jump',
    dash: 'run',
    slide: 'skid',
    dodge: 'hop',
    celebrate: 'win',
    salute: 'wave',
    guitar: 'dance',
    guitar_loop: 'dance',
});

export default class FrameAnimator {
    constructor(atlas) {
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
    }

    has(name) {
        const safeName = sanitizeCharacterAnimation(name);
        return Boolean(this.atlas.animations?.[safeName]);
    }

    resolveName(name) {
        const safeName = sanitizeCharacterAnimation(name);
        if (this.atlas.animations?.[safeName]) {
            return safeName;
        }

        const manifestFallback = sanitizeCharacterAnimation(this.atlas.fallbacks?.[safeName]);
        if (manifestFallback && this.atlas.animations?.[manifestFallback]) {
            return manifestFallback;
        }

        const defaultFallback = DEFAULT_ANIMATION_FALLBACKS[safeName];
        if (defaultFallback && this.atlas.animations?.[defaultFallback]) {
            return defaultFallback;
        }

        return this.atlas.animations?.idle
            ? 'idle'
            : Object.keys(this.atlas.animations ?? {})[0];
    }

    play(name, { restart = false } = {}) {
        const safeRequestedName = sanitizeCharacterAnimation(name);
        const resolvedName = this.resolveName(safeRequestedName);

        if (!resolvedName) {
            throw new Error('The atlas does not contain any playable animation.');
        }

        if (
            !restart &&
            this.requestedAnimationName === safeRequestedName &&
            this.animationName === resolvedName
        ) {
            return resolvedName;
        }

        this.requestedAnimationName = safeRequestedName;
        this.animationName = resolvedName;
        this.animation = this.atlas.animations[resolvedName];
        this.frameIndex = 0;
        this.elapsed = 0;
        this.finished = false;
        this.frameSerial += 1;
        this.applyCurrentFrame();
        return resolvedName;
    }

    setFacing(direction) {
        const nextFacing = direction >= 0 ? 1 : -1;
        if (this.facing === nextFacing) return;
        this.facing = nextFacing;
        this.clampFrameIndex();
        this.applyCurrentFrame();
    }

    setDirection(direction) {
        if (!direction || this.direction === direction) return;
        this.direction = direction;
        this.clampFrameIndex();
        this.applyCurrentFrame();
    }

    setPlaybackRate(rate) {
        this.playbackRate = Math.min(3.25, Math.max(0.25, Number(rate) || 1));
    }

    clampFrameIndex() {
        const frames = this.currentFrames();
        this.frameIndex = Math.min(this.frameIndex, Math.max(frames.length - 1, 0));
    }

    framesForDirection(animation, direction) {
        const map = animation?.framesByDirection;
        if (!map || typeof map !== 'object') return null;

        const candidates = DIRECTION_FALLBACKS[direction] ?? [direction];
        for (const candidate of candidates) {
            if (Array.isArray(map[candidate]) && map[candidate].length > 0) {
                return map[candidate];
            }
        }
        return null;
    }

    currentFrames(animation = this.animation) {
        if (!animation) return [];
        const directional = this.framesForDirection(animation, this.direction);
        if (directional) return directional;
        if (this.facing < 0 && Array.isArray(animation.framesLeft)) return animation.framesLeft;
        if (this.facing >= 0 && Array.isArray(animation.framesRight)) return animation.framesRight;
        return animation.frames ?? animation.framesRight ?? animation.framesLeft ?? [];
    }

    usesDirectionalFrames() {
        return Boolean(
            this.animation?.framesByDirection ||
            (this.animation?.framesRight?.length && this.animation?.framesLeft?.length)
        );
    }

    update(deltaTime) {
        if (!this.animation || this.finished) return;
        const frames = this.currentFrames();
        if (frames.length === 0) return;

        const fps = Math.max(Number(this.animation.fps) || 1, 1);
        const frameDuration = 1 / (fps * this.playbackRate);
        this.elapsed += Math.max(0, Number(deltaTime) || 0);

        let safety = 0;
        while (this.elapsed >= frameDuration && safety < 16) {
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
        if (!animation) return 0;

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
        if (frames.length <= 1) return this.finished ? 1 : 0;
        return Math.min(1, Math.max(0, this.frameIndex / (frames.length - 1)));
    }

    currentFrameName() {
        const frames = this.currentFrames();
        return frames[this.frameIndex] ?? frames[0] ?? null;
    }

    /**
     * Sub-frame progress (0..1) toward the next frame of the current
     * animation, based on elapsed time. Pure read-only math, no side
     * effects — safe to call every render tick. Used by renderers that
     * opt into cross-fading two consecutive frames for a smoother look
     * (see PixelActorRenderer.drawSpriteCharacter + atlas.render.frameBlend).
     */
    frameProgress() {
        if (!this.animation) return 0;
        const fps = Math.max(Number(this.animation.fps) || 1, 1);
        const frameDuration = 1 / (fps * this.playbackRate);
        if (!(frameDuration > 0)) return 0;
        return Math.min(1, Math.max(0, this.elapsed / frameDuration));
    }

    /**
     * Name of the frame that will play right after the current one, honoring
     * looping/clamping the same way update() does. Returns null when there is
     * no meaningful "next" frame (single-frame animation).
     */
    nextFrameName() {
        const frames = this.currentFrames();
        if (frames.length <= 1) return null;
        let nextIndex = this.frameIndex + 1;
        if (nextIndex >= frames.length) {
            nextIndex = this.animation?.loop !== false ? 0 : frames.length - 1;
        }
        return frames[nextIndex] ?? null;
    }

    applyCurrentFrame() {}
}
