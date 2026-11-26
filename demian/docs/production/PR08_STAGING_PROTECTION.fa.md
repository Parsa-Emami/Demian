# PR08 — Production Staging & cPanel Acceptance

## نتیجه فنی و مرز اختیارات

در PR08 اسکریپت‌های راه‌اندازی و اعتبارسنجی و مسیرهای CI/QA آماده می‌شوند. **این کار معادل استقرار روی هاست واقعی یا فعال شدن Branch Protection نیست.** اتصال GitHub App کنونی مجوز Administration برای تغییر قوانین شعبه را ندارد؛ مالک باید اعمال قوانین را با GitHub CLI و دسترسی مدیر انجام دهد. هیچ جایزه واقعی یا API مالی فعال نمی‌شود.

## ۱. Branch Protection

در یک ترمینال امن روی سیستم مالک، پس از ادغام PR08 و در پوشه demian:

    bash ops/github/main_branch_protection.sh plan
    DEMIAN_BRANCH_PROTECTION_APPROVED=APPLY_MAIN_PROTECTION bash ops/github/main_branch_protection.sh apply
    bash ops/github/main_branch_protection.sh verify

اجرای apply نیازمند gh auth login و دسترسی Admin دارد. حالت plan فقط پیکربندی پیشنهادی را نشان می‌دهد؛ verify به‌صورت Read-only وضعیت واقعی GitHub را بازخوانی می‌کند.

پیکربندی شامل Strict Required Checks با نام‌های release-qa، package، build، contract، cpanel-runtime و Backend SQLite/MySQL، حداقل یک Reviewer **مستقل** در PR، بی‌اعتبارکردن تأیید پس از Push، ممنوعیت Force-Push و Delete، و اعمال قوانین بر مدیران است.

هشدار: اگر مخزن فقط یک توسعه‌دهنده دارد، الزام Reviewer مستقل ممکن است ادغام بعدی را متوقف کند. پیش از apply یک Reviewer دارای مجوز مناسب مشخص شود. محیط cpanel-production و Required Reviewers / Prevent self-review نیز باید مستقل توسط مالک پیکربندی شوند.

## ۲. محیط Staging جدا از Production

برای Staging واقعی روی cPanel باید موارد زیر موجود باشند:

- دو زیردامنه HTTPS معتبر و جدا، مانند https://api-staging.demiancafe.ir و https://staging.demiancafe.ir. این نشانی‌ها فقط نمونه‌اند.
- PHP Web و CLI 8.4، MySQL/InnoDB، SSH با Host Key تأییدشده از کانال مستقل، DocumentRoot ایمن، فضای آزاد و دسترسی Cron Jobs.
- ریشه غیرعمومی با نام شامل staging مانند /home/ACCOUNT/demian-api-staging، پایگاه داده اختصاصی با نام شامل staging، کاربر غیرroot، و فایل shared/.env با مجوز 0600. کلید APP_KEY و DB باید مستقل از Production باشند.
- GitHub Environment cpanel-staging با متغیرهای CPANEL_SSH_HOST، CPANEL_SSH_USER، CPANEL_API_ROOT، CPANEL_PHP_BIN، CPANEL_API_ORIGIN، CPANEL_CLIENT_ORIGIN و در صورت نیاز CPANEL_WEBROOT. Secrets آن: CPANEL_DEPLOY_SSH_KEY و CPANEL_SSH_KNOWN_HOSTS. این اطلاعات در Git یا چت ارسال نشوند.
- یک Cron واقعی هر دقیقه برای مسیر همان Staging و current/ops/cpanel/cron.sh مطابق الگوی داخل فایل.
- تمام فلگ‌های Coupon، Prize و Weekly Settlement خاموش؛ Host Preflight با فعال بودن این فلگ‌ها اجازه استقرار Staging نمی‌دهد. آزمون مالی فقط در Sandbox مجاز و مستقل انجام شود.

## ۳. استقرار فقط با Workflow استاندارد

پس از محافظت main و موفقیت تمام تست‌های همان SHA، در GitHub Actions دستور دستی زیر را اجرا کنید:

