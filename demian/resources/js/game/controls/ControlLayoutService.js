export const CONTROL_LAYOUTS = Object.freeze({
    MENU: Object.freeze({ id: 'none', joystick: false }),
    PAUSE: Object.freeze({ id: 'none', joystick: false }),
    OPEN_WORLD: Object.freeze({ id: 'world', joystick: true }),
    EVENT: Object.freeze({ id: 'event', joystick: true }),
    ROLE_PLAY: Object.freeze({ id: 'role-play', joystick: true }),
    HIDE_AND_SEEK: Object.freeze({ id: 'hide-and-seek', joystick: true }),
    TETRIS: Object.freeze({ id: 'tetris', joystick: false }),
});

/**
 * Maps semantic input contexts to mobile control surfaces. Existing world
 * controls remain markup-driven; future games can register their own surface.
 */
export default class ControlLayoutService {
    constructor({ root, eventTarget = typeof document !== 'undefined' ? document : null } = {}) {
        this.root = root;
        this.eventTarget = eventTarget;
        this.layouts = new Map(Object.entries(CONTROL_LAYOUTS));
        this.context = 'MENU';
        this.onContextChanged = this.onContextChanged.bind(this);
    }

    boot() {
        this.eventTarget?.addEventListener('input:context-changed', this.onContextChanged);
        this.apply(this.context);
    }

    register(context, layout) {
        if (!context || !layout?.id) {
            throw new TypeError('Control layout requires a context and id.');
        }

        this.layouts.set(context, Object.freeze({ ...layout }));
        return this;
    }

    onContextChanged(event) {
        this.apply(event.detail?.context ?? 'MENU');
    }

    apply(context) {
        this.context = context;
        const layout = this.layouts.get(context) ?? CONTROL_LAYOUTS.MENU;
        if (this.root) {
            this.root.dataset.controlLayout = layout.id;
            this.root.dataset.inputContext = context;
        }
        return layout;
    }

    dispose() {
        this.eventTarget?.removeEventListener('input:context-changed', this.onContextChanged);
    }
}
