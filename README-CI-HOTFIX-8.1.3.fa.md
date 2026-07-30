# Hotfix 8.1.3 — جداسازی Vite از تست‌های Laravel

## علت خطا

Routeها در نسخه 8.1.2 به‌درستی ثبت می‌شدند، اما Feature Test مربوط به `/` قبل از اجرای `npm run build`، View را رندر می‌کرد. دستور `@vite` در Blade برای محیط تست به دنبال `public/build/manifest.json` می‌گشت و چون Build فرانت‌اند هنوز اجرا نشده بود، تست با خطای `Vite manifest not found` متوقف می‌شد.

## اصلاح

- افزودن `$this->withoutVite()` در `tests/TestCase.php` برای تمام تست‌های Laravel.
- حفظ Build واقعی Vite در مرحله مستقل CI و بررسی `public/build/manifest.json` بعد از Build.
- افزودن Guard در Workflow برای جلوگیری از حذف ناخواسته Mock مربوط به Vite.
- افزودن بررسی این قرارداد در `validate:final`.
- ارتقای نسخه به `8.1.3`.

این ساختار مسئولیت‌ها را جدا می‌کند: PHPUnit رفتار HTTP و View را تست می‌کند و Workflow در مرحله‌ی مستقل، Bundle واقعی Vite و Manifest تولیدشده را اعتبارسنجی می‌کند.
