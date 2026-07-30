# Hotfix مسیرهای Laravel 13 — نسخه 8.1.2

در نسخه 8.1.1 مسیرها به‌صورت دستی در `AppServiceProvider` ثبت شده بودند. این مسیرها در `route:list` قابل مشاهده بودند، اما چرخه‌ی HTTP Test Kernel در GitHub Actions می‌توانست Route Collection نهایی را بدون Route وب بسازد و پاسخ `/` برابر 404 شود.

اصلاح نسخه 8.1.2:

- ثبت `routes/web.php` و `routes/api.php` در `bootstrap/app.php` با `Application::withRouting()`؛
- حذف ثبت دستی و تکراری Routeها از `AppServiceProvider`؛
- افزودن تست دسترسی واقعی HTTP برای `/` و `/api/v1/events/active`؛
- اجرای تست Route قبل از کل Feature Suite در CI؛
- تنظیم `APP_URL=http://localhost` برای Test Process.
