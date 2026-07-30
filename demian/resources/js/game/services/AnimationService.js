const ANIME_ESM_URL = 'https://cdn.jsdelivr.net/npm/animejs@4.5.0/+esm';

function resolveTargets(targets) {
    if (typeof targets === 'string') {
        return [...document.querySelectorAll(targets)];
    }

    if (targets instanceof Element) {
        return [targets];
    }

    return [...(targets ?? [])].filter((target) => target instanceof Element);
}

function toKeyframes(parameters) {
    const from = {};
    const to = {};

    if (Array.isArray(parameters.opacity)) {
        [from.opacity, to.opacity] = parameters.opacity;
    } else if (parameters.opacity !== undefined) {
        to.opacity = parameters.opacity;
    }

    if (Array.isArray(parameters.y)) {
        from.transform = `translateY(${parameters.y[0]}px)`;
        to.transform = `translateY(${parameters.y[1]}px)`;
    }

    return [from, to];
}

/**
 * Central Anime.js facade for shell and HUD motion.
 *
 * Anime.js is loaded from the pinned ESM CDN documented by Anime.js. A tiny
 * WAAPI fallback keeps the game usable if the animation CDN is unavailable.
 * Game-domain logic never imports an animation engine directly.
 */
export default class AnimationService {
    constructor({ reducedMotion = false } = {}) {
        this.reducedMotion = reducedMotion;
        this.module = null;
        this.loadPromise = null;
        this.instances = new Set();
    }

    setReducedMotion(value) {
        this.reducedMotion = Boolean(value);
        return this;
    }

    async finished(instance) {
        if (!instance) {
            return;
        }

        const completion = instance.finished ?? (typeof instance.then === 'function' ? instance : null);
        try {
            await completion;
        } catch {
            // Cancellation is an expected outcome during screen replacement.
        }
    }

    async boot() {
        if (!this.loadPromise) {
            this.loadPromise = import(/* @vite-ignore */ ANIME_ESM_URL)
                .then((module) => {
                    this.module = module;
                    return module;
                })
                .catch((error) => {
                    console.warn('Anime.js CDN was unavailable; WAAPI fallback is active.', error);
                    return null;
                });
        }

        return this.loadPromise;
    }

    track(instance) {
        if (!instance) {
            return instance;
        }

        this.instances.add(instance);
        const completion = instance.finished ?? instance;
        completion?.then?.(
            () => this.instances.delete(instance),
            () => this.instances.delete(instance)
        );
        return instance;
    }

    animate(targets, parameters = {}) {
        const settings = this.reducedMotion
            ? { ...parameters, duration: 0, delay: 0 }
            : parameters;

        if (this.module?.animate) {
            return this.track(this.module.animate(targets, settings));
        }

        const elements = resolveTargets(targets);
        const keyframes = toKeyframes(settings);
        const animations = elements
            .map((element, index) => {
                const delay = typeof settings.delay === 'function'
                    ? settings.delay(element, index, elements.length)
                    : Number(settings.delay ?? 0);

                if (typeof element.animate !== 'function') {
                    Object.assign(element.style, keyframes.at(-1));
                    return null;
                }

                return element.animate(keyframes, {
                    duration: Number(settings.duration ?? 300),
                    delay,
                    easing: 'cubic-bezier(.22,1,.36,1)',
                    fill: 'both',
                });
            })
            .filter(Boolean);

        const group = {
            animations,
            finished: Promise.all(animations.map((animation) => animation.finished)),
            cancel: () => animations.forEach((animation) => animation.cancel()),
        };
        return this.track(group);
    }

    timeline(parameters = {}) {
        if (this.module?.createTimeline) {
            const settings = this.reducedMotion
                ? {
                    ...parameters,
                    defaults: {
                        ...(parameters.defaults ?? {}),
                        duration: 0,
                        delay: 0,
                    },
                }
                : parameters;
            return this.track(this.module.createTimeline(settings));
        }

        const queue = [];
        const fallbackTimeline = {
            add: (targets, animationParameters) => {
                const animation = this.animate(targets, animationParameters);
                queue.push(animation);
                return fallbackTimeline;
            },
            call: (callback) => {
                callback?.();
                return fallbackTimeline;
            },
            cancel: () => {
                queue.forEach((animation) => animation?.cancel?.());
                queue.length = 0;
            },
        };
        return fallbackTimeline;
    }

    reveal(target, { duration = 360 } = {}) {
        if (!target) {
            return null;
        }

        return this.animate(target, {
            opacity: [0, 1],
            duration,
            ease: 'out(3)',
        });
    }

    revealItems(targets, { duration = 280, delay = 35 } = {}) {
        const stagger = this.module?.stagger
            ? this.module.stagger(delay)
            : (_target, index) => index * delay;

        return this.animate(targets, {
            opacity: [0, 1],
            y: [8, 0],
            duration,
            delay: this.reducedMotion ? 0 : stagger,
            ease: 'out(3)',
        });
    }

    cancelAll() {
        this.instances.forEach((instance) => instance.cancel?.());
        this.instances.clear();
    }

    dispose() {
        this.cancelAll();
    }
}
