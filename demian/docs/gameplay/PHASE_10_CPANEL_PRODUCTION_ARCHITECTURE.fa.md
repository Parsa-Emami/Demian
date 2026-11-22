# فاز ۱۰ از ۱۱ — معماری Production دمیان روی cPanel

**دامنه:** معیارهای F10-01 تا F10-14 نقشه‌راه جدید کیفیت Demian. این فاز با فازهای قبلی تاریخی مخزن هم‌نام نیست.

**مرز تأیید:** کد و CI این شاخه فقط آمادگی فنی را می‌سنجند. هیچ DNS، TLS، حساب پولی cPanel، PHP-FPM واقعی، پایگاه دادهٔ نهایی، انتقال بکاپ خارج از سرور یا تست بار ۵۰ کاربر روی هاست در این تغییرات ایجاد/تأیید نشده است. برای انتشار Production شواهد واقعی و اجازهٔ مالک لازم‌اند.

## ۱. توپولوژی پیشنهادی و ایزولاسیون

- بازی، عکس‌ها، اسپرایت‌ها و PWA: نسخهٔ استاتیک در CDN/GitHub Pages یا داکیومنت‌روت استاتیک؛ فایل‌های پرحجم از PHP عبور نکنند. حالت تمرینی باید با API غیرفعال هم قابل اجرا باشد.
- Laravel 13 API: زیردامنهٔ اختصاصی HTTPS. پروژه در مسیر خصوصی مانند /home/USER/demian-api؛ ساختار releases/SHA ،shared/.env ،shared/storage ،incoming و لینک current. PHP CLI و Web Handler هر دو نسخهٔ سازگار، در این پیاده‌سازی **PHP 8.4**.
- Database: MySQL/MariaDB با InnoDB و کاربر حداقلی؛ Laravel session/cache/queue بر پایهٔ database تا روی هاست اشتراکی نیازمند Redis یا Worker دائمی نباشیم.
- Staging کاملاً جدا از Production: زیردامنه، APP_KEY، فایل .env، بانک اطلاعاتی و کاربر اختصاصی، CORS، بکاپ و Permission مستقل. کپی مستقیم دادهٔ واقعی مشتری به Staging مجاز نیست.
- بخش مالی همیشه مستقل از اجرای بازی است. ثبت امتیاز رقابتی، تأیید شماره و صدور/مصرف کوپن سه مرحلهٔ متفاوت هستند.

### دو مسیر صحیح Document Root

**A — اگر میزبان Symlink را می‌پذیرد:** زیردامنهٔ API به /home/USER/demian-api/current/public اشاره کند؛ هرگز خودِ ریشهٔ پروژه یا shared نباید Document Root باشد.

**B — اگر cPanel داکیومنت‌روت متغیر/لینک را نمی‌پذیرد:** زیردامنهٔ مجزا با پوشهٔ خالی شبیه /home/USER/public_html/api بساز. متغیر GitHub به نام CPANEL_WEBROOT را برابر مسیر اختصاصی آن بگذار. نصب‌کنندهٔ ops/cpanel/install_webroot_bridge.php فقط index.php کنترل‌شده و .htaccess امن ایجاد می‌کند و به release فعلیِ خصوصی متصل می‌شود؛ .env، vendor، لاراول و دیتابیس کپی نمی‌شوند. در صورت وجود سایت دیگر، Symlink ناخواسته یا پوشهٔ public_html اصلی، نصب با خطا متوقف می‌شود. PHP Web/FPM، open_basedir و Rewrite باید روی همان زیردامنه آزمایش شوند؛ PHP CLI سالم اثبات وب سالم نیست.

## ۲. ماتریس ۱۴گانهٔ F10

