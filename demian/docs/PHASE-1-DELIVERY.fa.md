# گزارش تحویل فاز اول Demian Game Platform

## نتیجه

فاز اول معماری چندبازی بدون تغییر عمدی در ظاهر و رفتار Open World پیاده‌سازی شد. مسئولیت‌های متمرکز در `DemianStudio` به هسته‌ی برنامه، runtime مشترک، رجیستری lazy، ورودی context-aware و بازی مستقل Open World تفکیک شده‌اند.

## اجزای اصلی

```text
GameApplication
├── RendererService      یک WebGLRenderer مشترک
├── GameRuntime          یک حلقه‌ی ثابت 60Hz
├── InputRouter          ورودی مبتنی بر Context
├── GameRegistry         بارگذاری Lazy بازی‌ها
├── AnimationService     مرز Anime.js برای Shell/HUD
├── PerformanceProfile   پروفایل مشترک دستگاه
└── OpenWorldGame        دنیای فعلی و سیستم‌های مخصوص آن
```

### فایل‌های کلیدی

- `resources/js/game/application/GameApplication.js`
- `resources/js/game/runtime/GameRuntime.js`
- `resources/js/game/registry/GameRegistry.js`
- `resources/js/game/registry/GameDefinitions.js`
- `resources/js/game/input/InputRouter.js`
- `resources/js/game/input/InputContexts.js`
- `resources/js/game/contracts/BaseGame.js`
- `resources/js/game/games/open-world/OpenWorldGame.js`
- `resources/js/game/services/RendererService.js`
- `resources/js/game/services/AnimationService.js`

## تصمیم‌های معماری

- فقط یک `THREE.WebGLRenderer` و یک game loop در کل برنامه وجود دارد.
- هر بازی از lifecycle مشترک `BaseGame` استفاده می‌کند.
- ماژول بازی‌ها فقط هنگام launch بارگذاری می‌شوند و importهای شکست‌خورده قابل retry هستند.
- جابه‌جایی بازی‌ها به‌صورت صف‌شده انجام می‌شود تا launchهای هم‌زمان race condition ایجاد نکنند.
- ورودی‌های فیزیکی و مجازی ابتدا به اکشن‌های معنایی تبدیل می‌شوند؛ بنابراین Space در Open World برابر `jump` و در Tetris برابر `hardDrop` است.
- ورودی‌های transient تا اولین fixed update مصرف نمی‌شوند و در فریم‌های سریع از دست نمی‌روند.
- Anime.js پشت `AnimationService` قرار دارد و وارد منطق domain بازی نشده است. نسخه‌ی 4.5.0 ESM به‌صورت lazy از jsDelivr بارگذاری می‌شود و در صورت نبود شبکه، WAAPI fallback فعال می‌ماند.
- فایل‌های قدیمی `DemianStudio` و `InputController` به adapter سازگار تبدیل شده‌اند تا importهای قبلی نشکنند.

## تست‌ها

دستور زیر با موفقیت اجرا شد:

```bash
npm run test:js
```

نتیجه: 9 تست از 9 تست پاس شد.

پوشش فعلی شامل این موارد است:

- lazy loading و cache رجیستری
- retry پس از import ناموفق
- تشخیص game id تکراری و ناشناخته
- fixed timestep قطعی
- حفظ ورودی transient تا fixed update
- سقف catch-up و گزارش frame drop
- lifecycle مربوط به pause/resume
- تفاوت mapping ورودی Open World و Tetris
- حفظ تمام نام اکشن‌های فعلی Open World

همچنین syntax تمام فایل‌های JavaScript در `resources/js` و `tests/js` با `node --check` تأیید شد.

## محدودیت اعتبارسنجی محیط تحویل

`npm run build` در محیط تحویل قابل اجرا نبود، چون URLهای tarball در `package-lock.json` به `mirror-npm.runflare.com` اشاره می‌کنند و DNS آن mirror در sandbox قابل resolve نبود. `php artisan test` نیز به دلیل نبود `vendor/autoload.php` قابل اجرا نبود. این دو مورد باید پس از نصب dependencyها در محیط توسعه‌ی پروژه اجرا شوند.

## اجرای پروژه

```bash
composer install
npm install
npm run test:js
npm run build
php artisan test
php artisan serve
```

## افزودن بازی بعدی

1. یک کلاس از `BaseGame` بسازید.
2. loader آن را در `GameDefinitions.js` ثبت کنید.
3. Context ورودی آن را تعریف کنید.
4. Scene، قوانین و HUD مخصوص بازی را داخل پوشه‌ی همان بازی نگه دارید.
5. Renderer یا game loop جدید نسازید و سرویس‌های مشترک را از context دریافت کنید.
