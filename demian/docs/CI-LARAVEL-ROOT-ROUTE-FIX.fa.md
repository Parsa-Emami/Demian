# اصلاح 404 تست Laravel در GitHub Actions — نسخه 9.1.1

## نشانه خطا

در مرحله `php artisan test`، تست `CharacterManagerTest::test_studio_page_is_available` برای درخواست `GET /` پاسخ 404 دریافت می‌کرد، در حالی که مرحله `route:list` مسیر نام‌گذاری‌شده‌ی `studio` را مشاهده می‌کرد.

## علت

Workflow پیش از اجرای تست‌ها یک فایل `.env` تولید می‌کند که `APP_URL` آن آدرس پروژه در GitHub Pages است؛ یعنی آدرسی شامل زیرمسیر `/Demian`. این مقدار برای Export استاتیک صحیح است، اما نباید وارد محیط HTTP تست‌های Laravel شود. تست‌ها باید همیشه با یک Host محلی و بدون زیرمسیر اجرا شوند.

## اصلاح

1. `phpunit.xml` مقادیر `APP_ENV=testing`، `APP_URL=http://localhost` و `ASSET_URL=` را با `force=true` اعمال می‌کند.
2. مرحله تست Workflow همان مقادیر را به‌صورت Environment مستقل تعریف می‌کند.
3. Route ریشه به‌صورت صریح و بدون Prefix در `routes/web.php` ثبت شده است.
4. تست Feature علاوه بر پاسخ 200، وجود Route نام‌گذاری‌شده‌ی `studio` در URI ریشه را بررسی می‌کند.
5. Export استاتیک همچنان بعد از تست‌ها با `APP_URL` واقعی GitHub Pages اجرا می‌شود؛ بنابراین Base Path فایل‌های Production تغییر نمی‌کند.

## دستورات بررسی محلی

```bash
php artisan optimize:clear
php artisan route:list --name=studio
php artisan test tests/Feature/CharacterManagerTest.php
php artisan test
```
