export function readStick(dx, dy, radius, deadZone, sensitivity) {
    const length = Math.hypot(dx, dy);
    const reach = Math.min(1, length / radius);
    const magnitude = Math.pow(Math.max(0, (reach - deadZone) / (1 - deadZone)), 1 / sensitivity);
    const directionX = length ? dx / length : 0;
    const directionY = length ? dy / length : 0;
    return { x: directionX * magnitude, z: directionY * magnitude, magnitude,
        offsetX: directionX * reach * radius, offsetY: directionY * reach * radius };
}

export default class TouchStick {
    constructor(zone, router) {
        this.zone = zone;
        this.base = zone.querySelector('[data-virtual-stick]');
        this.knob = this.base.querySelector('[data-virtual-stick-knob]');
        this.router = router;
        this.value = { x: 0, z: 0, magnitude: 0 };
        this.gesture = null;
        this.listeners = {
            pointerdown: event => this.press(event),
            pointermove: event => this.move(event),
            pointerup: event => this.release(event),
            pointercancel: event => this.release(event),
            lostpointercapture: event => this.release(event),
        };
        for (const [type, listener] of Object.entries(this.listeners)) zone.addEventListener(type, listener);
    }

    press(event) {
        if (event.button !== 0 || this.gesture || !this.router.context?.analog || this.router.touchBlocked()) return;
        const controls = this.router.touchControls;
        const floating = controls.touchStickMode === 'floating';
        if (!floating && !this.base.contains(event.target)) return;
        const bounds = this.base.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const rotated = this.router.touchRoot.dataset.forcedLandscape === 'true';
        const centerX = bounds.left + bounds.width / 2;
        const centerY = bounds.top + bounds.height / 2;
        const radius = Math.min(bounds.width, bounds.height) * .36;
        this.gesture = { id: event.pointerId, radius, rotated,
            x: floating ? event.clientX : centerX, y: floating ? event.clientY : centerY };
        if (floating) {
            const zone = this.zone.getBoundingClientRect();
            const x = Math.max(zone.left + bounds.width / 2, Math.min(zone.right - bounds.width / 2, event.clientX)) - centerX;
            const y = Math.max(zone.top + bounds.height / 2, Math.min(zone.bottom - bounds.height / 2, event.clientY)) - centerY;
            this.base.style.setProperty('--stick-origin-x', `${rotated ? y : x}px`);
            this.base.style.setProperty('--stick-origin-y', `${rotated ? -x : y}px`);
        }
        this.zone.setPointerCapture?.(event.pointerId);
        this.base.classList.add('is-active');
        this.move(event);
        event.stopPropagation();
    }

    move(event) {
        const gesture = this.gesture;
        if (gesture?.id !== event.pointerId) return;
        event.preventDefault();
        const dx = event.clientX - gesture.x;
        const dy = event.clientY - gesture.y;
        const controls = this.router.touchControls;
        const { x, z, magnitude, offsetX, offsetY } = readStick(
            gesture.rotated ? dy : dx, gesture.rotated ? -dx : dy, gesture.radius,
            controls.touchDeadZone / 100, controls.touchSensitivity / 100,
        );
        Object.assign(this.value, { x, z, magnitude });
        this.knob.style.setProperty('--stick-x', `${offsetX}px`);
        this.knob.style.setProperty('--stick-y', `${offsetY}px`);
        this.base.style.setProperty('--stick-force', magnitude.toFixed(3));
    }

    release(event) {
        if (this.gesture?.id === event.pointerId) this.reset();
    }

    reset() {
        if (!this.gesture) return;
        const { id } = this.gesture;
        this.gesture = null;
        Object.assign(this.value, { x: 0, z: 0, magnitude: 0 });
        if (this.zone.hasPointerCapture?.(id)) this.zone.releasePointerCapture(id);
        this.base.classList.remove('is-active');
        for (const property of ['--stick-force', '--stick-origin-x', '--stick-origin-y']) this.base.style.removeProperty(property);
        this.knob.style.removeProperty('--stick-x');
        this.knob.style.removeProperty('--stick-y');
    }

    dispose() {
        this.reset();
        for (const [type, listener] of Object.entries(this.listeners)) this.zone.removeEventListener(type, listener);
    }
}
