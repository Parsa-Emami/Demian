/**
 * Frame pacing concerns presentation only. The shared runtime continues its
 * deterministic 60 Hz fixed simulation even at a 30 Hz presentation cap.
 * The menu/backdrop never needs a full 60 Hz canvas compositing budget.
 */
export function resolveRenderFrameRate({
    preference = 'auto',
    economical = false,
    sessionState = 'playing',
} = {}) {
    const requested = preference === '30' || preference === 30 ? 30
        : preference === '60' || preference === 60 ? 60
            : economical ? 30 : 60;
    // Non-interactive states include menu, loading, paused, and results.
    // The runtime itself cancels animation frames in paused/results states.
    return sessionState === 'playing' ? requested : Math.min(requested, 30);
}
