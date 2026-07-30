const DEFAULT_ITEM_SELECTOR = '[data-scroll-rail-item]';

export function clampRailIndex(index, length) {
    const safeLength = Math.max(0, Number(length) || 0);
    if (safeLength === 0) return -1;
    const safeIndex = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : 0;
    return Math.min(safeLength - 1, Math.max(0, safeIndex));
}

export function nearestRailIndex(itemCenters, viewportCenter) {
    if (!Array.isArray(itemCenters) || itemCenters.length === 0) return -1;
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;

    itemCenters.forEach((center, index) => {
        const currentDistance = Math.abs(Number(center) - Number(viewportCenter));
        if (currentDistance < distance) {
            nearest = index;
            distance = currentDistance;
        }
    });

    return nearest;
}

/**
 * Progressive enhancement for native scroll-snap rails.
 *
 * CSS owns touch scrolling. This controller adds deterministic previous/next
 * controls, keyboard navigation, a position status and resilient refreshes
 * after asynchronous list rendering. It intentionally does not implement a
 * custom drag gesture, so nested buttons keep native click semantics.
 */
export default class ScrollSnapRail {
    constructor({
        viewport,
        itemSelector = DEFAULT_ITEM_SELECTOR,
        previousButton = null,
        nextButton = null,
        statusElement = null,
        focusSelector = 'button:not([disabled]):not([aria-disabled="true"]), [href], [tabindex]:not([tabindex="-1"])',
        onIndexChange = null,
    } = {}) {
        this.viewport = viewport ?? null;
        this.itemSelector = itemSelector;
        this.previousButton = previousButton;
        this.nextButton = nextButton;
        this.statusElement = statusElement;
        this.focusSelector = focusSelector;
        this.onIndexChange = onIndexChange;
        this.items = [];
        this.index = -1;
        this.frame = 0;
        this.resizeObserver = null;
        this.disposed = false;

        this.onScroll = this.onScroll.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onPrevious = this.onPrevious.bind(this);
        this.onNext = this.onNext.bind(this);
        this.onResize = this.onResize.bind(this);
    }

    boot() {
        if (!this.viewport || this.disposed) return this;

        this.viewport.dataset.scrollRail = 'ready';
        this.viewport.addEventListener('scroll', this.onScroll, { passive: true });
        this.viewport.addEventListener('keydown', this.onKeyDown);
        this.previousButton?.addEventListener('click', this.onPrevious);
        this.nextButton?.addEventListener('click', this.onNext);

        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(this.onResize);
            this.resizeObserver.observe(this.viewport);
        } else if (typeof window !== 'undefined') {
            window.addEventListener('resize', this.onResize, { passive: true });
        }

