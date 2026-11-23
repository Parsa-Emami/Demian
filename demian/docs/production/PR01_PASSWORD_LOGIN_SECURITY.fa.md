# PR 01 — امنیت Production و ورود بدون OTP دمیان

## محدوده واقعی
ثبت‌نام بازیکن و ورود مجدد با رمز عبور انجام می‌شود؛ ارسال SMS یا OTP در مسیر `POST /api/v1/arcade/players/login` وجود ندارد. ثبت‌نام جدید در فرم بازی نیازمند راه ارتباطی و رمز حداقل ۱۲ نویسه است. ورود با نام کاربری/راه ارتباطی و رمز با موفقیت، توکن قبلی را به‌شکل اتمیک باطل می‌کند. صرف داشتن شماره یا ثبت‌نام، وضعیت `phone_verified` ایجاد نمی‌کند.

کاربران قدیمی که رمز ندارند، با کد پشتیبان/لینک بازیابی قبلی وارد می‌شوند و با `POST /api/v1/arcade/player/password` رمز تعیین می‌کنند. تغییر رمز موجود نیازمند رمز قبلی است. کد پشتیبان یک‌بارمصرف و مستقل از پیامک است. رمز و هش آن نباید به telemetry، localStorage، URL، لاگ یا پاسخ API برگردند. توکن بازی فقط در sessionStorage است و بازیابی رمز باید در محیط قابل‌اعتماد انجام شود.

## جداسازی ورود از جایزه
OTP برای **ورود بازیکن** لازم نیست؛ اما مسیر تأیید شماره موجود صرفاً برای احراز هویت **جوایز مالی** باقی مانده است. این PR صدور کوپن، امتیاز قابل‌جایزه، پایش مالی یا Rollout را فعال نمی‌کند. خاموش‌کردن SMS مالی بدون سیاست جایگزینِ تصویب‌شده به معنی لغو شرط اثبات هویت نیست؛ در Production همواره دروازه Verified Phone باید برقرار باشد و در غیر این صورت صدور کوپن متوقف بماند.

## Studio و مدیریت شخصیت‌ها
نقطه ورود Studio و CRUD کاراکترها فقط در حالت غیر `API_ONLY` و با نشست معتبر کارکنان، فعال بودن Portal، نقش `super_admin` و مجوز موجود `operations.readiness` در دسترس است. تعویض نقش یا Session Version و غیرفعال‌کردن کارمند دسترسی را قطع می‌کند. تمام POST/PATCH/DELETE در گروه `web` Laravel با CSRF اجرا می‌شوند. این مجوز عمداً نقش‌های `admin` (سه مجوز)، `cashier` و `manager` را افزایش نمی‌دهد.

سیاست CSP سخت‌گیرانه صندوق‌دار برای صفحات صندوق محفوظ است. صفحه Studio از اسکریپت‌های خود برنامه استفاده می‌کند، بنابراین همان CSP `default-src 'none'` روی Studio اعمال نمی‌شود؛ این صفحه همچنان خصوصی، No-Store و با `X-Frame-Options: DENY` است. اعمال CSP اختصاصی مبتنی بر Nonce بعد از حذف اسکریپت‌های inline باید جداگانه انجام شود.

## مهاجرت و استقرار
`2026_11_23_000001_add_arcade_player_password_hash.php` فقط فیلد nullable رمز هش‌شده را اضافه می‌کند؛ بدون بازنویسی داده‌های گذشته یا حذف کاربران. قبل از deploy روی Staging باید MySQL/SQLite CI، احراز هویت جدید، تغییر رمز، عدم افشای رمز، و جداسازی Studio بررسی شوند. `DEMIAN_COUPONS_CAFE_ENABLED` برای ورود مدیریتی Studio نیاز است ولی این پرچم به معنی مجوز جوایز نیست. تنظیم `DEMIAN_ARCADE_API_ONLY=true` برای هاست عمومی حفظ می‌شود.

در GitHub Settings → Rules → Rulesets باید برای `main` بررسی PR، وضعیت الزامی تست‌ها و رد push مستقیم فعال شود؛ اتصال GitHub این PR دسترسی تغییر Ruleset را اعمال نکرده است.

## معیارهای پیشنهادی تست
```bash
cd demian
composer install --no-interaction --prefer-dist
php artisan test --filter=ProductionSecurityPasswordLoginTest
php artisan test --filter=CharacterManagerTest
php artisan test --filter=RouteRegistrationTest
npm ci
npm run test:ci
npm run build:static
npm run validate:static-assets
npm run validate:build
```

`playable/` یک Snapshot خروجی قبلی است؛ خروجی رسمی باید از سورس جدید ساخته و از GitHub Actions کنترل شود. تا سبزشدن CI روی SHA نهایی، هیچ ادعای Production-Ready مجاز نیست.
