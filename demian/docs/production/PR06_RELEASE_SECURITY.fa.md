# PR 06 — Production Readiness & Release Security

## نتیجهٔ واقعی این PR

این تغییر **تنها زیرساخت و شواهد CI** را آماده می‌کند؛ cPanel واقعی، DNS، SMS، صندوق‌دار، دستگاه اندروید/iOS و بکاپ خارج از هاست در این PR لمس نشده‌اند. خروجی سبز CI به معنی اجازهٔ انتشار تجاری نیست.

### ۱. بسته قابل شناسایی دقیق

- `demian/ops/cpanel/package_release.sh OUTPUT_DIR SOURCE_SHA` تنها بستهٔ Laravel API را با Composer production/no-dev و فهرست صریح فایل‌ها می‌سازد.
- `demian-cpanel.tar.gz`، `demian-cpanel.sha256` و `demian-cpanel.manifest.json` تولید می‌شوند؛ Manifest شامل شناسه SHA دقیق Commit و تأیید `productionAuthorized=false` است.
- مسیرهای `.env`، `.git`، `.ssh`، `node_modules`، فایل‌های cache ساخته‌شده برای محیط CI، Symlink و فایل‌های ویژه وارد بسته نمی‌شوند.
- بسته‌ساز مشترک Workflow «manual cPanel deploy» و CI است؛ اختلاف تصادفی دو مسیر بسته‌بندی مانع انتشار نمی‌شود.

### ۲. تست واقعی Archive پیش از استقرار

Workflow `PR06 cPanel release acceptance (CI only)` روی Pull Request و Push به main با PHP 8.4 / MySQL 8.4 **غیرواقعی و دورریختنی** اجرا می‌شود. پکیج دقیق SHA با فایل `.env` تصادفی مخصوص تست باز می‌شود و موارد زیر بررسی می‌شوند:

- SHA-256، Manifest، عدم ورود فایل خصوصی، Laravel API-only و Composer بدون بسته‌های توسعه.
- Migration دوباره‌اجراپذیر، `arcade:integrity` و ممیزی کوپن در دیتابیس دورریختنی.
- Health همان Commit، بازی‌های موجود، قوانین، جدول هفتگی، Legal، وضعیت احراز هویت، نبود مسیرهای مدیریتی و CORS نامعتبر.
- API‌ مالی و کوپن برای CI غیرفعال می‌مانند؛ هیچ کوپن واقعی ساخته/مصرف نمی‌شود.

### ۳. دروازه Manual Production

Workflow `Demian cPanel Laravel API (manual and gated)` همچنان تنها با `workflow_dispatch` کار می‌کند. پیش از ساخت بسته، برای همان SHA اصلی به CI موفق PR06 احتیاج دارد. Production علاوه بر پیش‌شرط‌های SSH/HTTPS، این موارد را لازم دارد:

1. `main` در GitHub از طریق Branch Protection یا Ruleset واقعی محافظت شده باشد (`GITHUB_REF_PROTECTED=true`).
2. Environment به نام `cpanel-production` دارای **Required Reviewers** و `Prevent self-review` باشد. امکان خواندن و تأیید این تنظیمات با Token GitHub Actions نیز لازم است؛ دسترسی نامعلوم، **NO-GO** است.
3. Workflow مستقل `Phase 11 protected GO / NO-GO candidate audit` برای **همان SHA** با موفقیت و با مستندات اصلی پذیرش انسانی اجرا شده باشد.
4. رسید واقعی بکاپ رمزنگاری‌شدهٔ انتقال‌یافته به خارج از هاست و آزمون Restore مستقل وجود داشته باشد؛ هش SHA-256 آن به عنوان `backup_receipt` ارائه شود. **داشتن رشتهٔ ۶۴کاراکتری اثبات وجود بکاپ نیست** و اپراتور باید مستندات را خارج از CI تطبیق دهد.
5. کلید SSH دارای Host Key Pinning، تنظیمات محیطی Secret، PHP CLI/Web 8.4، MySQL، Cron، SSL و `APP_DEBUG=false` در میزبان واقعی تأیید شوند.

اگر این کنترل‌ها در GitHub یا cPanel تنظیم نشده‌اند، Production باید **مسدود** باقی بماند.

### ۴. نیازمندی‌های خارج از GitHub

- فعال‌سازی دستی محافظت `main`، الزام Review و Required Status Checks: `PR06 cPanel release acceptance (CI only) / package`، `Arcade backend verification / replay-and-api (sqlite)` و `(mysql)`، Build/Release-QA و Mobile-11 operations contracts با نام دقیق نمایش‌داده‌شده در GitHub.
- تعریف محیط‌های `cpanel-staging` و `cpanel-production` با Reviewer مجزا و Secretهای لازم. این PR نه Secrets می‌سازد، نه تنظیمات GitHub را تغییر می‌دهد.
- آزمون مجاز ۵۰ کاربر واقعی روی **Staging همان هاست** با تأیید مالک هاست و معیارهای p95/p99/508/EP/PMEM؛ آزمون CI پنجاه کاربر روی دیتابیس دورریختنی نمی‌تواند جایگزین آن باشد.
- اجرای عملی بازی‌های هفت‌گانه روی اندروید ارزان و میان‌رده و Safari واقعی؛ بازبینی دوبارهٔ بدهی هنری PNG و اسپرایت‌شیت‌های کاراکترها.
- تأیید نهایی مستقل مهندسی، امنیت، عملیات و صاحب کافه در Issue #117؛ تا قبل از آن **NO-GO برای جایزه مالی**.

### ۵. Rollback و بازیابی

`ops/cpanel/deploy.sh` نسخه جدید را ابتدا آماده و ممیزی می‌کند؛ تنها پس از Migration و Health صحیح، Symlink تغییر می‌کند. شکست Health کد را به نسخه پیشین برمی‌گرداند؛ **Migration به عقب اجرا نمی‌شود**. پس هر تغییر Schema نیازمند سازگاری دو نسخه یا Playbook صریح بحران است. `backup_offsite.sh` تنها بکاپ **محلی رمزنگاری‌شده** تولید می‌کند؛ انتقال واقعی off-host باید مستقل انجام شود و `restore_drill.sh` باید در DB دورریختنی با کاربر فاقد مجوز Production اجرا شود.

از هیچ‌یک از این رویه‌ها برای رفع محدودیت مالی بدون مجوز انسانی استفاده نکنید.
