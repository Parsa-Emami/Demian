const STORAGE_KEY = 'demian.characterManager.sidebar';

export default class SidebarController {
    constructor({ root, storageKey = STORAGE_KEY }) {
        if (!(root instanceof HTMLElement)) {
            throw new Error('Sidebar root was not found.');
        }

        this.root = root;
        this.storageKey = storageKey;
        this.sidebar = root.querySelector('[data-manager-sidebar]');
        this.backdrop = root.querySelector('[data-sidebar-backdrop]');
        this.toggleButtons = Array.from(root.querySelectorAll('[data-sidebar-toggle]'));
        this.mobileQuery = window.matchMedia('(max-width: 1023px)');

        this.onToggle = this.onToggle.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onBackdrop = this.onBackdrop.bind(this);
        this.onBreakpointChange = this.onBreakpointChange.bind(this);

        this.state = this.readState();
    }

    boot() {
        if (!this.sidebar || this.toggleButtons.length === 0) {
            return;
        }

        this.toggleButtons.forEach((button) => button.addEventListener('click', this.onToggle));
        this.backdrop?.addEventListener('click', this.onBackdrop);
        window.addEventListener('keydown', this.onKeyDown);
        this.mobileQuery.addEventListener?.('change', this.onBreakpointChange);
        this.applyState({ animate: false });
    }

    onToggle() {
        this.state = this.state === 'expanded' ? 'collapsed' : 'expanded';
        this.persistState();
        this.applyState({ animate: true });
    }

    onBackdrop() {
        if (this.state !== 'collapsed') {
            this.state = 'collapsed';
            this.persistState();
            this.applyState({ animate: true });
        }
    }

    onBreakpointChange(event) {
        if (event.matches) {
            this.state = 'collapsed';
        } else {
            this.state = this.readDesktopState();
        }
        this.applyState({ animate: false });
    }

    onKeyDown(event) {
        const key = event.key.toLowerCase();
        if ((key !== 'm' && key !== 'escape') || event.repeat) {
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

        if (key === 'escape' && this.state === 'collapsed') {
            return;
        }

        event.preventDefault();
        if (key === 'escape') {
            this.state = 'collapsed';
            this.persistState();
            this.applyState({ animate: true });
        } else {
            this.onToggle();
        }
    }

    applyState({ animate }) {
        this.root.dataset.sidebarState = this.state;
        this.sidebar.dataset.sidebarState = this.state;

        const expanded = this.state === 'expanded';
        const mobile = this.mobileQuery.matches;
        document.body.classList.toggle('has-mobile-sheet', mobile && expanded);
        this.backdrop?.setAttribute('aria-hidden', String(!(mobile && expanded)));
        this.sidebar.setAttribute('aria-hidden', String(mobile && !expanded));

        this.toggleButtons.forEach((button) => {
            button.setAttribute('aria-expanded', String(expanded));
            button.setAttribute('aria-label', expanded ? 'بستن مدیریت کاراکترها' : 'بازکردن مدیریت کاراکترها');
            button.title = expanded ? 'بستن مدیریت کاراکترها (M)' : 'بازکردن مدیریت کاراکترها (M)';

            const icon = button.querySelector('[data-sidebar-toggle-icon]');
            const label = button.querySelector('[data-sidebar-toggle-label]');
            if (icon) {
                icon.textContent = mobile ? (expanded ? '×' : '☰') : (expanded ? '‹' : '›');
            }
            if (label) {
                label.textContent = expanded ? 'بستن' : 'کاراکترها';
            }
        });

        this.root.dispatchEvent(new CustomEvent('sidebar:changed', {
            detail: { state: this.state, expanded, mobile },
        }));

        window.setTimeout(() => window.dispatchEvent(new Event('resize')), animate ? 360 : 0);
    }

    readDesktopState() {
        try {
            return window.localStorage.getItem(this.storageKey) === 'collapsed' ? 'collapsed' : 'expanded';
        } catch {
            return 'expanded';
        }
    }

    readState() {
        return this.mobileQuery.matches ? 'collapsed' : this.readDesktopState();
    }

    persistState() {
        if (this.mobileQuery.matches) {
            return;
        }

        try {
            window.localStorage.setItem(this.storageKey, this.state);
        } catch {
            // Storage can be unavailable in private or restricted environments.
        }
    }

    dispose() {
        this.toggleButtons.forEach((button) => button.removeEventListener('click', this.onToggle));
        this.backdrop?.removeEventListener('click', this.onBackdrop);
        window.removeEventListener('keydown', this.onKeyDown);
        this.mobileQuery.removeEventListener?.('change', this.onBreakpointChange);
    }
}
