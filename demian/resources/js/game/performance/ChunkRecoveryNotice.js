/**
 * Show one accessible, user-initiated recovery when an immutable dynamic
 * import fails. Never force a reload during an active scored game session.
 */
export function installChunkRecoveryNotice() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const notify = event => {
        event?.preventDefault?.();
        if (document.querySelector('[data-demian-chunk-recovery]')) return;
        const notice = document.createElement('section');
        notice.dataset.demianChunkRecovery = 'true';
        notice.setAttribute('role', 'alert');
        notice.setAttribute('aria-live', 'assertive');
        notice.style.cssText = 'position:fixed;inset:auto 12px 12px;z-index:2147483646;max-width:440px;margin-inline:auto;padding:16px;border-radius:12px;background:#202a21;color:#fff;box-shadow:0 6px 30px #0008;direction:rtl;font:inherit';
        const message = document.createElement('p');
        message.textContent = 'دریافت فایل بازی انجام نشد. اتصال اینترنت را بررسی کنید؛ اگر نسخهٔ بازی تغییر کرده است، صفحه را به‌روزرسانی کنید.';
        const reload = document.createElement('button');
        reload.type = 'button';
        reload.textContent = 'بارگذاری نسخهٔ جدید';
        reload.style.cssText = 'margin-top:12px;padding:9px 14px;border:1px solid currentColor;border-radius:8px;background:transparent;color:inherit;cursor:pointer';
        reload.addEventListener('click', () => window.location.reload());
        notice.append(message, reload);
        document.body.append(notice);
    };
    window.addEventListener('vite:preloadError', notify);
    window.addEventListener('demian:game-chunk-error', notify);
}
