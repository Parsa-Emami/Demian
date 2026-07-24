const STORAGE_KEY = 'demian.characterManager.sidebar';

export default class SidebarController {
    constructor({ root, storageKey = STORAGE_KEY }) {
        if (!(root instanceof HTMLElement)) {
            throw new Error('Sidebar root was not found.');
        }

        this.root = root;
        this.storageKey = storageKey;
        this.sidebar = root.querySelector('[data-manager-sidebar]');
        this.toggleButtons = Array.from(
            root.querySelectorAll('[data-sidebar-toggle]')
        );

        this.onToggle = this.onToggle.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);

        this.state = this.readState();
    }

    boot() {
        if (!this.sidebar || this.toggleButtons.length === 0) {
            return;
        }

        this.toggleButtons.forEach((button) => {
            button.addEventListener('click', this.onToggle);
        });

        window.addEventListener('keydown', this.onKeyDown);
        this.applyState({ animate: false });
    }

    onToggle() {
        this.state = this.state === 'expanded' ? 'collapsed' : 'expanded';
        this.persistState();
        this.applyState({ animate: true });
    }

    onKeyDown(event) {
        if (event.key.toLowerCase() !== 'm' || event.repeat) {
            return;
        }

        const target = event.target;
        const isTyping =
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement ||
            target?.isContentEditable;

        if (isTyping) {
            return;
        }

        event.preventDefault();
        this.onToggle();
    }

    applyState({ animate }) {
        this.root.dataset.sidebarState = this.state;
        this.sidebar.dataset.sidebarState = this.state;

        const expanded = this.state === 'expanded';

        this.toggleButtons.forEach((button) => {
            button.setAttribute('aria-expanded', String(expanded));
            button.setAttribute(
                'aria-label',
                expanded ? 'جمع‌کردن سایدبار' : 'بازکردن سایدبار'
            );
            button.title = expanded
                ? 'جمع‌کردن مدیریت کاراکترها (M)'
                : 'بازکردن مدیریت کاراکترها (M)';

            const icon = button.querySelector('[data-sidebar-toggle-icon]');
            const label = button.querySelector('[data-sidebar-toggle-label]');

            if (icon) {
                icon.textContent = expanded ? '‹' : '›';
            }

            if (label) {
                label.textContent = expanded ? 'جمع‌کردن' : 'بازکردن';
            }
        });

        this.root.dispatchEvent(
            new CustomEvent('sidebar:changed', {
                detail: { state: this.state, expanded },
            })
        );

        const delay = animate ? 340 : 0;

        window.setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, delay);
    }

    readState() {
        try {
            const saved = window.localStorage.getItem(this.storageKey);
            return saved === 'collapsed' ? 'collapsed' : 'expanded';
        } catch {
            return 'expanded';
        }
    }

    persistState() {
        try {
            window.localStorage.setItem(this.storageKey, this.state);
        } catch {
            // Storage can be unavailable in private or restricted environments.
        }
    }

    dispose() {
        this.toggleButtons.forEach((button) => {
            button.removeEventListener('click', this.onToggle);
        });

        window.removeEventListener('keydown', this.onKeyDown);
    }
}
