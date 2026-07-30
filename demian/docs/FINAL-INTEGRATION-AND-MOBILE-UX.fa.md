# نسخه‌ی نهایی یکپارچه Demian Game Platform 8.1

این نسخه یک Snapshot مستقل و تجمعی است؛ تمام تغییرات فازهای ۱ تا ۸ داخل همین پروژه قرار دارند و برای استفاده از آن نیازی به اعمال Patchهای قبلی نیست.

## ساختار تجمعی فازها

1. هسته‌ی پلتفرم، Renderer و Game Loop مشترک
2. Game Shell، Screen Manager، Settings و lifecycle استاندارد
3. Tetris قطعی با Replay
4. Collision، Interaction و Navigation مشترک
5. Hide & Seek کامل
6. Event Framework داده‌محور و API سمت سرور
7. Role Play، Dialogue، Quest، Inventory و Save
8. Open World گسترده، Chunk Streaming، Mini Map، World Map و Save Point

## ریفکتور نهایی نمایش بازی

- محاسبه‌ی Viewport بر پایه‌ی `VisualViewport` و واحدهای `dvh/svh`
- تفکیک سه حالت Viewport: `shell`، `gameplay` و `character-sheet`
- فعال‌شدن Landscape اجباری فقط در Gameplay واقعی
- تعلیق Orientation Lock هنگام بازشدن پنل انتخاب کاراکتر
- بازگردانی Orientation بازی بعد از بسته‌شدن پنل
- حفظ Safe Area در دستگاه‌های دارای notch
- جلوگیری از تغییر اندازه‌ی ناخواسته‌ی Canvas و HUD
- فعال‌ماندن Zoom مرورگر در رابط‌های منو و مدیریت

## انتخاب کاراکتر در موبایل

فهرست کاراکترها به یک Scroll Rail بومی تبدیل شده است:

- اسکرول افقی لمسی
- CSS Scroll Snap
- توقف دقیق روی هر کارت
- دکمه‌های قبلی و بعدی
- نمایش موقعیت فعلی مانند `2 / 5`
- پیمایش با کلیدهای جهت، Home، End و PageUp/PageDown
- Roving visual state و `aria-current`
- `aria-posinset` و `aria-setsize`
- حفظ کارت فعال پس از Render مجدد
- بسته‌شدن کنترل‌شده‌ی Bottom Sheet بعد از فعال‌سازی کاراکتر
- ادامه‌ی اسکرول عمودی خود Sheet بدون قفل‌شدن لمس روی `body`

## کتابخانه‌ی بازی در موبایل

Game Selection نیز از همان `ScrollSnapRail` استفاده می‌کند:

- کارت‌های بزرگ و خوانا در موبایل
- اسکرول افقی با Snap
- کنترل‌های قبلی/بعدی و شمارنده
- Focus قابل پیش‌بینی برای کیبورد و کنترلرهای دسترس‌پذیری
- حفظ Grid پنج‌ستونه در دسکتاپ
- نمایش توضیح بازی در Portrait و حالت فشرده در Landscape کوتاه

## معماری ScrollSnapRail

`resources/js/ui/ScrollSnapRail.js` هیچ Drag مصنوعی ایجاد نمی‌کند. مرورگر مسئول Gesture و Momentum است و کنترلر فقط این موارد را هماهنگ می‌کند:

- تشخیص نزدیک‌ترین کارت به مرکز Viewport
- همگام‌سازی دکمه‌ها و شمارنده
- پیمایش برنامه‌ای امن با `scrollIntoView`
- Refresh بعد از Render داده‌های Async
- ResizeObserver
- Keyboard navigation
- Dispose کامل listenerها

این مؤلفه مستقل از مدل Character یا Game Catalog است و برای فروشگاه، Inventory، انتخاب Map یا Skinهای آینده نیز قابل استفاده است.

## اجرای کامل اعتبارسنجی

```bash
npm run test:js
npm run validate:phase3
npm run validate:phase4
npm run validate:phase5
npm run validate:phase6
npm run validate:phase7
npm run validate:phase8
npm run validate:final
php artisan test
npm run build
```

## نصب

```bash
cd demian
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
npm ci
npm run test:js
npm run validate:final
npm run build
php artisan serve
```