| معیار | پیاده‌سازی مخزن | گیت دستی مستقل |
|---|---|---|
| F10-01 Infrastructure Review | Host preflight، حداقل PHP CLI 8.4، اکستنشن‌ها، فضای آزاد و حافظهٔ PHP | محدودیت CloudLinux، EP/PMEM/NPROC، inode و دسترسی SSH را از هاست بگیر |
| F10-02 Staging | محیط GitHub cpanel-staging، تنظیمات و مسیرهای جدا | DB/APP_KEY/SSL و کاربر جداگانه روی سرور واقعی |
| F10-03 Laravel Deployment | Vendor lock، بستهٔ فقط API، ساختار خصوصی Release و Bridge اختیاری | PHP وب، Rewrite، مالکیت فایل و document root |
| F10-04 Database Migration | Migration افزایشی و دستور arcade:hosting:doctor پس از migrate | بکاپ واقعی پیش از تغییر و بررسی سازگاری Schema |
| F10-05 HTTPS/CORS | ابزار تست TLS، مسیرهای خصوصی، CORS مجاز/نامجاز و preflight OPTIONS | DNS و گواهی معتبر در مرورگر واقعی |
| F10-06 Scheduler | Cron تک‌اجرا با flock، صف bounded اختیاری؛ Schedule لاراول موجود | نصب Cron واقعی و مشاهدهٔ heartbeat |
| F10-07 CI/CD | انتشار دستی GitHub، SSH host key، SHA-256 آرشیو، Release SHA، Rollback کد | حفاظت محیط Production و بازبینی انسانی |
| F10-08 Backup | رمزگذاری stream با age، gzip و checksum SHA-256 | خروجی امن **خارج از هاست**، تناوب، نگهداری و کلید بازیابی |
| F10-09 Restore Drill | بازیابی فقط در دیتابیس آزمایشی با پسوند restore/drill و Receipt خصوصی | بازیابی واقعی مستقل با کاربر فاقد حق Prod و بررسی کامل داده |
| F10-10 Monitoring | Laravel health، Cron heartbeat، OpsReport/alert موجود | مسیردهی آلارم و بررسی لاگ، دیسک، DB و کندی |
| F10-11 Load Testing | سه سناریوی k6 و ارزیاب p95/p99 و ۵۰ VU مشاهده‌شده | تست مجاز روی Staging واقعی، نظارت Resource Usage |
| F10-12 Release Verification | Health با SHA دقیق، CORS، private path، session و API smoke بدون نوشتن | تطبیق PWA و API روی گوشی و دامنهٔ نهایی |
| F10-13 Incident Response | Rollback دستیِ فقط کد و لاگ وضعیت با حفظ Migration | برنامهٔ قطع مالی/Ranked، RPO/RTO و تماس مسئولان |
| F10-14 Production Gate | جلوگیری از روشن‌شدن جوایز بدون تأیید Phone/OTP، Policy، Legal و Ops | تأیید صاحب کافه، تست SMS واقعی و صندوق |

## ۳. تنظیمات لازم GitHub و هاست

در GitHub دو Environment محافظت‌شده به نام cpanel-staging و cpanel-production با Required Reviewers ایجاد کن. استقرار Laravel فقط از Workflow دستی cpanel-api-deploy.yml روی main با بررسی SHA و رسید Backup امکان‌پذیر باشد.

| Environment Variable | معنی |
|---|---|
| CPANEL_SSH_HOST | Hostname معتبر بدون https |
| CPANEL_SSH_USER | نام کاربری غیر root در cPanel |
| CPANEL_API_ROOT | مثل /home/USER/demian-api یا مسیر مجزای Staging |
| CPANEL_PHP_BIN | مسیر PHP 8.4 CLI تست‌شده، مثال /usr/local/bin/ea-php84 |
| CPANEL_API_ORIGIN | HTTPS API بدون path و slash پایانی |
| CPANEL_CLIENT_ORIGIN | HTTPS دامنهٔ دقیق PWA برای آزمون CORS |
| CPANEL_WEBROOT | خالی در حالت A؛ در حالت B پوشهٔ اختصاصی API |

Secretهای محیط: CPANEL_DEPLOY_SSH_KEY و CPANEL_SSH_KNOWN_HOSTS. کلید میزبان را به‌طور مستقل با fingerprint رسمی تطبیق بده؛ StrictHostKeyChecking=no ممنوع است. در هاست، shared/.env باید فایل عادی با chmod 600 و APP_KEY مستقل برای هر محیط باشد. متغیرهای نمونه در ops/cpanel/.env.production.example و .env.staging.example هستند؛ هیچ Secret واقعی در Git قرار نگیرد.

**سیاست پیش‌فرض:** DEMIAN_COUPONS_ISSUE_ENABLED، DEMIAN_COUPONS_AUTO_ISSUE_ENABLED، DEMIAN_COUPONS_CAFE_ENABLED، DEMIAN_COUPONS_MANUAL_GIFTS_ENABLED و DEMIAN_WEEKLY_AUTO_AWARDS_ENABLED باید تا پذیرش مستقل خاموش بمانند. فعال‌سازی مالی در Production علاوه بر مجوزها به DEMIAN_PRIZE_VERIFIED_PHONE_REQUIRED، OTP درگاه واقعی، Legal/Policy و مانیتورینگ نیاز دارد. حساب‌های قدیمی را بدون SMS واقعی verified نکن.

