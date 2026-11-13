# Mobile-02 — بستهٔ Production بدون فایل‌های ساخت و نسخه‌های منسوخ

**Scope:** این فاز فقط **Artifact خروجی استاتیک** را کوچک می‌کند؛ `demian/public/assets`، ابزارهای ساخت آرت، تصویرهای مرجع و تاریخچه Git را حذف یا تغییر نمی‌دهد. اجرای بازی، کیفیت اسپرایت‌ها، رتبه‌بندی هفتگی و بک‌اند دست‌نخورده‌اند.

## مشکل اندازه‌گیری‌شده

در baseline Mobile-01 خروجی `playable/` حدود **559 MB** با **529 فایل** است. این عدد مجموع فایل‌های میزبان است، نه میزان دانلود اول کاربر. بخش زیادی از آن، منابع تصویرسازی (`source-v14`)، نسخه‌های قبلی اطلس‌ها (v12/v13)، اطلس‌های `desktop` غیرقابل‌دسترسی از مسیر runtime و آرشیو توسعه هستند.

بررسی Git-tree قبل از این تغییر حدود **292.5 MB** فایل قابل‌حذف از Artifact را نشان می‌دهد؛ نتیجه نهایی باید از `release-asset-report.json` همان کامیت خوانده شود و هیچ بهبودی در FPS یا حجم دانلود اولیه از این رقم استنباط نمی‌شود.

## معماری

- `tools/release_asset_policy.mjs`: یک سیاست انتخاب متمرکز که با `BUILTIN_CHARACTER_SLUGS` و `characterPackVersion` و `orderedSpriteVariants` **همان کد runtime** هماهنگ است. فقط build-only art، نسخه‌های قدیمی، آرشیو و اطلس مستقل `desktop` را حذف می‌کند.
- `tools/export_static.mjs`: فقط هنگام ساخت نسخه انتشار، `fs.cpSync` را با فیلتر جدید اجرا می‌کند. بسته بازی، manifest، آیکون‌ها و فایل‌های دیگر همان مسیر قبلی را دارند؛ Atomic JS Bundle حفظ می‌شود.
- `tools/validate_release_assets.mjs`: پیش از قبول خروجی، تمام کاراکترهای منتشرشده، تمام زوج‌های `atlas/png` برای fallbackهای runtime، پیش‌نمایش و manifest کاراکتر، JSON `characters.json`، Vite Bundle/CSS/Fonts و کاشی‌های تمام سطوح کیفیت کافه را بررسی می‌کند. وجود فایل‌های build-only حذف‌نشده خطاست.
- `tools/check_static_assets.mjs`: فرمان Validation مستقل؛ CI اجرا می‌کند.
- `tests/js/mobile/MobileProductionAssets.test.js`: تست نگهداری تمام variantهای runtime، انتخاب نسخه درست، حذف منابع غیرقابل‌انتشار و جلوگیری از خروج از مسیر مجاز.
- `docs/mobile-02/release-asset-report.json` در CI: گزارش حجمی قبل و بعد، دسته‌بندی حذفیات و Failures. همراه با گزارش‌های Mobile-01 در Artifact آپلود می‌شود.

**Variantهای محفوظ:** `detail` برای کیفیت بالا، `runtime` برای متعادل، `lite` برای دستگاه ضعیف/NPC، `compact` و `mobile` برای مسیرهای fallback و سازگاری `characters.json`. فایل `desktop` در runtime فعلی حتی در دسکتاپ درخواست نمی‌شود؛ دسکتاپ با `detail` ارائه می‌شود.

آرشیو ساخت و منابع طراحی در `demian/public/assets` نگه داشته شده‌اند تا ساخت دوباره آرت و تست‌های مرجع همچنان قابل اجرا باشند.

## اجرای قابل‌تکرار

```bash
cd demian
npm ci
npm run test:ci
npm run validate:characters:v14
npm run build:static
npm run validate:static-assets
npm run validate:build
npm run benchmark:mobile:ci
```

این CI همان تست‌های قبلی، PHP SQLite/MySQL، و Browser QA شامل اجرای شش بازی روی پروفایل میان‌رده و ضعیف را نیز اجرا می‌کند.

## معیار پذیرش

1. حداقل **40٪ کاهش حجم کل فایل‌های خروجی** نسبت به baseline و باقی‌ماندن تمام منابع ضروری.
2. **0 فایل** source-vN، تاریخی، آرشیو و `desktop` در خروجی `_site/`.
3. **0 زوج Atlas/PNG مفقود** در fallbackهای runtime برای تمامی کاراکترها.
4. **0 Vite hashed build resource یا Café LOD مفقود**.
5. تست‌های JavaScript، Laravel SQLite/MySQL، Build و Browser QA بدون Regression.
6. پروژه روی موبایل و دسکتاپ همچنان با `detail/runtime/lite` کار کند. تضمین واقعی سخت‌افزار با Issue #7 پیگیری می‌شود.

## محدودیت‌ها و پیگیری

- این مرحله **تغییر فرمت یا کاهش ابعاد اسپرایت‌ها** نیست؛ از دست رفتن کیفیت تصویری رخ نمی‌دهد. Decode/GPU و حجم اسپرایت موردنیاز را در Mobile-03 جداگانه بهینه می‌کنیم.
- مشکل فونت‌های root-relative در زیرمسیرهای میزبانی در [Issue #12](https://github.com/Parsa-Emami/Demian/issues/12) مستقلاً پیگیری می‌شود.
- اگر `public/assets` در آینده فایل جدیدی دریافت کند، فایل ناشناخته به‌صورت محافظه‌کارانه نگه داشته می‌شود؛ اما هر نوع spritesheet/atlas نسخه‌دار فقط در صورتی منتشر می‌شود که نسخه و Variant آن با قرارداد runtime همخوانی داشته باشد.
- `playable/` یک Artifact قدیمی داخل ریپوزیتوری است. GitHub Pages از `demian/_site/` بهینه استفاده می‌کند. به‌روزرسانی نسخه commit‌شده `playable/` در این PR انجام نمی‌شود، چون شامل صدها فایل حجیم باینری است؛ برای انتشار روی هاست باید Artifact تازهٔ `npm run build:static` را استفاده کرد.

Refs: [Mobile-01](../mobile-01/README.fa.md)، [Mobile-first roadmap](https://github.com/Parsa-Emami/Demian/issues/10)، [QA فیزیکی](https://github.com/Parsa-Emami/Demian/issues/7).
