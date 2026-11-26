# مجتبی در Demian

مجتبی بعد از ارسل در فهرست انتخاب پیش از شروع بازی نمایش داده می‌شود. چهره و پوشش از شیت ارسالی گرفته شده‌اند. موهای فر، عینک گرد، ریش مشکی، تی‌شرت ساده، ساعت و کف روشن کفش در فریم‌های بازی قابل تشخیص‌اند. [مانیفست مرجع](../../public/assets/characters/mojtaba/manifests/mojtaba_reference_manifest.json) · [پرامپت‌های طراحی](art-prompts.json)

۶۴ ژست کلیدی با ImageGen و بر اساس اسپرایت‌های ارسل ساخته و نرمال شدند. مجموعه شامل چرخش هشت‌جهته، ایستادن، راه‌رفتن، دویدن، پرش، فرود، سرخوردن و جشن پیروزی است. محور پا در هر شش بسته `(0.50, 0.94)` است و فیزیک مشترک بازی ارتفاع پرش را تعیین می‌کند. [گزارش بسته‌های اجرایی](runtime-packs.json)

| شخصیت | راه‌رفتن | دویدن | پرش | فرود |
| --- | ---: | ---: | ---: | ---: |
| ارسل | ۷۸ | ۷۹ | ۶۴٫۵ | ۷۸ |
| مجتبی | ۷۹ | ۷۸ | ۶۶ | ۷۸ |

اعداد جدول میانهٔ ارتفاع سیلوئت در سلول ۱۱۲ پیکسلی بستهٔ Mobile هستند.

## بازبینی

انتخاب مجتبی، حفظ انتخاب بعد از بارگذاری مجدد و اجرای او در Open World، Dino Run، After Hours و Café Rush در Chromium بدون رابط بررسی شد. در نمای ۳۹۰×۸۴۴، پرش و سرخوردن Dino Run با لمس شبیه‌سازی‌شده و حرکت در Open World با صفحه‌کلید بررسی شدند. آزمون نمای ۱۴۴۰×۹۰۰ با صفحه‌کلید انجام شد. فریم‌های راه‌رفتن، دویدن، پرش، فرود و سرخوردن در موتور بازی ثبت شدند و عبور از مانع هوایی Dino Run نیز بررسی شد. [نتایج مرورگر](browser-checks.json)

۹۰۸ تست JavaScript، ۳۵۳ تست PHP با SQLite، اعتبارسنجی ۱۲۶ جفت اطلس و تصویر و بررسی خروجی PWA و سازگاری نسخه‌ها گذشتند. بررسی گوشی‌های فیزیکی در [Issue #117](https://github.com/Parsa-Emami/Demian/issues/117) پیگیری می‌شود.

مستندات محلی ساخت دارایی بازی، رابط بازی، three.js و گردش کار اسپرایت برای آماده‌سازی و کنترل کیفیت استفاده شدند.

## ساخت

```sh
python3 tools/build_character_pack_v14.py --characters mojtaba
python3 tools/build_runtime_character_packs.py --characters mojtaba --report docs/release-v14-mojtaba/runtime-packs.json
npm run build:static
DEMIAN_BROWSER_EXECUTABLE="$(command -v chromium)" node tools/check_added_cast_v14.mjs mojtaba
```
