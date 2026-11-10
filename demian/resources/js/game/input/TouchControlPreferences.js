const OPTIONS = {
    touchStickMode: ['fixed', 'floating'],
    touchHand: ['right', 'left'],
    touchVisibility: ['auto', 'always', 'hidden'],
    touchRunMode: ['hold', 'toggle'],
    touchSlideMode: ['hold', 'toggle'],
};

const RANGES = {
    touchStickSize: [80, 120, 100],
    touchButtonSize: [90, 120, 100],
    touchOpacity: [55, 100, 100],
    touchSensitivity: [60, 160, 100],
    touchDeadZone: [0, 30, 10],
    touchStickInset: [0, 32, 0],
    touchButtonInset: [0, 32, 0],
    touchStickLift: [0, 64, 0],
    touchButtonLift: [0, 64, 0],
};

const SWITCHES = ['touchAutoSprint', 'touchHaptics'];

export const DEFAULT_TOUCH_CONTROLS = Object.freeze({
    ...Object.fromEntries(Object.entries(OPTIONS).map(([key, options]) => [key, options[0]])),
    ...Object.fromEntries(Object.entries(RANGES).map(([key, [, , value]]) => [key, value])),
    ...Object.fromEntries(SWITCHES.map(key => [key, true])),
});

export function normalizeTouchControls(source) {
    const next = { ...DEFAULT_TOUCH_CONTROLS };
    for (const [key, choices] of Object.entries(OPTIONS)) {
        if (choices.includes(source[key])) next[key] = source[key];
    }
    for (const [key, [min, max]] of Object.entries(RANGES)) {
        if (Number.isFinite(source[key])) next[key] = Math.max(min, Math.min(max, Math.round(source[key])));
    }
    for (const key of SWITCHES) {
        if (typeof source[key] === 'boolean') next[key] = source[key];
    }
    return next;
}

export function readTouchControls(form) {
    const values = {};
    for (const key of Object.keys(OPTIONS)) values[key] = form.get(key);
    for (const key of Object.keys(RANGES)) {
        if (form.has(key)) values[key] = Number(form.get(key));
    }
    for (const key of SWITCHES) values[key] = form.has(key);
    return normalizeTouchControls(values);
}

export function applyTouchControlLayout(element, controls) {
    if (!element) return;
    element.dataset.touchHand = controls.touchHand;
    element.dataset.touchStickMode = controls.touchStickMode;
    element.dataset.touchRunMode = controls.touchRunMode;
    element.dataset.touchSlideMode = controls.touchSlideMode;
    element.style.setProperty('--touch-stick-scale', controls.touchStickSize / 100);
    element.style.setProperty('--touch-button-scale', controls.touchButtonSize / 100);
    element.style.setProperty('--touch-opacity', controls.touchOpacity / 100);
    element.style.setProperty('--touch-stick-inset', `${controls.touchStickInset}px`);
    element.style.setProperty('--touch-button-inset', `${controls.touchButtonInset}px`);
    element.style.setProperty('--touch-stick-lift', `${controls.touchStickLift}px`);
    element.style.setProperty('--touch-button-lift', `${controls.touchButtonLift}px`);
}
