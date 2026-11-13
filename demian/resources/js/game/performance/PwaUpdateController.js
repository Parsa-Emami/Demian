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
        let toast = null;
        const cleanToast = () => { toast?.remove(); toast = null; };
        const showUpdate = () => {
            if (!registration.waiting || app?.sessionState !== 'menu' || toast) return;
            toast = documentRef.createElement('aside');
            toast.className = 'demian-pwa-update';
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-label', 'به‌روزرسانی دمیان');
            const text = documentRef.createElement('span');
            text.textContent = 'نسخهٔ جدید دمیان آماده است.';
            const button = documentRef.createElement('button');
            button.type = 'button';
            button.textContent = 'به‌روزرسانی';
            button.addEventListener('click', () => {
                if (app?.sessionState !== 'menu' || !registration.waiting) return;
                accepted = true;
                button.disabled = true;
                registration.waiting.postMessage({ type: 'DEMIAN_ACTIVATE_UPDATE' });
            });
            toast.append(text, button);
            documentRef.body.append(toast);
        };
        const onSession = () => {
            if (app?.sessionState === 'menu') showUpdate();
            else cleanToast();
        };
        const onController = () => {
            if (accepted) locationRef.reload();
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
                unsubscribe?.();
                registration.removeEventListener('updatefound', onInstalling);
                navigatorRef.serviceWorker.removeEventListener('controllerchange', onController);
                cleanToast();
            },
        };
    }).catch(error => {
        // PWA support is progressive enhancement; a denied worker never blocks
        // the main game, score verification, or offline practice selection.
        console.warn('Demian PWA registration unavailable:', error);
        return null;
    });
}
