# استقرار Atomic دمیان روی GitHub Pages

## خطای قبلی

در Buildهای قبلی هر بازی با Dynamic Import به فایل مستقلی مانند این تبدیل می‌شد:

```text
build/assets/RolePlayGame-<content-hash>.js
build/assets/OpenWorldGame-<content-hash>.js
```

GitHub Pages در هر استقرار Artifact جدید را جایگزین می‌کند. اگر مرورگر HTML یا Bundle قبلی را نگه می‌داشت، Runtime قدیمی فایل Hashدار حذف‌شده را درخواست می‌کرد و بازی با خطای `error loading dynamically imported module` متوقف می‌شد.

## راه‌حل

رجیستری بازی همچنان API غیرهمزمان دارد، اما Vite 8 با تنظیم زیر تمام Dynamic Importها را داخل یک Bundle قرار می‌دهد:

```js
build: {
    emptyOutDir: true,
    rolldownOptions: {
        output: {
            codeSplitting: false,
            strictExecutionOrder: true,
        },
    },
}
```

نتیجه:

- فقط یک فایل JavaScript منتشر می‌شود.
- Main Bundle هیچ وابستگی‌ای به Chunk مستقل بازی ندارد.
- `RolePlayGame-*`، `OpenWorldGame-*` و فایل‌های مشابه تولید نمی‌شوند.
- Build قبلی قبل از Build جدید از `public/build` حذف می‌شود.

## Validator تولید

`tools/validate_build_bundle.mjs` موارد زیر را بررسی می‌کند:

- وجود `public/build/manifest.json`
- Entry بودن `resources/js/app.js`
- نداشتن `dynamicImports` در تمام Entryها
- وجود فایل Entry روی دیسک
- تولید دقیقاً یک فایل JavaScript
- نبودن Chunk مستقل بازی‌ها

Workflow فقط در صورت عبور از این Validator اجازه ساخت Artifact و Deploy دارد.

## Recovery مرورگر

یک Script کوچک قبل از `@vite` در Blade ثبت شده است. این Script رویداد رسمی `vite:preloadError` و خطاهای Import را می‌شنود و فقط یک بار صفحه را با Query جدید بارگذاری می‌کند. Timestamp در `sessionStorage` مانع Loop بی‌نهایت می‌شود.

این Recovery برای انتقال بین نسخه‌هاست؛ راه‌حل اصلی همچنان Bundle Atomic است.

## Character Asset Fallback

Workflow فایل‌های سازگاری V4 را از V5 برای تیام، روناک، امیررضا و پارسا می‌سازد. در Runtime نیز اگر همه URLهای Atlas/Sprite شکست بخورند، یک Canvas Texture پیکسلی ساخته می‌شود. بنابراین خرابی Asset باعث توقف Map نمی‌شود.

## روند CI

1. نصب Composer با Dependencyهای تست
2. Migration و Seed
3. Laravel Test
4. JavaScript Smoke Tests
5. Validatorهای UI و فازهای ۳ تا ۸
6. Build تمیز Vite
7. Atomic Bundle Validation
8. ساخت Static Export
9. بررسی HTML، Character JSON، Assetها، Version Marker و تعداد Bundleها
10. Upload و Deploy Artifact رسمی GitHub Pages

## بررسی بعد از Deploy

فایل `_site/version.json` شامل Runtime، Commit، Run ID و `bundle_mode: atomic` است. صفحه نیز این Markerها را دارد:

```text
data-runtime-version="9.1.0-atomic-pixel2d"
data-deployment-mode="atomic-bundle"
```
