/**
 * Semantic UI layers shared by Blade markup and dynamically mounted game UI.
 * Values map to selectors in resources/css/layers.css.
 */
export const UI_LAYER = Object.freeze({
    STAGE: 'stage',
    CANVAS: 'canvas',
    STAGE_EFFECT: 'stage-effect',
    HUD: 'hud',
    PROMPT: 'prompt',
    CONTROLS: 'controls',
    GAME_OVERLAY: 'game-overlay',
    SHELL: 'shell',
    STAGE_SYSTEM: 'stage-system',
    SIDEBAR_BACKDROP: 'sidebar-backdrop',
    SIDEBAR: 'sidebar',
    SIDEBAR_CONTROL: 'sidebar-control',
    SYSTEM_OVERLAY: 'system-overlay',
    TOAST: 'toast',
    SHELL_SCREEN: 'shell-screen',
    SHELL_MODAL: 'shell-modal',
    SHELL_TOAST: 'shell-toast',
    LOCAL_BASE: 'local-base',
    LOCAL_RAISED: 'local-raised',
    LOCAL_CONTROL: 'local-control',
    LOCAL_STICKY: 'local-sticky',
});

const VALID_LAYERS = new Set(Object.values(UI_LAYER));

export function assignUiLayer(element, layer) {
    if (!element?.dataset) {
        throw new TypeError('assignUiLayer requires an element with a dataset.');
    }
    if (!VALID_LAYERS.has(layer)) {
        throw new RangeError(`Unknown Demian UI layer: ${String(layer)}`);
    }
    element.dataset.uiLayer = layer;
    return element;
}

export function uiLayerOf(element) {
    return element?.dataset?.uiLayer ?? null;
}

export function isUiLayer(value) {
    return VALID_LAYERS.has(value);
}
