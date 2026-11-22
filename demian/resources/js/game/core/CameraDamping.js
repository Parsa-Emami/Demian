/** Frame-rate-independent camera interpolation that cannot overshoot after sleep. */
export function safeCameraDamping(rate, dt) {
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(dt) || dt <= 0) return 0;
    return 1 - Math.exp(-rate * Math.min(dt, 0.15));
}
