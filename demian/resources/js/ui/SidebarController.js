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
        this.onCharacterActivated = this.onCharacterActivated.bind(this);

        this.state = this.readState();
    }

    boot() {
        if (!this.sidebar || this.toggleButtons.length === 0) {
            return;
        }

        this.toggleButtons.forEach((button) => button.addEventListener('click', this.onToggle));
        this.backdrop?.addEventListener('click', this.onBackdrop);
        this.root.addEventListener('character-ui:activated', this.onCharacterActivated);
        window.addEventListener('keydown', this.onKeyDown);
        this.mobileQuery.addEventListener?.('change', this.onBreakpointChange);
        this.applyState({ animate: false });
    }

    onToggle() {
        if (this.state !== 'expanded') this.lastOpener = document.activeElement;
        this.state = this.state === 'expanded' ? 'collapsed' : 'expanded';
        this.persistState();
        this.applyState({ animate: true });
        if (this.state === 'expanded') this.sidebar.querySelector('.character-sheet-close')?.focus({ preventScroll: true });
    }

    onBackdrop() {
        if (this.state !== 'collapsed') {
            this.state = 'collapsed';
            this.persistState();
            this.applyState({ animate: true });
        }
    }


    onCharacterActivated() {
        if (!this.mobileQuery.matches || this.state !== 'expanded') return;
        window.setTimeout(() => {
            this.state = 'collapsed';
            this.applyState({ animate: true });
        }, 120);
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
        if (event.key === 'Tab' && this.state === 'expanded') {
            const buttons = [...this.sidebar.querySelectorAll('button, input, select, [tabindex="0"]')].filter(e => !e.disabled && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
            const first = buttons[0], last = buttons.at(-1);
            if (first && (!this.sidebar.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))) {
                event.preventDefault(); (event.shiftKey ? last : first).focus({ preventScroll: true });
            }
            return;
        }
        const key = event.key.toLowerCase();
        if ((key !== 'p' && key !== 'escape') || event.repeat) {
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
        const content = this.sidebar.querySelector('.sidebar-expanded-content');
        if (content) content.inert = !expanded;
        this.backdrop?.setAttribute('aria-hidden', String(!(mobile && expanded)));
        this.sidebar.setAttribute('aria-hidden', String(!expanded));

        this.toggleButtons.forEach((button) => {
            button.setAttribute('aria-expanded', String(expanded));
            button.setAttribute('aria-label', expanded ? 'بستن مدیریت کاراکترها' : 'بازکردن مدیریت کاراکترها');
            button.title = expanded ? 'بستن مدیریت کاراکترها (P)' : 'بازکردن مدیریت کاراکترها (P)';

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

        if (!expanded && this.lastOpener?.isConnected) this.lastOpener.focus({ preventScroll: true });
        window.setTimeout(() => window.dispatchEvent(new Event('resize')), animate ? 360 : 0);
    }

    readDesktopState() {
        try {
            return window.localStorage.getItem(this.storageKey) === 'expanded' ? 'expanded' : 'collapsed';
        } catch {
            return 'collapsed';
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
        this.root.removeEventListener('character-ui:activated', this.onCharacterActivated);
        window.removeEventListener('keydown', this.onKeyDown);
        this.mobileQuery.removeEventListener?.('change', this.onBreakpointChange);
    }
}
