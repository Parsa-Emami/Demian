# بازطراحی حرکت طاهر DB و سرخی

برای هر شخصیت ۳۲ حالت طراحی شد. هر مجموعه هشت حالت راه‌رفتن، هشت حالت دویدن، هشت حالت پرش و هشت حالت فرود دارد. در طاهر DB فرهای مشکی، ابروهای پر، ته‌ریش، پیراهن آبی دکمه‌دار و کف سفید کفش مشخص‌اند. سرخی با موی رو به عقب، ریش مرتب، پولوی سرمه‌ای، شلوار جین، ساعت مشکی و کف کفش نخودی شناخته می‌شود.

ژست‌ها از اسپرایت‌شیت ارسل گرفته شدند و با ImageGen در دو شیت شفاف برای هر شخصیت بازطراحی شدند. منبع `locomotion-v15.png` ارسل الگوی گام و پرش است و ردیف فرود `runner-motion.png` ارسل تماس، خم‌شدن زانو و بازگشت به ایستادن را مشخص می‌کند. طرح‌های هویتی، هش منابع و پرامپت‌ها در [مانیفست طاهر DB](../../public/assets/characters/taher-db/manifests/taher-db_reference_manifest.json)، [مانیفست سرخی](../../public/assets/characters/sorkhi/manifests/sorkhi_reference_manifest.json) و [پرامپت‌های طراحی](art-prompts.json) ثبت شده‌اند.

در هر شش بستهٔ V14 محور نرمال‌شدهٔ پا برای هر سه شخصیت `(0.50, 0.94)` است. جدول، میانهٔ ارتفاع سیلوئت در سلول ۱۱۲ پیکسلی نسخهٔ Mobile را نشان می‌دهد.

| شخصیت | راه‌رفتن | دویدن | پرش | فرود |
| --- | ---: | ---: | ---: | ---: |
| ارسل | ۷۸ | ۷۹ | ۶۴٫۵ | ۷۸ |
| طاهر DB | ۷۹ | ۷۹ | ۶۴ | ۷۶٫۵ |
| سرخی | ۷۹ | ۷۸ | ۶۴ | ۷۶٫۵ |

فاصلهٔ حرکت، پیشروی گام‌ها را تعیین می‌کند. فیزیک مشترک بازی زمان جهش و ارتفاع پرش را تعیین می‌کند و فریم‌های مجزای فرود، خم‌شدن بدن و بازگشت به گام عادی را نشان می‌دهند. جزئیات حافظه و حجم فایل در [گزارش بسته‌های اجرایی](runtime-packs.json) آمده است.

## ساخت و بازبینی

```sh
python3 tools/build_character_pack_v14.py --characters taher-db sorkhi
python3 tools/build_runtime_character_packs.py --characters taher-db sorkhi --report docs/release-v14-taher-sorkhi/runtime-packs.json
npm run build:static
DEMIAN_BROWSER_EXECUTABLE="$(command -v chromium)" node tools/check_added_cast_v14.mjs taher-db sorkhi
```

در Chromium 158، چهار حرکت ارسل، طاهر DB و سرخی در یک دوربین Open World و نمای ۳۹۰×۸۴۴ ثبت شد. آزمون انتخاب از فهرست، حفظ انتخاب پس از بارگذاری دوباره و اجرای هر دو شخصیت در Open World، Dino Run، After Hours و Café Rush در ۳۹۰×۸۴۴ و ۱۴۴۰×۹۰۰ گذشت.

اعتبارسنجی ۱۲۰ جفت اطلس و تصویر، هر ۹۰۸ آزمون JavaScript، هر ۳۵۳ آزمون PHP و کنترل خروجی PWA گذشت. بررسی موبایل در Chromium بدون رابط و با لمس شبیه‌سازی‌شده انجام شد. پذیرش گوشی‌های فیزیکی در [Issue #117](https://github.com/Parsa-Emami/Demian/issues/117) پیگیری می‌شود.

[تصویر مقایسهٔ چهار حرکت](mobile-movement-comparison.webp) · [فریم‌های ثبت‌شده در مرورگر](browser-checks.json)
