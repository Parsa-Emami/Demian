/** Static native dialog; no raw phone or OTP persisted in browser storage. */
export function identityDialog({ recovery = false, send, confirm }, doc = globalThis.document) {
    if (!doc?.body || typeof doc.createElement !== 'function') return Promise.resolve(null);
    return new Promise(resolve => {
        const dialog = doc.createElement('dialog');
        dialog.className = 'demian-legal-dialog';
        dialog.setAttribute('aria-labelledby', 'identity-heading');
        dialog.innerHTML = '<form method="dialog"><h2 id="identity-heading">' +
            (recovery ? 'تأیید دومرحله‌ای بازیابی' : 'تأیید شماره برای دریافت جایزه') + '</h2>' +
            '<p>' + (recovery ? 'کد به شماره تأییدشده حساب قبلی ارسال می‌شود.' : 'برای دریافت جایزه هفتگی، مالکیت یک شماره تلفن را تأیید کنید. شماره در لیدربورد عمومی نمایش داده نمی‌شود.') + '</p>' +
            (recovery ? '' : '<label>شماره تلفن<input name="phone" type="tel" autocomplete="tel" maxlength="32" required></label>' +
            '<label><input name="consent" type="checkbox" required><span>با ارسال پیامک تأیید و پردازش شماره مطابق <a href="privacy/" target="_blank" rel="noopener noreferrer">حریم خصوصی</a> موافقم.</span></label>') +
            '<label data-otp-field hidden>کد شش‌رقمی<input name="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" disabled></label>' +
            '<p role="status" data-otp-status></p><div class="demian-legal-dialog__actions"><button type="button" data-cancel>انصراف</button><button type="submit" data-confirm>ارسال کد</button></div></form>';
        const form = dialog.querySelector('form');
        const status = dialog.querySelector('[data-otp-status]');
        const submit = dialog.querySelector('[data-confirm]');
        let challenge = null, done = false, busy = false;
        const finish = value => {
            if (done) return;
            done = true;
            dialog.close?.();
            dialog.remove();
            resolve(value);
        };
        dialog.querySelector('[data-cancel]').addEventListener('click', () => { if (!busy) finish(null); });
        dialog.addEventListener('cancel', e => { e.preventDefault(); if (!busy) finish(null); });
        dialog.addEventListener('close', () => finish(null));
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (done || busy) return;
            busy = true;
            submit.disabled = true;
            try {
                if (!challenge) {
                    if (!recovery && !form.elements.consent.checked) return;
                    const result = await send(recovery ? undefined : form.elements.phone.value.trim());
                    if (!result?.challenge_id) throw new Error('ارسال کد تأیید نشد.');
                    if (done) return;
                    challenge = result.challenge_id;
                    if (!recovery) {
                        form.elements.phone.disabled = true;
                        form.elements.consent.disabled = true;
                    }
                    dialog.querySelector('[data-otp-field]').hidden = false;
                    form.elements.otp.disabled = false;
                    form.elements.otp.required = true;
                    form.elements.otp.focus();
                    submit.textContent = 'تأیید کد';
                    status.textContent = 'کد ارسال شد؛ ۵ دقیقه اعتبار و حداکثر ۵ تلاش.';
                } else {
                    const otp = form.elements.otp.value.replace(/[۰-۹٠-٩]/g, ch => String(ch.charCodeAt(0) % 16));
                    if (!/^\d{6}$/.test(otp)) throw new Error('کد شش‌رقمی وارد کنید.');
                    const result = await confirm(challenge, otp);
                    finish(result);
                }
            } catch (error) {
                if (!done) status.textContent = error.status === 409 ? 'شماره یا درخواست قبلاً ثبت شده است؛ حساب اصلی را بازیابی کنید.'
                    : error.status === 429 ? 'تعداد درخواست‌ها زیاد است؛ کمی بعد تلاش کنید.'
                    : error.status === 422 || error.status === 428 ? 'کد نامعتبر یا منقضی است. در صورت پایان اعتبار، دوباره درخواست کنید.'
                    : 'تأیید انجام نشد؛ اتصال و دسترسی سامانه را بررسی کنید.';
            } finally { busy = false; submit.disabled = false; }
        });
        doc.body.append(dialog);
        try {
            if (typeof dialog.showModal !== 'function') throw new Error('Dialog unsupported');
            dialog.showModal();
        } catch { finish(null); }
    });
}
