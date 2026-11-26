# PR09 — Load Testing & Security Acceptance (50/100 clients)

## وضعیت و حدود اعتبار

این PR مجموعه آزمون‌های واقعی Laravel/MySQL را به ۱۰۰ درخواست HTTP هم‌زمان گسترش می‌دهد و پروفایل‌های دستی k6 برای ۱۰۰ VU محیط Staging را آماده می‌کند. **موفقیت روی GitHub CI به معنی تضمین ۱۰۰ کاربر روی هاست cPanel واقعی نیست.** CI از PHP CLI Built-in Server (۱۶ Worker) و MySQL 8.4 ایزوله استفاده می‌کند، درحالی‌که هاست واقعی ممکن است PHP-FPM، CloudLinux، EP/NPROC/IOPS و محدودیت اتصال داشته باشد.

### ۱. تست خودکار امن (بدون دسترسی به هاست)

Workflow جدید: PR09 isolated 100-client load and security acceptance (CI only)

این آزمون روی هر PR به main و Push به main از پوشه demian اجرا می‌شود. داده‌ها کاملاً مصنوعی و دیتابیس آن دورریختنی است.

- ۱۰۰ هویت مستقل و Bearer Token یکتا؛ ثبت‌نام در دو موج ۵۰تایی با فاصله بیش از یک دقیقه، زیرا Rate Limit واقعی ثبت‌نام ۶۰ درخواست از یک IP در دقیقه است. **این محدودیت برای تست حذف یا افزایش داده نشده است.**
- بعد از آماده‌سازی حساب‌ها، هم‌زمان ۱۰۰ درخواست شروع Dino Run صادر می‌شود.
- ۲۰۰ درخواست اولیه تکمیل Replay با امتیاز جعلی عمدی برای اثبات اینکه سرور تنها امتیاز محاسبه‌شده توسط خودش را می‌پذیرد، سپس ۲۰۰ درخواست تکراری دیگر برای کنترل Idempotency و Race Condition.
- کنترل Ownership و IDOR، Bearer جعلی/غایب، حرکت غیرممکن، Replay سریع‌تر از حد مجاز، Rules Version نامعتبر، Payload بیش‌ازحد، Rate Limit هر بازیکن و عدم مسدودی بازیکن دیگری پشت همان NAT.
- صحت پایگاه داده با artisan arcade:integrity؛ گزارش p95/p99 برای register/start/complete/retry، تعداد درخواست واقعی هم‌زمان (in-flight) و تعداد Worker.
- آستانه آزمون آزمایشگاهی ۱۰۰کاربره برای تکمیل Replay: p95 کمتر از ۴۰۰۰ms و p99 کمتر از ۸۰۰۰ms؛ این هدف صرفاً سنجش CI است و یک SLA هاست واقعی محسوب نمی‌شود.
- Artifact به نام pr09-100-security-<SHA>، حاوی http-100.json و pr09-ci-decision.json؛ شماره تماس، Token، Session، DB Credential یا اطلاعات بازیکن در خروجی ثبت نمی‌شود.

مهم: ۱۰۰ درخواست در حال انتظار روی HTTP به معنای ۱۰۰ Worker هم‌زمان نیست؛ تعداد Worker واقعی PHP در CI برابر ۱۶ است. امکان اتصال ۱۰۰ گوشی حقیقی یا ۱۰۰ Worker PHP از نتیجه CI استنباط نمی‌شود.

### ۲. Staging واقعی و ۱۰۰ VU با k6 — فقط پس از مجوز

**اجرا نشود** مگر اینکه cPanel Staging واقعی، جداسازی کامل Production، مجوز کتبی سرویس‌دهنده برای بار ۱۰۰ VU و تأیید صاحب کافه موجود باشد. هر دو اسکریپت فقط staging را می‌پذیرند و نیازمند پرچم DEMIAN_PROVIDER_100_VU_APPROVED=YES هستند.

پروفایل Read-only برای ۱۰۰ کلاینت فعال، سه دقیقه، درخواست‌های GET برای Rules، Games، Leaderboard و حدود یک Poll در ۲۰ ثانیه برای هر VU:

~~~bash
cd demian
DEMIAN_TARGET=staging DEMIAN_LOAD_APPROVED=YES DEMIAN_PROVIDER_100_VU_APPROVED=YES \
DEMIAN_BASE_URL=https://api-staging.example.test \
k6 run --summary-export=/secure/private/pr09-100-readonly.json tools/load/cpanel_100_active_staging.js
~~~

