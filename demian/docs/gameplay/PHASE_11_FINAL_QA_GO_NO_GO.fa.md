# فاز ۱۱ از ۱۱ — QA نهایی، پذیرش فیزیکی و انتشار کنترل‌شده Demian

**دامنه:** F11-01 تا F11-14 نقشه‌راه کیفیت. با فاز ۱۱ قدیمی کوپن‌های کافه اشتباه نشود.

**وضعیت در زمان تدوین:** برای انتشار تجاری Production، فعلاً NO-GO. موفقیت CI و وجود سورس به معنای DNS، TLS، گوشی واقعی، آزمون صندوق، درگاه SMS واقعی یا ۵۰ کاربر واقعی روی cPanel نیست. هر گیت فاقد سند واقعی، باز می‌ماند.

## معماری پذیرش

۱. **آزمایشگاه CI:** Node/PHP، هفت بازی، مرورگرهای Chromium/Firefox/WebKit (شبیه‌سازی‌شده)، PWA، شبکه، انیمیشن، Replay و تست MySQL/SQLite. ابزار phase11_release_audit.mjs بر اساس نسخهٔ واقعی خروجی _site، SHA کامل کد، هش SHA-256 فایل‌های حیاتی PWA، Rules Version و Service Worker یک سند قابل ردیابی می‌سازد. مرحله مستقل release-qa موفقیت Backend و Build را هم کنترل می‌کند؛ خروجی صرفاً CI_READY_PRODUCTION_NOT_AUTHORIZED است.
۲. **Staging میدانی:** دو محیط مستقل، PHP 8.4 CLI و وب، HTTPS/CORS، ۵۰ VU واقعی، بکاپ خارج از هاست و Restore، گوشی‌های واقعی و امنیت/صندوق. ابزار phase11_remote_smoke.mjs فقط GET/OPTIONS اجرا می‌کند و هیچ رکورد بازیکن یا کوپن نمی‌سازد.
۳. **تصمیم انسانی:** ۱۳ مدرک F11-01 تا F11-13 در فایل acceptance.production.json با SHA/URL/تاریخ و بازبین؛ معیار F11-14 از آن‌ها استخراج می‌شود. ابزار phase11_release_policy.mjs در نبود هر مدرک NO_GO و در صورت تکمیل ظاهری فقط HUMAN_REVIEW_REQUIRED می‌دهد. Workflow دستی محافظت‌شده نیز فقط رسید نامزد انتشار می‌سازد و هیچ عملیات مالی یا Deploy انجام نمی‌دهد.

## ماتریس ۱۴ معیار

| شناسه | پیاده‌سازی/شواهد GitHub | پذیرش انسانی مستقل |
|---|---|---|
| F11-01 Functional | هفت بازی، منو، کاراکتر، Pause/Retry، نتیجه و مرورگر | چرخهٔ واقعی در Staging |
| F11-02 Character | ابزار بررسی PNG/Atlas و حرکت | تأیید هنری واقعی تمام کاراکترهای فعال؛ بدهی TD-ART-001 باید بسته شود |
| F11-03 Browser | Chromium، Firefox و WebKit آزمایشگاهی | Safari و Chrome موبایل واقعی |
| F11-04 Android | شبیه‌سازی Touch، FPS و حافظه | یک Android اقتصادی و یک میان‌رده؛ هرکدام حداقل ۱۵ دقیقه |
| F11-05 iOS | WebKit و Safe Area آزمایشگاهی | Safari روی iPhone واقعی، Rotate و PWA Home Screen |
| F11-06 Network | آفلاین، Save-Data، Retry/Reconnect و Service Worker update | قطع اینترنت/شبکهٔ ضعیف روی دستگاه، بدون گم‌شدن نتیجه یا ثبت تکراری |
| F11-07 Security | PHPUnit، Anti-cheat، Rate Limit، Replay و Ownership | تست مستقل مجاز Staging، چند سیم‌کارت، Role/CSRF، بدون آسیب‌پذیری Critical |
| F11-08 Reward | Ledger و Coupon atomicity و RBAC | Seal هفته، رتبه، Wallet، Coupon و Redemption یک‌بار توسط دو صندوق‌دار |
| F11-09 Load | پروفایل k6 و ارزیابی P95/P99 | سه تست واقعی ۵۰ VU روی cPanel Staging، EP/PMEM/MySQL و 508 |
| F11-10 Real Player | ثبت Issues/UX | حداقل سه بازیکن داوطلب واقعی کافه، رفع P0/P1 مؤثر |
| F11-11 Accessibility | RTL، Keyboard، Touch و Reduced Motion | کنتراست، فوکوس، اندازه لمس و دسترس‌پذیری روی دستگاه |
| F11-12 Regression | همهٔ Node/PHP/Assets/Browser/QA بر SHA دقیق | اجرای مجدد بعد از آخرین Hotfix |
| F11-13 Release Audit | هش PWA، Rules Version، CI و API Smoke | Release API+PWA یکسان، TLS واقعی، Backup و Rollback |
| F11-14 Go/No-Go | Policy fail-closed و Workflow حفاظت‌شده | چهار بازبین مستقل و مصوبهٔ رسمی؛ بدون شواهد = NO-GO |

