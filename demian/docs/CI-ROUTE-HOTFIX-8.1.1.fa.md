# اصلاح CI و Routeهای Laravel — نسخه 8.1.1

## نشانه خطا

تمام Feature Testها برای `/`، `/characters` و `/api/v1/events/...` پاسخ 404 دریافت می‌کردند، در حالی که Unit Testها موفق بودند. این الگو نشان می‌دهد Application بوت شده اما Routeهای پروژه داخل Router ثبت نشده‌اند.

## اصلاح انجام‌شده

- ثبت صریح `routes/web.php` و `routes/api.php` در `AppServiceProvider`.
- حذف وابستگی Routeهای پروژه به callback ضمنی `withRouting` و نگه‌داشتن فقط command/health در bootstrap.
- رعایت `routesAreCached()` برای سازگاری با `route:cache` در Production.
- افزودن `RouteRegistrationTest` برای تشخیص مستقیم نبود Routeها.
- افزودن Smoke Check در GitHub Actions پیش از PHPUnit.
- پاک‌سازی config/route cache و اجرای PHPUnit با محیط testing و SQLite در حافظه.

## Routeهای اجباری CI

- `GET /` با نام `studio`
- `GET /characters` با نام `characters.index`
- `GET /api/v1/events/active`
- `POST /api/v1/events/{event}/sessions`

## اجرای محلی

```bash
php artisan optimize:clear
php artisan route:list
php artisan test
```
