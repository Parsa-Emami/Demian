import policy from '../../../legal/policy.json' with { type: 'json' };

export const LEGAL_VERSION = policy.version;

/**
 * A user must actively acknowledge both documents before a NEW online account
 * is created. The dialog is never shown for local/offline practice or for an
 * existing authenticated account. No choice is inferred from page navigation.
 */
export function requestLegalAcknowledgement(doc = globalThis.document) {
    if (!doc?.body || typeof doc.createElement !== 'function') {
        return Promise.resolve(null);
    }
    return new Promise(resolve => {
        const dialog = doc.createElement('dialog');
        dialog.className = 'demian-legal-dialog';
        dialog.dataset.demianLegalConsent = '';
        dialog.setAttribute('aria-labelledby', 'demian-legal-heading');
        // Static, developer-authored markup; no untrusted server text is HTML.
        dialog.innerHTML = '<form method="dialog">' +
            '<h2 id="demian-legal-heading">ثبت حساب آنلاین دمیان</h2>' +
            '<p>برای ذخیرهٔ رکورد آنلاین، نام نمایشی و شواهد بازی طبق سیاست حریم خصوصی پردازش می‌شوند. ' +
            'می‌توانید بدون حساب آنلاین در حالت تمرینی بازی کنید.</p>' +
            '<p><strong>توجه:</strong> متن قوانین فعلاً در انتظار تأیید نهایی متولی کافه است و ' +
            'صدور جایزه واقعی فعال نشده است.</p>' +
            '<p><a href="privacy/" target="_blank" rel="noopener noreferrer">سیاست حریم خصوصی</a> · ' +
            '<a href="terms/" target="_blank" rel="noopener noreferrer">شرایط استفاده</a> · ' +
            '<a href="competition-rules/" target="_blank" rel="noopener noreferrer">قوانین رقابت</a></p>' +
            '<label><input type="checkbox" data-legal-terms required>' +
            '<span>شرایط استفاده و قوانین رقابت را مطالعه و می‌پذیرم.</span></label>' +
            '<label><input type="checkbox" data-legal-privacy required>' +
            '<span>از نحوه جمع‌آوری و استفاده از داده‌های حساب و حقوق حذف و دسترسی آگاه شدم.</span></label>' +
            '<div class="demian-legal-dialog__actions">' +
            '<button type="button" data-legal-cancel>فعلاً فقط تمرینی</button>' +
            '<button type="submit" data-legal-confirm>تأیید و ایجاد حساب</button>' +
            '</div></form>';
        doc.body.append(dialog);
        const form = dialog.querySelector('form');
        let done = false;
        const finish = approved => {
            if (done) return;
            done = true;
            dialog.close?.();
            dialog.remove();
            resolve(approved ? {
                policy_version: LEGAL_VERSION,
                accept_terms: true,
                privacy_acknowledged: true,
            } : null);
        };
        dialog.querySelector('[data-legal-cancel]').addEventListener('click', () => finish(false));
        dialog.addEventListener('cancel', event => {
            event.preventDefault();
            finish(false);
        });
        dialog.addEventListener('close', () => finish(false));
        form.addEventListener('submit', event => {
            event.preventDefault();
            const terms = dialog.querySelector('[data-legal-terms]');
            const privacy = dialog.querySelector('[data-legal-privacy]');
            if (!terms?.checked || !privacy?.checked) return;
            finish(true);
        });
        try {
            if (typeof dialog.showModal !== 'function') throw new Error('Native dialog unavailable');
            dialog.showModal();
        } catch {
            // Never silently create an account when the consent UI is broken.
            finish(false);
        }
    });
}