## پذیرش فیزیکی Android/iOS

برای هر گوشی واقعی، آزمونگر باید مدل، نسخه OS و Browser، SHA کامل، release ID، نوع شبکه، وجود PWA نصب‌شده، Portrait/Landscape، شرایط Battery/Heat، زمان بازشدن منو، نتیجهٔ هر هفت بازی، p50 FPS، p95 Frame Time، رشد حافظه در ۱۵ دقیقه، p95 پاسخ لمس، Offline/Reconnect، Background/Resume، Safe Area و نقص‌های مشاهده‌شده را ثبت کند. سند ویدئو/لاگ خصوصی و digest SHA-256 آن، بدون دادهٔ شخصی، در یک Issue قابل پیگیری نگهداری شود.

آستانهٔ اولیهٔ Policy برای **هر** دستگاه: دست‌کم ۱۵ دقیقه بازی، p50 FPS حداقل ۳۰، p95 Frame Time حداکثر ۳۴ میلی‌ثانیه، رشد حافظه حداکثر ۱۰٪ و p95 لمس حداکثر ۱۰۰ میلی‌ثانیه. این کف ماشینی، جایگزین هدف ۶۰FPS فاز ۸ و کیفیت ادراکی انسان نیست. WebKit لینوکس به معنای Safari واقعی iPhone نیست.

برای هر دستگاه هفت بازی جداگانه چک شوند: Dino Run (پرش/داج/برخورد)، After Hours (حرکت/توانایی/نتیجه)، Café Rush (سفارش/آماده‌سازی/Combo)، Open World (Joystick/دوربین/هدف)، Café Critters (Hint/پاسخ)، Coffee Crash (Match-3/Undo/برد و باخت) و Café Drift (مسیر و برخورد/امتیاز). Pause، Retry و بازگشت به Library در هر هفت مورد بررسی شوند. همهٔ کاراکترهای فعال از منظر Idle/Walk/Run/Jump در صورت پشتیبانی، مقیاس و خطای بصری بازبینی شوند.

## امنیت و جوایز: فقط Staging با مجوز

درگاه پیامک واقعی باید برای ورود بازیکن آزمایشی تأیید شود؛ کد اشتباه، منقضی، دوباره‌مصرف‌شده، سقف ارسال و Session Rotation آزموده شوند. هویت چند سیم‌کارت برابر یک فرد اثبات‌شدنی نیست؛ IP مشترک کافه نباید محرومیت خودکار ایجاد کند. درخواست جعلی Score/Replay/Request ID/Rules Version و دسترسی غیرمجاز Cashier/Superadmin بررسی شوند. برای کوپن، مهروموم هفتگی، تعیین برنده، Issue، کیف پول، مصرف هم‌زمان دو صندوق‌دار و جلوگیری از Redemption دوباره باید در محیط مجاز واقعی بررسی شود. صدور کوپن تجاری تا تأیید مالی مستقل **خاموش** بماند.

## cPanel و شبکه

مالک ابتدا SSH، Host Key، PHP CLI و MultiPHP وب ۸.۴، TLS زیردامنه‌های API و Staging، MySQL جدا، Docroot خصوصی یا Bridge امن فاز ۱۰، Cron دقیقه‌ای و Heartbeat، Backup رمزگذاری‌شدهٔ offsite و Restore واقعی را بررسی می‌کند. فقط با مجوز میزبان، سه پروفایل ابزار k6 در Staging روی ۵۰ VU واقعی اجرا می‌شوند: read_only، account_write و verified_replay. خروجی‌ها با assess_phase10_k6.mjs و گزارش Resource Usage خود میزبان سنجیده شوند. CI با MySQL موقت یا گزارش k6 فرضی، اثبات ۵۰ کاربر هم‌زمان روی هاست نیست.

پس از استقرار Staging، Smoke read-only واقعی با URLهای مربوط به همان محیط:

~~~bash
node demian/tools/qa/phase11_remote_smoke.mjs \
  --target=staging --approval=READ_ONLY_STAGING_SMOKE_APPROVED \
  --pwa-origin=https://staging.demiancafe.ir \
  --api-origin=https://api-staging.demiancafe.ir \
  --sha=FULL_40_CHAR_RELEASE_SHA --pwa-release=FULL_16_CHAR_PWA_ID \
  --output=/private/phase11-remote-smoke.json
~~~

این ابزار فقط GET/OPTIONS، TLS، CORS، API Health و SHA، PWA Manifest، Service Worker و Offline Pack را بررسی می‌کند؛ هیچ POST یا Score/Player/Coupon نمی‌سازد. Production نیز تنها با عبارت جداگانهٔ READ_ONLY_PRODUCTION_SMOKE_APPROVED مجاز است.

## سند F11 و گیت نهایی

الگوی ops/phase11/acceptance.example.json **به عمد همه‌چیز را مسدود** می‌گذارد. در صورت انجام واقعی تست‌ها، نسخهٔ غیرشخصی را در فایل محلی ops/phase11/acceptance.production.json تهیه کن و **آن را کامیت نکن**؛ چون درج SHA خود کامیت در فایلی داخل همان کامیت غیرممکن است و با هر تغییر SHA عوض می‌شود. محتوای فایل را پس از تأیید امنیتی به‌صورت Base64 در Secret محیط cpanel-production با نام DEMIAN_PHASE11_ACCEPTANCE_B64 (سقف ۴۸KB؛ فایل خام کوچک) ثبت کن. این Secret فقط پس از تأیید محافظت‌شدهٔ محیط در Workflow خوانده می‌شود. قالب لازم:

- releaseSha: دقیقاً ۴۰ حرف SHA نهایی main؛ pwaReleaseId: دقیقاً ۱۶ حرف Release Artifact همان نسخه؛ recordedAt به UTC و تازه.
- checks: دقیقاً F11-01 تا F11-13؛ برای هرکدام status=accepted، releaseSha، checkedAt، reviewedBy و evidence با URL واقعی GitHub Issue/PR/Action/Commit، SHA256 و observedAt.
- risks: unresolvedP0=0، blockingP1=0، criticalSecurity=0، characterArtDebtAccepted=true **فقط بعد از بازسازی هنری واقعی**، financialActivationDuringQa=false.
- devices: Android اقتصادی، Android میان‌رده، iOS Safari، مدل واقعی/نسخه، تمام هفت بازی، ۱۵ دقیقه و اندازه‌گیری‌های حقیقی.
- loadRuns: سه سناریو با ۵۰ VU مشاهده‌شده، p95/p99، مدرک نتیجه و هش. نتیجهٔ برآوردی جای نتیجهٔ میزبان واقعی نیست.
- cafePilot: حداقل ۳ نفر داوطلب، رفع نقص‌های بحرانی، مدرک غیرشخصی.
- operations: SSL/CORS، PHP وب و CLI، Staging، Backup offsite/Restore، Cron، نسخهٔ API برابر SHA، SMS واقعی، صندوق و آزمایش rollback.
- reviewers: حساب GitHub متمایز engineering، security، operations، cafeOwner با زمان تأیید. تاریخ شواهد حداکثر ۳۰ روز؛ زمان آینده/نسخهٔ نامرتبط رد شود.

فایل عمومی نباید شماره مشتری، Token، IP خام، کلید API، دادهٔ پزشکی یا عکس خصوصی مشتری را شامل شود؛ جزئیات حساس در سیستم خصوصی مجاز و تنها پیوند شناسهٔ سانسورشده در GitHub نگهداری شود.

آزمایش گیت مستندات:

~~~bash
node demian/tools/qa/phase11_release_policy.mjs \
  --file=demian/ops/phase11/acceptance.production.json \
  --sha=FULL_40_CHAR_SHA --pwa-release=FULL_16_CHAR_PWA_ID \
  --output=/private/phase11-decision.json
~~~

**NO_GO** در صورت هر نقص؛ **HUMAN_REVIEW_REQUIRED** حتی اگر همهٔ مدرک‌های ثبت‌شده معتبر به‌نظر برسند. ابزار به‌تنهایی GO یا مجوز Production صادر نمی‌کند.

برای ساخت Secret در دستگاه مورد اعتماد پس از بسته‌شدن مدارک: در Linux/WSL دستور base64 -w0 demian/ops/phase11/acceptance.production.json را اجرا کن و فقط در Settings → Environments → cpanel-production → Environment secrets جای‌گذاری کن؛ به Shell History، Git یا پیام عمومی ارسال نکن. روی ویندوز PowerShell می‌توان از [Convert]::ToBase64String([IO.File]::ReadAllBytes('path-to-acceptance.production.json')) استفاده کرد. محتوای فایل باید فقط خلاصهٔ بدون PII باشد. Workflow پس از پایان، فایل موقت را پاک می‌کند.