- Workflow: Demian cPanel Laravel API (manual and gated)
- Ref: main
- target: staging
- production_acknowledgement: خالی
- backup_receipt: خالی

قبل از اتصال SSH، SHA بسته، Manifest، محافظت main و جدایی Root/Origin محیط Staging بررسی می‌شوند. Deployment پس از Migration و کنترل Schema/Integrity انجام می‌شود؛ کد قابل Rollback است، اما Migration خودکار به عقب برنمی‌گردد.

پس از Smoke HTTP، اسکریپت ops/cpanel/staging_acceptance.sh روی هاست واقعی و با کاربر بدون Root اجرا می‌شود. این اسکریپت Cron، PHP 8.4، صحت Release SHA، Host Preflight، Hosting Doctor، Integrity و Coupon Audit را بدون تغییر داده بررسی می‌کند. در صورت خطا، Workflow موفق نمی‌شود و رسید Stage تولید نمی‌شود.

در صورت موفقیت، Artifact با نام cpanel-staging-receipt-<EXACT_SHA> از همان Run ایجاد می‌شود. این رسید فاقد Secret است و ادعای قبولی Offsite Restore یا ۵۰ کاربر ندارد.

## ۴. آزمون مستقل Staging API/PWA

پس از اینکه PWA مخصوص Staging با SHA و PWA Release ID مطابق Artifact ساخته و در HTTPS واقعی مستقر شد، Workflow دستی زیر را اجرا کنید:

- Workflow: PR08 protected cPanel staging read-only acceptance
- staging_deploy_run_id: شناسه Workflow موفق Staging
- pwa_release_id: مقدار واقعی شانزده‌کاراکتری Artifact phase11-pwa-bundle همان SHA
- acknowledgement: READ_ONLY_STAGING_ACCEPTANCE

این Workflow نتیجه سالم بودن main محافظت‌شده، موفقیت release-qa، Release برابر API و PWA، TLS/CORS، مخفی بودن مسیرهای خصوصی، Service Worker، Manifest و Offline game catalog هفت‌گانه را به‌صورت خواندنی می‌سنجد.

نتیجه موفق فقط STAGING_HTTP_PARITY_VERIFIED_OPERATOR_ACCEPTANCE_REQUIRED است. این نتیجه هرگز Production GO یا تأیید جایزه واقعی محسوب نمی‌شود.

## ۵. شواهد بیرونی هنوز لازم

- بکاپ رمزنگاری‌شده MySQL از هاست با backup_offsite.sh، انتقال واقعی Offsite، Restore در DB جدا با restore_drill.sh، ثبت زمان و SHA-256.
- آزمون مجاز ۵۰ VU روی Staging واقعی برای Read، Write و Verified Replay؛ ثبت p95/p99/Error و EP/PMEM/508 و وضعیت MySQL. نتایج آزمایشگاه CI جایگزین هاست واقعی نیست.
- آزمایش واقعی PHP Web 8.4، Cron heartbeat، SSL/DNS، پاسخ‌دهی و برنامه بازیابی Schema سازگار.
- پذیرش مستقل Android اقتصادی، Android میان‌رده و Safari iPhone و استاندارد هنری PNG/Atlas تمام کاراکترها.
- آزمایش Weekly Winners، Wallet، OTP جایزه و استفاده اتمیک کوپن فقط با مجوز مالی جداگانه و بدون اتصال به Production.
- امضای چهار نقش Engineering، Security، Operations و Cafe Owner در Issue #117.

## ۶. بستن مسیر قدیمی ناامن

Workflow قدیمی mobile11-api-deploy.yml با PHP 8.3 و ریشه /srv دیگر اجازه اجرا در بخش Package/Deploy ندارد؛ تنها مسیر Laravel API روی cPanel، Workflow استاندارد PR06/PR08 است.

**نتیجه:** کد می‌تواند در CI سبز و به main ادغام شود، اما حفاظت واقعی Branch، قابلیت واقعی هاست و اجازه انتشار تجاری فقط پس از اعمال و پذیرش بیرونی تأیید می‌شوند.