        this.refresh({ preserveIndex: false });
        return this;
    }

    refresh({ preserveIndex = true, preferredItem = null } = {}) {
        if (!this.viewport || this.disposed) return this;

        const previousIndex = this.index;
        this.items = Array.from(this.viewport.querySelectorAll(this.itemSelector));
        this.items.forEach((item, index) => {
            item.dataset.scrollRailItem = item.dataset.scrollRailItem || String(index);
            item.setAttribute('aria-posinset', String(index + 1));
            item.setAttribute('aria-setsize', String(this.items.length));
        });

        let nextIndex = preserveIndex ? clampRailIndex(previousIndex, this.items.length) : 0;
        if (preferredItem) {
            const preferredIndex = this.items.indexOf(preferredItem);
            if (preferredIndex >= 0) nextIndex = preferredIndex;
        }

        this.setIndex(nextIndex, { emit: false });
        if (preferredItem && nextIndex >= 0) {
            requestAnimationFrame(() => {
                if (!this.disposed) this.scrollTo(nextIndex, { behavior: 'auto' });
            });
        } else {
            this.updateFromGeometry({ emit: false });
        }
        return this;
    }

    onScroll() {
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            this.updateFromGeometry();
        });
    }

    onResize() {
        this.updateFromGeometry({ emit: false });
    }

    updateFromGeometry({ emit = true } = {}) {
        if (!this.viewport || this.items.length === 0) {
            this.setIndex(-1, { emit });
            return;
        }

        const viewportRect = this.viewport.getBoundingClientRect();
        const viewportCenter = viewportRect.left + (viewportRect.width / 2);
        const centers = this.items.map((item) => {
            const rect = item.getBoundingClientRect();
            return rect.left + (rect.width / 2);
        });
        this.setIndex(nearestRailIndex(centers, viewportCenter), { emit });
    }

    setIndex(index, { emit = true } = {}) {
        const nextIndex = clampRailIndex(index, this.items.length);
        const changed = nextIndex !== this.index;
        this.index = nextIndex;

        this.items.forEach((item, itemIndex) => {
            const current = itemIndex === nextIndex;
            item.classList.toggle('is-rail-current', current);
            item.setAttribute('aria-current', current ? 'true' : 'false');
        });

        const hasItems = this.items.length > 0;
        if (this.previousButton) this.previousButton.disabled = !hasItems || nextIndex <= 0;
        if (this.nextButton) this.nextButton.disabled = !hasItems || nextIndex >= this.items.length - 1;
        if (this.statusElement) {
            this.statusElement.textContent = hasItems ? `${nextIndex + 1} / ${this.items.length}` : '0 / 0';
        }
        this.viewport?.style.setProperty('--scroll-rail-progress', hasItems && this.items.length > 1
            ? String(nextIndex / (this.items.length - 1))
            : '0');

        if (changed && emit) this.onIndexChange?.(nextIndex, this.items[nextIndex] ?? null);
    }

    scrollTo(index, { behavior = 'smooth', focus = false } = {}) {
        const nextIndex = clampRailIndex(index, this.items.length);
        const item = this.items[nextIndex];
        if (!item) return false;

        this.setIndex(nextIndex);
        const targetLeft = Math.max(
            0,
            item.offsetLeft - ((this.viewport.clientWidth - item.clientWidth) / 2)
        );
        if (typeof this.viewport.scrollTo === 'function') {
            this.viewport.scrollTo({ left: targetLeft, top: this.viewport.scrollTop, behavior });
        } else {
            item.scrollIntoView?.({ behavior, block: 'nearest', inline: 'center' });
        }
        if (focus) {
            const focusTarget = item.matches(this.focusSelector)
                ? item
                : item.querySelector(this.focusSelector);
            focusTarget?.focus?.({ preventScroll: true });
        }
        return true;
    }

    onPrevious(event) {
        event?.preventDefault?.();
        this.scrollTo(this.index - 1, { focus: true });
    }

    onNext(event) {
        event?.preventDefault?.();
        this.scrollTo(this.index + 1, { focus: true });
    }

    onKeyDown(event) {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        const direction = typeof getComputedStyle === 'function'
            ? getComputedStyle(this.viewport).direction
            : 'ltr';
        const nextKey = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
        const previousKey = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
        let targetIndex = null;

        if (event.key === nextKey || event.key === 'ArrowDown' || event.key === 'PageDown') {
            targetIndex = this.index + 1;
        } else if (event.key === previousKey || event.key === 'ArrowUp' || event.key === 'PageUp') {
            targetIndex = this.index - 1;
        } else if (event.key === 'Home') {
            targetIndex = 0;
        } else if (event.key === 'End') {
            targetIndex = this.items.length - 1;
        }

        if (targetIndex === null) return;
        event.preventDefault();
        this.scrollTo(targetIndex, { focus: true });
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        if (this.frame) cancelAnimationFrame(this.frame);
        this.viewport?.removeEventListener('scroll', this.onScroll);
        this.viewport?.removeEventListener('keydown', this.onKeyDown);
        this.previousButton?.removeEventListener('click', this.onPrevious);
        this.nextButton?.removeEventListener('click', this.onNext);
        this.resizeObserver?.disconnect();
        if (!this.resizeObserver && typeof window !== 'undefined') {
            window.removeEventListener('resize', this.onResize);
        }
        this.items = [];
    }
}
