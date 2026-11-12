# Mobile-01 — پایش پایهٔ عملکرد بازی Demian روی موبایل

**وضعیت:** ابزار Benchmark و گزارش خودکار CI. این فاز برای **اندازه‌گیری** است و موتور بازی، Assetها یا مدل امتیازدهی را تغییر نمی‌دهد.

## دامنه و خروجی

این فاز، نسخهٔ ساخته‌شده با `npm run build:static` را به‌عنوان محصول واقعی مرورگر آزمایش می‌کند:

1. فهرست فایل‌های خروجی `_site/`: تعداد، حجم بایت روی دیسک، فرمت‌ها، گروه‌های پوشه و ۲۵ فایل بزرگ.
2. ورود سرد و گرم به منو: زمان رسیدن به وضعیت `menu` از دید ابزار، اطلاعات Paint در صورت پشتیبانی، و حجم منتقل‌شده از شبکه.
3. اجرای هر **شش بازی فعال** از کاتالوگ: Open World، Dino Run، After Hours، Café Rush، Café Critters و Coffee Crash؛ زمان ورود به `playing`، بایت انتقالی در مرحلهٔ شروع، تعداد فریم‌های Renderشده و توزیع فاصله فریم.
4. ثبت لمس شبیه‌سازی‌شده و تأخیر تا ثبت خروجی Render (نه Touch-to-Photon واقعی).
5. شاخص‌های Chromium CDP: ScriptDuration، V8CompileDuration و TaskDuration در صورت پشتیبانی، JavaScript Heap و DOM Node Count.
6. خطاهای JavaScript، درخواست‌های شبکه ناموفق و HTTP Errorها.
7. بودجه‌های اولیه صرفاً **هشدار** هستند؛ با داده پایه‌ای و گوشی واقعی نهایی می‌شوند.

نتیجه فایل JSON قابل‌مقایسه در `demian/docs/mobile-01/baseline/mobile-<profile>.json` است. GitHub Actions فایل را با Artifact تست‌های مرورگر ضمیمه می‌کند، حتی اگر اجرای آزمایش شکست بخورد.

## اجرای مجدد

از ریشهٔ `demian/`:

```bash
npm ci
npm run test:ci
npm run build:static
npm run validate:build
npx playwright install chromium --only-shell
npm run benchmark:mobile:ci
```

برای شبیه‌سازی ضعیف‌تر به‌صورت دستی:

```bash
DEMIAN_MOBILE_BENCH_PROFILE=low-mobile npm run benchmark:mobile
```

برای انتقال مسیر گزارش و محل خروجی:

```bash
DEMIAN_BENCH_RELEASE_DIR=/path/to/_site \
DEMIAN_BENCH_REPORT_DIR=/path/to/report \
npm run benchmark:mobile
```

Profile پیش‌فرض `mid-mobile` برابر 390×844 با DPR=2، کندسازی CPU دوبرابری، ۸۰ میلی‌ثانیه تأخیر شبکه و سقف دانلود تقریبی ۳ MB/s است؛ `low-mobile` برابر 320×568 با DPR=1، CPU چهاربرابر کندتر، تأخیر ۱۵۰ ms و حدود ۹۵۰ KB/s است. این‌ها **پروفایل آزمایشگاهی ثابت** هستند، نه ادعای بازنمایی یک مدل خاص گوشی.

### قواعد خواندن داده

- `inventory.totalBytes` حجم کل Artifact روی دیسک است. این عدد **دانلود اولیه کاربر نیست**.
- `coldMenu.network.encodedTransferBytes` مجموع داده انتقالی ثبت‌شده توسط Chrome DevTools Protocol است؛ با `warmMenu` مقایسه شود. این عدد هزینه نهایی ترافیک هاست نیست.
- `games[].network` درخواست‌هایی را نمایش می‌دهد که در مرحله شروع آن بازی آغاز شده‌اند. Assetهای Deferred ممکن است بعداً مصرف شوند؛ دوره نمونه‌گیری پس از ورود به بازی نیز جزو این مرحله است.
- `games[].render.frameIntervalMs` فاصله فریم‌های واقعاً تحویل‌داده‌شده به موتور رندر را از **همان DeviceQaSession موجود** گزارش می‌کند؛ FPS مانیتور یا تعداد رفرش فیزیکی نمایشگر نیست.
- `games[].render.eventToRenderSubmissionMs` تأخیر لمس مرورگر تا ارسال فریم است، نه تأخیر واقعی صفحه یا اثبات مصرف ورودی توسط منطق بازی.
- `browserMetrics.jsHeapUsedBytes` حافظه JS را نشان می‌دهد؛ **GPU، حافظه تصاویر Decodeشده و RAM کامل مرورگر را نشان نمی‌دهد**.
- `batteryDrain`، `residentMemoryBytes`، `thermalState` و `actualTouchToPhotonMs` عمداً `null` هستند، نه صفر یا «تأییدشده».
- `advisory[].status=investigate` صرفاً علامت بررسی است؛ چون Thresholdهای عمومی هنوز با گوشی واقعی و Baseline پایدار کالیبره نشده‌اند.

