# بازطراحی کامل Darya + Pishi — نسخهٔ ۱۲

نسخه‌های هنری قبلی دریا از پوشهٔ runtime حذف شده‌اند و Pack v12 تنها منبع رسمی این کاراکتر است. کد سمت کاربر، manifest سمت سرور و Seeder پایگاه داده همگی به نسخهٔ ۱۲ قفل شده‌اند تا هیچ fallback یا ارجاعی به v6/v9 باقی نماند.

## محتوای Pack

- ۲۵۲ فریم در سه کیفیت `desktop`، `mobile` و `compact`
- ۸ جهت دید مستقل برای حالت ایستاده و نگاشت جهت‌دار برای حرکت
- چرخه‌های نرم idle، walk، run، sprint، jump، fall، land، hop و dodge
- اکشن‌های اجتماعی wave، celebrate، dance، crouch، laugh، sleep و companion
- حضور همیشگی Pishi در همهٔ فریم‌ها با حرکت همگام
- pivot ثابت، تناسب ثابت، alpha واقعی و frame blending کنترل‌شده
- حذف کامل نام‌ها و fallbackهای رزمی

فایل `tools/build_darya_v12.py` خروجی‌ها را به‌صورت قطعی از master جدید بازتولید می‌کند.
