/**
 * Mobile-07: install/update the small, scoped offline-fallback worker.
 * Never force a reload while a ranked run is in progress. Players explicitly
 * activate a waiting release from the menu; session data stays untouched.
 */
export default function registerDemianPwa({
    app,
    documentRef = globalThis.document,
    navigatorRef = globalThis.navigator,
    locationRef = globalThis.location,
} = {}) {
    const enabled = documentRef?.querySelector('meta[name="demian-static-release"]')
        ?.getAttribute('content') === 'true';
    if (!enabled || !globalThis.isSecureContext || !navigatorRef?.serviceWorker ||
        !documentRef?.baseURI) return Promise.resolve(null);

    const workerURL = new URL('service-worker.js', documentRef.baseURI);
    const scope = new URL('./', documentRef.baseURI);
    if (workerURL.origin !== locationRef?.origin || scope.origin !== locationRef?.origin) {
        return Promise.resolve(null);
    }
    return navigatorRef.serviceWorker.register(workerURL.href, {
        scope: scope.pathname,
        updateViaCache: 'none',
    }).then(registration => {
        let accepted = false;
        let reloadPending = false;
        let disposed = false;
        const safeToReload = () => !disposed && app?.sessionState === 'menu'
            && !app?.leaderboards?.pending && !app?.runtime?.faulted;
        const view = documentRef.defaultView;
        const onOnline = () => {
            if (app?.sessionState === 'menu' && app?.leaderboards?.pending) {
                void app.leaderboards.retry();
            }
        };
        view?.addEventListener('online', onOnline);
        // An actionable notice belongs to an explicit, scrollable screen.
        // It must never be a body-level overlay or a competing grid child.
        const host = documentRef.querySelector('[data-pwa-update-host]');
        const entry = documentRef.querySelector('[data-screen="cafe-menu"] [data-shell-action="play"]');
        let toast = null;
        const cleanToast = () => {
            toast?.remove(); toast = null;
            entry?.removeAttribute('data-pwa-update-ready');
        };
        const showUpdate = () => {
            if (!host || !registration.waiting || !safeToReload() || toast) return;
            toast = documentRef.createElement('aside');
            toast.className = 'demian-pwa-update';
            toast.dataset.uiNotice = 'inline-action';
            toast.setAttribute('role', 'group');
            toast.setAttribute('aria-label', 'به‌روزرسانی دمیان');
            const text = documentRef.createElement('span');
            text.setAttribute('role', 'status');
            text.textContent = 'نسخهٔ جدید دمیان آماده است.';
            const button = documentRef.createElement('button');
            button.type = 'button';
            button.textContent = 'به‌روزرسانی';
            button.addEventListener('click', () => {
                if (!safeToReload() || !registration.waiting || accepted
                    || toast?.closest('[hidden], [inert], [aria-hidden="true"]')) return;
                accepted = true;
                button.disabled = true;
                registration.waiting.postMessage({ type: 'DEMIAN_ACTIVATE_UPDATE' });
            });
            toast.append(text, button);
            host.append(toast);
            entry?.setAttribute('data-pwa-update-ready', 'true');
        };
        const onSession = () => {
            if (reloadPending && safeToReload()) {
                reloadPending = false;
                locationRef.reload(); return;
            }
            if (safeToReload()) showUpdate();
            else cleanToast();
        };
        const onController = () => {
            if (!accepted) return;
            if (safeToReload()) locationRef.reload();
            else reloadPending = true;
        };
        const onInstalling = () => {
            const worker = registration.installing;
            worker?.addEventListener('statechange', () => {
                if (worker.state === 'installed') showUpdate();
            });
        };
        registration.addEventListener('updatefound', onInstalling);
        navigatorRef.serviceWorker.addEventListener('controllerchange', onController);
        const unsubscribe = app?.eventBus?.on?.('session:changed', onSession);
        if (registration.installing) onInstalling();
        showUpdate();
        return {
            registration,
            dispose() {
                disposed = true;
                view?.removeEventListener('online', onOnline);
                unsubscribe?.();
                registration.removeEventListener('updatefound', onInstalling);
                navigatorRef.serviceWorker.removeEventListener('controllerchange', onController);
                cleanToast();
            },
        };
    }).catch(error => {
        console.warn('Demian PWA registration unavailable:', error);
        return null;
    });
}
