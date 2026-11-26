import MasterMotionController from './motion/MasterMotionController.js';
import { motionCharacter } from './motion/MasterMotionLibrary.js';
import { sanitizeCharacterAnimation } from './CharacterVisualContract.js';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wrap = (value, length) => ((value % length) + length) % length;
const rateOf = animation => Math.max(1, finite(animation?.fps, 1));

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
    constructor(atlas, { sideView = false } = {}) {
        this.atlas = atlas;
        this.animations = sideView && atlas.sideViewAnimations
            ? { ...atlas.animations, ...atlas.sideViewAnimations }
            : atlas.animations;
        const slug = atlas.meta?.slug ?? atlas.meta?.name?.split('/')[0]?.trim().toLowerCase();
        this.masterMotion = motionCharacter(slug) ? new MasterMotionController(slug) : null;
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
        this.locomotionPhase = 0;
        this.locomotionFrequency = 0;
        this.motionState = null;
        this.previousSample = null;
    }

    has(name) {
        const safeName = sanitizeCharacterAnimation(name);
        return Boolean(this.animations?.[safeName]);
    }

    resolveName(name) {
        const safeName = sanitizeCharacterAnimation(name);
        if (this.animations?.[safeName]) {
            return safeName;
        }

        const declaredFallback = this.atlas.fallbacks?.[safeName];
        const manifestFallback = typeof declaredFallback === 'string' && declaredFallback.trim()
            ? sanitizeCharacterAnimation(declaredFallback) : null;
        if (manifestFallback && this.animations?.[manifestFallback]) {
            return manifestFallback;
        }

        let fallback = DEFAULT_ANIMATION_FALLBACKS[safeName];
        const visited = new Set([safeName]);
        while (fallback && !visited.has(fallback)) {
            if (this.animations?.[fallback]) return fallback;
            visited.add(fallback);
            fallback = DEFAULT_ANIMATION_FALLBACKS[fallback];
        }

        return this.animations?.idle
            ? 'idle'
            : Object.keys(this.animations ?? {})[0];
    }

    play(name, { restart = false, preservePhase = false } = {}) {
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

        const previousFrames = this.currentFrames();
        const previousPhase = preservePhase && previousFrames.length > 0
            ? Math.min(0.999999, Math.max(0, (this.frameIndex + this.frameProgress()) / previousFrames.length))
            : 0;
        const previousCycles = Math.max(1, Number(this.animation?.cycleCount) || 1);

        this.previousSample = null;
        this.requestedAnimationName = safeRequestedName;
        this.animationName = resolvedName;
        this.animation = this.animations[resolvedName];
        this.frameIndex = 0;
        this.elapsed = 0;
        this.finished = false;
        this.frameSerial += 1;

        if (preservePhase && previousFrames.length > 0) {
            const nextFrames = this.currentFrames();
            if (nextFrames.length > 0) {
                const nextCycles = Math.max(1, Number(this.animation.cycleCount) || 1);
                const phase = previousCycles === nextCycles ? previousPhase
                    : ((previousPhase * previousCycles) % 1) / nextCycles;
                const framePosition = phase * nextFrames.length;
                this.frameIndex = Math.min(nextFrames.length - 1, Math.floor(framePosition));
                const fps = rateOf(this.animation);
                const frameDuration = 1 / (fps * this.playbackRate);
                this.elapsed = (framePosition - this.frameIndex) * frameDuration;
            }
        }

        this.applyCurrentFrame();
        return resolvedName;
    }

    playbackSnapshot() {
        return {
            requested: this.requestedAnimationName ?? this.animationName ?? 'idle',
            frames: this.currentFrames().length,
            position: this.frameIndex + this.frameProgress(),
            loop: this.animation?.loop !== false,
            cycles: Math.max(1, finite(this.animation?.cycleCount, 1)),
            finished: this.finished,
            direction: this.direction,
            facing: this.facing,
            rate: this.playbackRate,
            locomotionPhase: this.locomotionPhase,
            locomotionFrequency: this.locomotionFrequency,
            motionState: this.motionState,
        };
    }

    restorePosition(snapshot, { matchStride = false } = {}) {
        const count = this.currentFrames().length;
        if (!this.animation || !count || !snapshot.frames) return;
        const loop = this.animation.loop !== false;
        let position;
        if (loop) {
            let phase = snapshot.position / snapshot.frames;
            const cycles = Math.max(1, finite(this.animation.cycleCount, 1));
            if (matchStride && snapshot.loop && cycles !== snapshot.cycles) {
                phase = wrap(phase * snapshot.cycles, 1) / cycles;
            }
            position = wrap(phase, 1) * count;
        } else if (snapshot.finished) {
            position = count - 1;
        } else if (snapshot.position >= snapshot.frames - 1) {
            position = count - 1 + clamp(snapshot.position - (snapshot.frames - 1), 0, .999999);
        } else {
            position = snapshot.position / Math.max(1, snapshot.frames - 1) * (count - 1);
        }
        this.frameIndex = clamp(Math.floor(position), 0, count - 1);
        this.elapsed = (position - this.frameIndex) / (rateOf(this.animation) * this.playbackRate);
        this.finished = !loop && snapshot.finished;
        this.previousSample = null;
        this.frameSerial += 1;
        this.applyCurrentFrame();
    }

    adoptPlaybackFrom(previous) {
        if (!previous) return this.play('idle');
        const snapshot = previous.playbackSnapshot();
        this.setDirection(snapshot.direction);
        this.setFacing(snapshot.facing);
        this.setPlaybackRate(snapshot.rate);
        const resolved = this.play(snapshot.requested, { restart: true });
        this.restorePosition(snapshot, { matchStride: true });
        this.locomotionPhase = snapshot.locomotionPhase;
        this.locomotionFrequency = snapshot.locomotionFrequency;
        this.motionState = snapshot.motionState;
        if (this.masterMotion && previous.masterMotion?.definition.slug === this.masterMotion.definition.slug) {
            this.masterMotion.adoptFrom(previous.masterMotion);
        }
        return resolved;
    }

    setFacing(direction) {
        const nextFacing = direction >= 0 ? 1 : -1;
        if (this.facing === nextFacing) return;
        const frames = this.currentFrames();
        const snapshot = this.playbackSnapshot();
        this.facing = nextFacing;
        if (frames !== this.currentFrames()) this.restorePosition(snapshot);
        else this.applyCurrentFrame();
    }

    setDirection(direction) {
        if (!direction || this.direction === direction) return;
        const frames = this.currentFrames();
        const snapshot = this.playbackSnapshot();
        this.direction = direction;
        if (frames !== this.currentFrames()) this.restorePosition(snapshot);
        else this.applyCurrentFrame();
    }

    setPlaybackRate(rate) {
        const next = clamp(finite(rate, 1) || 1, .25, 3.25);
        if (next === this.playbackRate) return;
        const progress = this.frameProgress();
        this.playbackRate = next;
        if (this.animation) this.elapsed = progress / (rateOf(this.animation) * next);
    }

    /** Sample a one-shot pose by physical progress, including after a held endpoint. */
    seek(progress) {
        const frames = this.currentFrames();
        if (!this.animation || frames.length === 0) return;
        const phase = clamp(finite(progress), 0, 1);
        if (this.previousSample) this.previousSample.clockDistance = null;
        const position = phase * (frames.length - 1);
        const index = Math.floor(position);
        if (index !== this.frameIndex) this.frameSerial += 1;
        this.frameIndex = index;
        this.elapsed = (position - index) / (rateOf(this.animation) * this.playbackRate);
        this.finished = this.animation.loop === false && phase === 1;
        this.applyCurrentFrame();
    }

    clampFrameIndex() {
        const frames = this.currentFrames();
        this.frameIndex = Math.min(this.frameIndex, Math.max(frames.length - 1, 0));
    }

    /** Continuous loop sampling keeps the fractional supporting-foot phase. */
    seekLoop(progress) {
        const frames = this.currentFrames();
        if (!this.animation || frames.length === 0) return;
        const phase = wrap(finite(progress), 1);
        if (this.previousSample) this.previousSample.clockDistance = null;
        const position = phase * frames.length, index = Math.floor(position);
        if (index !== this.frameIndex) this.frameSerial += 1;
        this.frameIndex = index;
        this.elapsed = (position - index) / (rateOf(this.animation) * this.playbackRate);
        this.finished = false;
        this.applyCurrentFrame();
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

        const fps = rateOf(this.animation);
        const frameDuration = 1 / (fps * this.playbackRate);
        // Character Core V4 stability fix: a stalled tab or long GC pause can
        // deliver a single huge deltaTime (seconds, not milliseconds). Without
        // a ceiling, the `while` loop below burns its `safety` budget catching
        // up and the animation visibly stutters/skips on the next few frames.
        // Clamping to 250ms means "at most ~a quarter-second of animation
        // catch-up per update()", which is unnoticeable in normal play
        // (frame deltas are ~0.016-0.033s) but keeps a resumed tab smooth.
        const MAX_FRAME_DELTA_SECONDS = 0.25;
        const safeDeltaTime = clamp(finite(deltaTime), 0, MAX_FRAME_DELTA_SECONDS);
        if (this.previousSample?.clockDistance != null) this.previousSample.clockDistance += safeDeltaTime / frameDuration;
        this.elapsed += safeDeltaTime;

        const steps = Math.floor(this.elapsed / frameDuration);
        if (steps === 0) return;
        this.elapsed -= steps * frameDuration;
        const next = this.frameIndex + steps;
        if (this.animation.loop !== false) this.frameIndex = next % frames.length;
        else {
            this.frameIndex = Math.min(next, frames.length - 1);
            this.finished = next >= frames.length;
            if (this.finished) this.elapsed = 0;
        }
        this.frameSerial += this.animation.loop !== false ? steps : Math.min(steps, Math.max(0, frames.length - 1 - (next - steps)));
        this.applyCurrentFrame();
    }

    duration(name) {
        const resolvedName = this.resolveName(name);
        const animation = this.animations?.[resolvedName];
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
        return frameCount / rateOf(animation);
    }

    progress() {
        const frames = this.currentFrames();
        if (frames.length <= 1) return this.finished ? 1 : 0;
        return Math.min(1, Math.max(0, this.frameIndex / (frames.length - 1)));
    }

    continuousProgress() {
        const count = this.currentFrames().length;
        if (count <= 1) return this.finished ? 1 : 0;
        if (this.finished) return 1;
        const divisor = this.animation?.loop !== false ? count : count - 1;
        return clamp((this.frameIndex + this.frameProgress()) / divisor, 0, 1);
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
        const fps = rateOf(this.animation);
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

    captureStep() {
        this.previousSample = {
            frames: this.currentFrames(),
            animation: this.animation,
            position: this.frameIndex + this.frameProgress(),
            clockDistance: 0,
        };
    }

    sample(alpha = 1) {
        const frames = this.currentFrames();
        if (!frames.length) return { frameName: null, nextFrameName: null, progress: 0 };
        const current = this.frameIndex + this.frameProgress();
        const previous = this.previousSample;
        const t = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
        let position = current;
        if (previous?.frames === frames && previous.animation === this.animation) {
            let distance = current - previous.position;
            if (this.animation.loop !== false) {
                if (previous.clockDistance != null) distance = previous.clockDistance;
                else if (distance < 0) distance += frames.length;
            }
            position = t === 1 ? current : previous.position + distance * t;
        }
        position = this.animation?.loop !== false
            ? ((position % frames.length) + frames.length) % frames.length
            : Math.min(frames.length - 1, Math.max(0, position));
        const index = Math.floor(position);
        const next = index + 1 < frames.length ? index + 1 : this.animation?.loop !== false ? 0 : index;
        return { frameName: frames[index], nextFrameName: frames[next], progress: position - index };
    }

    applyCurrentFrame() {}
}