## ۴. مسیر اجرایی Staging تا Production

1. میزبان را از نظر SSH، PHP CLI/FPM، DocumentRoot، MySQL، Cron و منابع واقعی بررسی کن؛ حداقل فضای آزاد 512MiB در Preflight.
2. زیردامنهٔ جدا و گواهی معتبر بساز؛ دیتابیس و APP_KEY Staging را مستقل تهیه کن؛ PHP وب 8.4 را جداگانه آزمایش کن.
3. اطلاعات Environment و SSH را در GitHub ثبت کن؛ branchهای وابسته را پس از CI و بررسی انسانی به ترتیب در main ادغام کن.
4. بستهٔ Backend با Composer lock و بدون dev/.env در CI ساخته می‌شود؛ SHA-256 بایت‌های tar ثبت و بعد از SCP **روی هاست پیش از استخراج** بررسی می‌شود.
5. اسکریپت ops/cpanel/deploy.sh فایل‌ها را در Release immutable باز می‌کند، Preflight/Route isolation را بررسی می‌کند، Migration و Hosting Doctor/Integrity/Audit را اجرا می‌کند، سپس current را اتمیک جابه‌جا می‌کند.
6. smoke اولیه اگر ناموفق باشد فقط کد را به نسخهٔ قبلی برمی‌گرداند؛ **Migrationهای DB معکوس نمی‌شوند.**
7. verify_cpanel_host.mjs آدرس API و PWA، GET/OPTIONS مجاز، عدم افشای فایل‌های محرمانه، سلامت SHA و Unauthorized endpointها را بدون نوشتن رکورد بررسی می‌کند.
8. قبل از Production: بکاپ offsite و Restore Drill مجزا، ظرفیت ۵۰ کاربر روی Staging، پیامک واقعی، کنترل مالی و پذیرش انسانی ضروری‌اند.

## ۵. Cron و Queue روی cPanel

نمونهٔ Cron دقیقه‌ای برای مسیر واقعی حساب (از cPanel → Cron Jobs اضافه شود):

~~~cron
* * * * * /bin/bash /home/USER/demian-api/current/ops/cpanel/cron.sh /home/USER/demian-api/current /usr/local/bin/ea-php84 schedule >/dev/null 2>&1
~~~

در صورت وجود Jobهای واقعی صف و بررسی ظرفیت هاست، Cron دوم **اختیاری**:

~~~cron
* * * * * /bin/bash /home/USER/demian-api/current/ops/cpanel/cron.sh /home/USER/demian-api/current /usr/local/bin/ea-php84 queue >/dev/null 2>&1
~~~

این اسکریپت فقط job جاری را اجرا می‌کند و با flock از هم‌پوشانی جلوگیری می‌کند؛ daemon مقیم لازم ندارد. فعال‌کردن Cron بدون مشاهدهٔ timestamp جدید Ops Heartbeat معادل پذیرش Scheduler نیست.

## ۶. بکاپ رمزگذاری‌شده و Restore Drill

اسکریپت backup_offsite.sh فقط زمانی عمل می‌کند که MySQL/MariaDB dump client و age نصب باشند. credential file باید private و 0600/0400 باشد. مثال روی سرور **خصوصی**:

~~~bash
bash ops/cpanel/backup_offsite.sh USER_demian /home/USER/private/mysql-client.cnf AGE_RECIPIENT /home/USER/private-backups
~~~

خروجی .age روی **همان سرور** هنوز Offsite نیست؛ آن را از کانال امن به مقصد مستقل ببر، digest را مستقل ثبت کن و Retention/RPO/RTO را مشخص کن. اگر age روی اشتراکی نصب نیست، از workstation مورد اعتماد برای streaming و رمزگذاری خارج از سرور استفاده کن، نه بکاپ SQL بدون رمز در public_html.

روی دستگاه/هاست متفاوت و دیتابیس از پیش ساخته‌شدهٔ USER_demian_restore با user محدود که حق DB واقعی ندارد:

~~~bash
bash ops/cpanel/restore_drill.sh /private/backup.sql.gz.age /private/age-identity.txt /private/restore-mysql.cnf USER_demian_restore USER_demian /private/receipts EXPECTED_SHA256
~~~

