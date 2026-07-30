# گزارش پیاده‌سازی فاز دوم Demian Game Platform

## هدف فاز

فاز دوم، لایه‌ی **Café Demian Game Room** و چرخه‌ی استاندارد اجرای بازی را روی هسته‌ی فاز اول پیاده‌سازی می‌کند. این فاز عمداً منطق بازی جدیدی مثل Tetris اضافه نمی‌کند؛ هدف آن ساخت پوسته‌ای است که تمام بازی‌های بعدی بدون تغییر هسته بتوانند در آن ثبت، بارگذاری، اجرا، متوقف، تکمیل و خارج شوند.

## خروجی‌های اصلی

- Boot Screen با progress واقعی مراحل راه‌اندازی
- Café Demian Menu روی پس‌زمینه‌ی زنده‌ی Open World
- Game Selection داده‌محور برای پنج بازی برنامه‌ریزی‌شده
- Loading Screen متصل به رویدادهای Lazy Load، preload و enter
- Pause Modal با Resume، Restart، Settings و Exit
- Settings Modal با ذخیره‌سازی نسخه‌دار و اعتبارسنجی
- Results Screen عمومی برای بازی‌های آینده
- Session State Machine مستقل از Screen State
- Screen Manager صف‌شده با Primary Screen و Modal Stack
- چرخه‌ی استاندارد ورود، شروع Session، Pause، Resume، Results، Restart و Exit
- Control Layout Service برای جداسازی کنترل موبایل هر Input Context
- Anime.js facade مرکزی با پشتیبانی Reduced Motion و WAAPI fallback

## تصمیم‌های معماری

### ۱. جداسازی Loaded Game از Active Session

نمونه‌ی Open World در منوی کافه به‌عنوان پس‌زمینه‌ی زنده باقی می‌ماند، اما تا زمان شروع Session ورودی gameplay دریافت نمی‌کند. این مدل از ساخت دوباره‌ی Renderer و World جلوگیری می‌کند و برای منوهای زنده‌ی آینده قابل استفاده است.

### ۲. دو State Machine مستقل

- `SessionStateMachine`: وضعیت برنامه را نگه می‌دارد: `booting`, `menu`, `loading`, `playing`, `paused`, `results`, `disposed`.
- `ScreenManager`: نمایش DOM را با یک Primary Screen و یک Modal Stack مدیریت می‌کند.

این جداسازی مانع وابستگی منطق بازی به ساختار صفحه و DOM می‌شود.

### ۳. جابه‌جایی تراکنشی بازی

`GameApplication.performGameSwitch()` تا زمانی که بازی جدید با موفقیت `preload()` و `enter()` نشده، بازی قبلی را نگه می‌دارد. اگر بارگذاری شکست بخورد، Runtime و بازی قبلی بازیابی می‌شوند و خطا از طریق Event Bus منتشر می‌شود.

### ۴. تنظیمات نسخه‌دار

`SettingsStore` داده‌ی localStorage را قبل از استفاده normalize می‌کند و فقط enumها و booleanهای معتبر را می‌پذیرد. قرارداد Store مستقل از DOM است و بعداً می‌تواند با Profile API یا Save Manager جایگزین شود.

### ۵. انیمیشن به‌عنوان Infrastructure

هیچ Screen یا Game مستقیماً Anime.js را import نمی‌کند. تمام حرکت‌های رابط از `AnimationService` عبور می‌کنند تا Reduced Motion، cancel، tracking و fallback در یک محل کنترل شوند.

## ساختار افزوده‌شده

```text
resources/js/game/
├── application/
│   ├── GameApplication.js
│   └── SessionStateMachine.js
├── catalog/
│   └── GameCatalog.js
├── controls/
│   └── ControlLayoutService.js
├── settings/
│   └── SettingsStore.js
└── shell/
    ├── GameShell.js
    ├── ScreenManager.js
    └── screens/
        ├── BaseScreen.js
        ├── BootScreen.js
        ├── CafeMenuScreen.js
        ├── GameSelectionScreen.js
        ├── LoadingScreen.js
        ├── PauseScreen.js
        ├── SettingsScreen.js
        └── ResultsScreen.js
```

## قرارداد توسعه‌ی بازی بعدی

برای افزودن بازی جدید:

1. یک کلاس بر پایه‌ی `BaseGame` ساخته شود.
2. loader آن در `GameDefinitions.js` ثبت شود.
3. metadata و کارت آن در `GameCatalog.js` فعال شود.
4. Input Context و Control Layout مخصوص آن اضافه شود.
5. بازی فقط از context و serviceهای مشترک استفاده کند و Renderer یا loop جدا نسازد.

حداقل lifecycle:

```js
async preload(context) {}
async enter(context, params) {}
startSession(params) {}
applySettings(settings) {}
fixedUpdate(deltaTime, input) {}
update(deltaTime) {}
render(alpha, deltaTime) {}
pause() {}
resume() {}
async exit() {}
dispose() {}
```

## رویدادهای مهم

- `session:changed`
- `screen:changed`
- `game:loading`
- `game:loading-step`
- `game:launched`
- `game:load-failed`
- `game:session-started`
- `game:session-paused`
- `game:session-resumed`
- `game:completed`
- `game:exited`
- `settings:applied`

## اعتبارسنجی انجام‌شده

- ۲۱ تست JavaScript از ۲۱ تست موفق
- بررسی syntax تمام فایل‌های JavaScript
- بررسی resolve شدن تمام importهای نسبی
- بررسی تعادل braceهای CSS
- بررسی یکتایی markerهای هفت Screen در Blade
- اعتبارسنجی JSON فایل `package-lock.json`
- حذف URLهای mirror قبلی و استفاده از registry استاندارد npm

## محدودیت محیط اجرا

اجرای `npm ci` در sandbox به دلیل پاسخ 404 رجیستری داخلی محیط برای tarball مربوط به `yargs-parser` کامل نشد؛ بنابراین build نهایی Vite در همین محیط قابل اجرا نبود. این خطا از lockfile پروژه نبود و URLهای lockfile به registry استاندارد npm اصلاح شده‌اند. همچنین به علت نبود `vendor/`، تست Laravel در sandbox اجرا نشد.

## وضعیت فاز

فاز دوم از نظر معماری و source code کامل است و فاز سوم می‌تواند Tetris را صرفاً به‌عنوان یک Game Module جدید روی همین lifecycle اضافه کند.