## Workflow تصمیم انسانی

در GitHub → Settings → Environments، محیط cpanel-production باید با Required Reviewers و در صورت پشتیبانی Prevent Self Review تنظیم شود؛ **اضافه‌شدن فایل Workflow خودکار این تنظیم را فعال نمی‌کند**. سپس از Actions، workflow دستی Phase 11 protected GO / NO-GO candidate audit فقط روی main با release_sha، pwa_release_id، staging_deploy_run_id و عبارت REVIEWED_FINAL_EVIDENCE_NO_P0 اجرا شود. این workflow موفقیت release-qa و cPanel run را از API GitHub روی همان SHA کنترل می‌کند و پس از Review محیط، فقط Artifact با نتیجهٔ نامزد انتشار می‌سازد. REST API به‌تنهایی اثبات نمی‌کند کدام سرور/محیط واقعاً میزبان Run بوده است؛ مسئول عملیات باید آن را مستقل تأیید کند.

**Workflow به‌هیچ‌وجه Deploy، Migration یا فعال‌سازی جوایز ندارد.** بعد از تصمیم GO واقعی، عملیات انتشار cPanel از workflow جدا و دستی فاز ۱۰ با بکاپ و Preflight انجام می‌شود. انتشار خودکار PWA استاتیک هنگام commit روی main نیز هرگز معادل روشن‌شدن Ranked یا جوایز نیست.

### گیت مستقل انتشار Ranked روی GitHub Pages

بعد از پذیرش تجاری فاز ۱۱، صاحب مخزن متغیر GitHub به نام DEMIAN_PHASE11_APPROVAL_RUN_ID را برابر شمارهٔ اجرای موفق و بازبینی‌شدهٔ Workflow فاز ۱۱ روی **همان SHA** می‌گذارد. سپس فقط با اختیار رسمی، DEMIAN_ARCADE_ENABLE_RANKED=true و DEMIAN_ARCADE_API_URL را برای Build اصلی تنظیم و GitHub Pages Build را دوباره اجرا می‌کند. Workflow انتشار، موفقیت protected-review و تطبیق SHA را از GitHub API بررسی می‌کند. هر تغییر SHA نیازمند پذیرش تازه است. بدون این Run ID معتبر، Build مربوط به Ranked **متوقف می‌شود**؛ حالت تمرینی همچنان قابل انتشار است. روشن‌شدن Ranked، صدور یا مصرف Coupon را به‌تنهایی مجاز نمی‌کند.

**ترتیب نهایی cPanel:** ادغام PRهای پیش‌نیاز و CI سبز روی main؛ تهیهٔ Staging واقعی و SSL/DB مستقل؛ آزمون Android/iOS و Anti-cheat؛ سه سناریوی ۵۰ VU و Offsite Restore؛ پذیرش هنری و مالی؛ ذخیرهٔ صورت‌جلسه در Secret محیط؛ Workflow بازبینی F11؛ استقرار دستی API از Workflow فاز ۱۰ با Backup؛ Smoke واقعی read-only؛ و در نهایت فعال‌سازی تدریجی Ranked/جوایز صرفاً بعد از تایید صاحب کافه و مسئولان.

## مدیریت حادثه و وضعیت نهایی

هنگام P0، Replay تقلبی پذیرفته‌شده، صدور کوپن تکراری، افشای داده، کندی شدید یا قطعی: Feature Flagهای مالی/Ranked را متوقف کن، حالت Practice-only را نگه دار، Ledger و شواهد را حفظ و صاحب کافه را مطلع کن. Rollback فقط **کد** را با تأیید سازگاری Schema به نسخهٔ سالم بازمی‌گرداند؛ DB Migration و دادهٔ مشتری را خودکار برنگردان. ناسازگاری Schema نیازمند اصلاح Forward-only یا Restore انسانی با RPO/RTO مصوب است.

**بدهی‌ها / موانع فعلی:** استانداردسازی واقعی PNG/Atlas کاراکترهای فعال (TD-ART-001)، پذیرش فیزیکی Android و Safari iOS، ۵۰ VU و منابع واقعی cPanel، SMS و کوپن صندوق، Backup offsite/Restore واقعی. تا زمانی که همهٔ آن‌ها با سند معتبر بسته نشوند، وضعیت انتشار تجاری **NO-GO** است.