پروفایل Replay واقعی نیازمند **دقیقاً ۱۰۰ توکن مجزای حساب آزمایشی Staging** در فایل خصوصی رمزنگاری‌شده است. هر VU یک Run شروع، Replay قابل‌تأیید توسط سرور، تلاش تکراری idempotent و بررسی هویت امتیاز را اجرا می‌کند. این اسکریپت حسابی ایجاد یا حذف نمی‌کند و هیچ کوپنی صادر نمی‌کند:

~~~bash
DEMIAN_TARGET=staging DEMIAN_LOAD_APPROVED=YES DEMIAN_REPLAY_LOAD_APPROVED=YES \
DEMIAN_PROVIDER_100_VU_APPROVED=YES DEMIAN_TEST_RUN_ID=1122aabb \
DEMIAN_STAGING_IDENTITIES_FILE=/secure/private/100-staging-tokens.json \
DEMIAN_BASE_URL=https://api-staging.example.test \
k6 run --summary-export=/secure/private/pr09-100-replays.json tools/load/cpanel_100_verified_replays_staging.js
~~~

هرگز از Production URL، هویت واقعی بازیکنان یا Token صندوق‌داران استفاده نکنید. شناسه تست باید برای هر اجرا جدید باشد.

بعد از دریافت خروجی واقعی، تحلیل نتایج فقط روی سیستم خصوصی:

~~~bash
node tools/load/pr09_host_100_policy.mjs \
 --target=staging --approval=DEMIAN_PROVIDER_APPROVED_100_VU_STAGING \
 --scenario=read_only --input=/secure/private/pr09-100-readonly.json
node tools/load/pr09_host_100_policy.mjs \
 --target=staging --approval=DEMIAN_PROVIDER_APPROVED_100_VU_STAGING \
 --scenario=verified_replay --input=/secure/private/pr09-100-replays.json
~~~

این ابزار JSON خوداظهاری را تحلیل می‌کند ولی هویت میزبان یا موافقت سرویس‌دهنده را تأیید نمی‌کند؛ حتی در صورت عبور همه متریک‌ها نتیجه صرفاً operator-metrics-within-budget است.

### ۳. داده‌های عملیاتی اجباری

قبل از هر تصمیم ظرفیت واقعی باید این موارد توسط Ops جمع‌آوری شوند:
- میزان و نمودار PHP-FPM active/busy/queue، CPU throttling، Memory و CloudLinux EP/PMEM/NPROC/IO/IOPS، MySQL Threads_connected/Locks، HTTP 429/500/503/508، Latency p50/p95/p99، حجم اینترنت و Timeout.
- نرخ موفقیت و صحت هفت بازی از Android اقتصادی/میان‌رده و iPhone Safari، وضعیت PWA Offline/Resume/Update و جلوگیری از Duplicate Score.
- Replay/OTP/Token و آزمایش IDOR تحت بازبینی مستقل، رتبه‌بندی هفتگی و Snapshot Sealing.
- آزمایش مالی دو صندوق‌دار روی محیط مجاز مجزا، کنترل یک‌بارمصرف و تراکنش اتمیک Coupon؛ **در CI این عملیات مالی انجام نمی‌شود**.
- بکاپ Offsite رمزنگاری‌شده و Restore در DB دیگر، جدا بودن APP_KEY، HTTPS و Branch Protection/Environment Reviewers.
- در صورت 429 در ثبت‌نام ۱۰۰ نفر پشت یک NAT، سیاست فعلی عمداً محافظه‌کارانه است؛ تصمیم افزایش آن فقط بعد از مدل تهدید و موافقت مالک انجام شود، نه برای سبزکردن تست.

### ۴. کنترل انتشار

Workflow دستی cPanel قبل از بسته‌بندی روی main علاوه بر PR06 باید موفقیت **PR09** برای SHA دقیق را تأیید کند. اسکریپت Branch Protection اکنون Check به نام load-100 را به لیست اجباری اضافه می‌کند؛ فعال‌کردن واقعی قوانین GitHub و Staging هنوز اقدامی در سطح ادمین است.

همه این‌ها صرفاً CI READY هستند. پرچم‌های مجوز مالی و Production باید خاموش بمانند تا پس از PR08، PR07، Issue #117 و امضای چهار نقش مستقل در Phase11 مدارک واقعی بررسی شود.
