# PR07 — Production Hardening & Real-Device QA

## وضع واقعی انتشار
این PR کنترل‌های CI هفت بازی، چهار Viewport، PWA و ثبت شاهد را تقویت می‌کند. PASS آزمایشگاهی معادل تأیید فیزیکی Android، iPhone Safari، باتری، گرما، لمس تا نمایش روی پنل، cPanel واقعی یا اجازهٔ جوایز مالی **نیست**. Production و Coupons همچنان NO_GO می‌مانند تا شواهد بیرونی بررسی شود.

## ۱. دروازه CI

- ابزار 'tools/qa/pr07_collect.mjs' شش گزارش تولیدشده توسط Workflow اصلی را از همان محیط بررسی می‌کند: Step31، runtime soak هفت بازی، چهار Viewport (320×568، 390×844، 844×390، 1440×900)، Touch/Orientation، Offline PWA هفت بازی و بازیابی پس از خرابی Resource.
- Artifact با نام 'pr07-lab-<SHA>' به Commit متصل است، فقط شاخص‌های غیرشخصی دارد و حالت 'physicalAndroidVerified=false' و 'physicalIphoneSafariVerified=false' را حفظ می‌کند.
- Job مستقل 'release-qa' با ابزار 'pr07_verify_ci.mjs' همین Artifact را با SHA همان Commit و نتایج موفق Build/Backend بررسی می‌کند. فقدان گزارش، خطا، ادعای دستگاه واقعی یا SHA اشتباه باید باعث شکست CI شود.
- FPS اندازه‌گیری‌شده در Browser بر پایه render submission است؛ JS heap، memory واقعی GPU/OS نیست و touch proxy جای touch-to-photon نیست.

## ۲. سنجش سه دستگاه واقعی

**سه دستگاه مستقل** موردنیازند: Android اقتصادی Chrome، Android میان‌رده Chrome و iPhone Safari با PWA نصب‌شده. هر دستگاه حداقل ۱۵ دقیقه بازی فعال؛ در هر دستگاه هر یک از هفت بازی حداقل یک دقیقه. بازی‌ها: Open World، Dino Run، After Hours، Café Rush، Café Critters، Coffee Crash، Café Drift.

برای هر بازی ثبت شود: Start، Controls، Pause/Resume، Retry، Result و Return to Menu؛ p50 FPS و p95 فاصله Frame، p95 تأخیر Event-to-Render، رشد JS Heap، تعداد نمونه، نسخه PWA و SHA. حالت هدف ۳۰ FPS برای دستگاه اقتصادی فقط با ثبت صریح آن پذیرفته می‌شود.

برای هر گوشی این موارد را بررسی کنید: Landscape/Portrait/Safe Area/Notch، لمس هم‌زمان، فضای هدف لمسی ۴۴px، RTL، Focus و Keyboard، Reduced Motion و Contrast؛ خاموش/روشن کردن اینترنت، Practice آفلاین، جلوگیری از ثبت آفلاین امتیاز تاییدشده، قطع ارسال امتیاز و نبود Duplicate، تعویض Wi-Fi/Cellular، PWA old-tab update و Background/Resume. درصد باتری ابتدا/انتها و شواهد واقعی OS برای حافظه Native و حرارت باید جداگانه گردآوری شوند.

حالت '?deviceQa=1' و Runtime Soak فقط opt-in هستند. حتی روی گوشی واقعی، مقدار 'physicalPhoneVerified=false' در خروجی Browser طبیعی است و **نباید جعل یا تغییر داده شود**.

## ۳. قالب و بازبینی مستقل

- از 'ops/pr07/device-acceptance.example.json' نسخهٔ خصوصی تهیه کنید و مطابق 'tools/qa/pr07_field_policy.mjs' آن را **با دادهٔ واقعاً اندازه‌گیری‌شده** تکمیل کنید.
- خروجی JSON خام و فیلم/عکس فقط در محل خصوصی محدود و رمزنگاری‌شده؛ Hash SHA-256 هر مدرک را جداگانه ضبط کنید. نام بازیکن، IP، شماره تماس، Cookie/Token، ویدئو یا اطلاعات شخصی نباید در GitHub عمومی قرار گیرند.
- هر دستگاه یک Operator و یک Reviewer مستقل لازم دارد. تأیید هرکدام باید با مشاهدهٔ واقعی مستندات و سخت‌افزار انجام شود، نه صرفاً فایل JSON.
- اجرای اعتبارسنجی فقط روی ماشین مورداعتماد:

~~~bash
cd demian
node tools/qa/pr07_field_policy.mjs \
 --file=/secure/private/pr07-device-report.json \
 --sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
 --pwa-release=bbbbbbbbbbbbbbbb \
 --output=/secure/private/pr07-review.json
~~~

'NO_GO' یعنی شواهد ناقص. 'HUMAN_REVIEW_REQUIRED' یعنی ساختار و آستانه ادعایی قابل بررسی انسانی است؛ **به‌هیچ‌وجه GO یا attestation سخت‌افزاری نیست**.

## ۴. باقی‌مانده برای انتشار تجاری

- فعال‌سازی حقیقی GitHub Branch Protection و Required Checks/Environment Reviewers توسط مالک ریپو.
- پذیرش واقعی Staging cPanel (PHP 8.4، HTTPS، SSL/CORS، MySQL، Cron، بکاپ خارج از هاست و Restore).
- تست بار ۵۰ کاربر در هاست با اجازهٔ سرویس‌دهنده، p95/p99 و پایش 508/EP/PMEM/Database locks.
- پذیرش تصاویر و Spriteهای تمام کاراکترها؛ تکمیل بدهی هنری.
- بررسی مستقل ضدتقلب، هویت جایزه، Weekly Winners و استفاده اتمیک کوپن با دو صندوق‌دار روی Staging مجاز.
- تکمیل Issue #117 و امضای چهار نقش Engineering، Security، Operations و Cafe Owner برای GO/NO-GO.

هیچ اسکریپت PR07 اجازهٔ deploy یا فعال‌سازی جوایز را نمی‌دهد.