رسید خصوصی JSON و بررسی وجود چهار جدول اصلی به‌تنهایی اثبات سازگاری کامل کوپن/Replay نیست؛ تست Integrity/ledger و FK پس از Restore نیز جدا اجرا شوند. هیچ DB تولیدی Drop یا Restore نمی‌شود.

## ۷. تست ۵۰ کاربر روی Staging واقعی

**فقط با اجازهٔ مالک و شرکت هاست.** سه پروفایل مستقل:
- cpanel_50_active.js: ۵۰ VU هم‌زمان خواندنی، بدون ثبت اکانت.
- cpanel_50_writes_staging.js: ۵۰ ثبت‌نام/Start آزمایشی با emailهای .invalid و کلید یکتای DEMIAN_TEST_RUN_ID هشت‌هگز برای هر اجرا؛ پاک‌سازی حساب‌ها در پایان. این آزمون فرض می‌کند Staging صرفاً آزمایشگاهی است و پذیرش Legal برای اکانت‌های ساختگی الزامی نشده؛ موافقت حقوقی جعل نکن.
- cpanel_50_verified_replays_staging.js: ۵۰ هویت یک‌بارمصرف تأمین‌شده با secret امن، Replay معتبر، بررسی idempotency؛ بدون صدور کوپن.

به‌عنوان نمونه:

~~~bash
DEMIAN_TARGET=staging DEMIAN_LOAD_APPROVED=YES DEMIAN_BASE_URL=https://api-staging.example.com k6 run --summary-trend-stats='avg,min,med,max,p(90),p(95),p(99)' --summary-export=/private/read-only.json tools/load/cpanel_50_active.js

node tools/load/assess_phase10_k6.mjs --target=staging --scenario=read_only --approval=DEMIAN_STAGING_50_USER_LOAD_AUTHORIZED --input=/private/read-only.json
~~~

ارزیاب فنی باید در گزارش دادهٔ قابل حسابرسی از p95/p99، خطا، مدت، شمار درخواست و ۵۰ VU **واقعاً مشاهده‌شده** ببیند. متن خروجی hostCapacityCertified=false می‌ماند، چون JSON مستقل ثابت نمی‌کند روی کدام هاست اجرا شده است. Resource Usage در cPanel، EP، PMEM، 508، MySQL connections و CPU throttling را نیز دستی کنترل کن. تست تنها GET هیچ ادعایی در مورد فشار واقعی Replay ندارد.

## ۸. Incident و Rollback

اگر استقرار شکست خورد، ابتدا وضعیت مالی را بی‌خطر نگه دار، اثر روی کاربران را پایش کن، لاگ‌های خصوصی را حفظ کن و دربارهٔ اصلاح forward-only در DB یا بازگشت کد تصمیم بگیر. نسخهٔ قدیمی با Schema جدید باید **پیش از rollback** سازگار باشد. دستور فقط با تأیید انسانی:

~~~bash
bash /home/USER/demian-api/current/ops/cpanel/rollback.sh /home/USER/demian-api PREVIOUS_40_CHAR_SHA https://api.example.com /usr/local/bin/ea-php84 ROLLBACK_CODE_ONLY_DB_COMPATIBLE
~~~

به‌هیچ وجه Laravel migrate:rollback خودکار یا Restore روی DB زنده اجرا نشود؛ حفظ رکوردهای کاربر و ledger مقدم است. وقتی ناسازگاری Schema وجود دارد، rollback کد ممنوع و Fix-forward یا Recovery با پذیرش مستقل لازم است.

## ۹. وضعیت پذیرش و فاز بعد

- قابل سنجش در CI: تست PHP/Node، صحت نسخه، Contract اجرای Bash/PHP، کنترل artefact، گزارش mock و توابع بررسی Server.
- فقط با هاست واقعی: DNS/TLS، MultiPHP، SSH host key، DB، Cron، بکاپ مستقل و Restore، ۵۰ کاربر، ارسال واقعی OTP، مصوبه جوایز و تست صندوق.
- قبل از انتشار: آخرین SHA باید در دو دیتابیس، آزمون انتشار و تست مرورگری سبز باشد؛ PRهای قبلی #108 تا #114 ادغام و تأیید شوند و مسئول کافه اجازهٔ روشن‌شدن Ranked و جوایز را صادر کند.

**فاز بعد (۱۱ از ۱۱):** QA نهایی، UAT دستگاه واقعی Android/iOS، صندوق و انتشار عمومی کنترل‌شده.