## گیت CI و خطاها

گیت سخت این فاز:

- بارگذاری نسخهٔ استاتیک و رسیدن به منو؛
- بازشدن هر شش مینی‌گیم در `playing`؛
- بدون Exception سطح صفحه در JavaScript؛
- تولید صحیح گزارش JSON.

هیچ مرز عددی قراردادی برای حجم/FPS/زمان شروع در این PR به‌تنهایی CI را قرمز نمی‌کند؛ اعداد صرفاً ثبت می‌شوند تا در PRهای Mobile-02 تا Mobile-06 تصمیم‌های اندازه‌گیری‌شده گرفته شوند.

خطاهای شبکه، HTTP Error، نداشتن نمونه فریم یا لمس، در گزارش ثبت می‌شوند و باید بررسی شوند. نبود نمونه فریم «PASS سخت‌افزاری» محسوب نمی‌شود. ابزار از `?deviceQa=1` استفاده می‌کند و Telemetry خارجی نمی‌فرستد.

## ارتباط با انتشار Production و تست دستگاه واقعی

این ابزار به نسخه موجود `DeviceQaController` متکی است، سازگاری با Atomic JS Bundle را تغییر نمی‌دهد و هیچ فرایند امتیاز آنلاین، حساب یا دیتابیس را دستکاری نمی‌کند. `playable/` و کد Render/Gameplay بدون تغییر باقی می‌مانند.

**تست گوشی واقعی هنوز مستقل و الزامی است:** [Issue #7](https://github.com/Parsa-Emami/Demian/issues/7) برای Android و iPhone. روی هر گوشی، بازی با `?deviceQa=1` اجرا شود؛ حداقل ۱۵ دقیقه بازی، چند بار تعویض شخصیت، لمس دو انگشتی، Pause/Resume و تغییر Orientation ثبت شود. فایل JSON همراه با اندازه‌گیری حافظه فرآیند و شواهد ویدیویی Touch-to-Photon ضمیمه شود. شبیه‌ساز مرورگر نمی‌تواند محدودیت‌های GPU، حافظه/گرما و باتری گوشی واقعی را بازآفرینی کند.

## معیارهای پیشنهادی (برای بازنگری بعد از Benchmark)

| شاخص | هدف اولیه، نه نتیجه |
|---|---|
| زمان منوی موبایل میان‌رده 4G | <= 5 ثانیه |
| دانلود اولیه منو | <= 5 MiB در شرایط استاندارد |
| Rendering | ترجیحاً 60 FPS؛ fallback پایدار 30 FPS |
| p95 فاصله فریم | <=20ms در 60 FPS یا <=38ms در 30 FPS |
| p95 لمس تا Render Submission | <=50ms (proxy) |
| مصرف حافظه | بدون رشد مداوم غیرقابل‌بازگشت در چرخه بازی |
| خطای JavaScript | صفر در مسیرهای اصلی |
| Missing Asset بحرانی | صفر، پس از دسته‌بندی fallbackهای مجاز |

برای بررسی هدف‌های تجربه وب:
- [Chrome DevTools mobile emulation](https://developer.chrome.com/docs/devtools/device-mode)
- [Chrome DevTools CPU/network throttling](https://developer.chrome.com/docs/devtools/settings/throttling/)
- [web.dev Interaction to Next Paint](https://web.dev/articles/inp)
- [محدودیت‌های آزمایش موبایل و نیاز به دستگاه واقعی](https://developer.chrome.com/blog/devtools-grounded-real-world)

## مراحل بعدی

- **Mobile-02:** با استفاده از `inventory` و درخواست‌های شبکه، Assetهای منتشرشده اما غیرضروری حذف شوند؛ سورس و تاریخچه نگه داشته شوند.
- **Mobile-03:** اندازه‌گیری و محدودکردن هزینه Decode و Cache اطلس‌ها در هر بازی/شخصیت.
- **Mobile-04:** بهینه‌سازی بارگذاری و سناریوهای اینترنت ضعیف براساس Baseline واقعی.
- **Mobile-05/06:** اصلاح لمس، FPS، چرخه عمر و مصرف انرژی با شواهد گوشی واقعی.

این گزارش جایگزین تست امنیت API یا قابلیت‌های لیدربورد هفتگی نیست. Epic رقابت آنلاین: [#8](https://github.com/Parsa-Emami/Demian/issues/8). فهرست انتشار موبایل: [#10](https://github.com/Parsa-Emami/Demian/issues/10).
