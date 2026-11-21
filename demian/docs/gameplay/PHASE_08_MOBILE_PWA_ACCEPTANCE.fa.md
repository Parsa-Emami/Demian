# فاز ۸ — عملکرد موبایل، حافظه و PWA (F8-01 تا F8-12)

**وضعیت:** پیاده‌سازی و تست CI در شاخهٔ فاز ۸، بدون ادعای تأیید Production یا سنجش گوشی واقعی. مبنا، نقشه‌راه کیفیت ۱۲فازی است نه فازهای تاریخی قدیمی.

## تغییرات فنی

| شناسه | پیاده‌سازی | پذیرش |
| --- | --- | --- |
| F8-01 Baseline | ابزارهای پیشین `StartupPerformanceDiagnostics`، `DeviceQaSession` و `RuntimeSoakProfiler` حفظ و گزارش p99 اضافه شد. | فایل JSON روی SHA دقیق CI؛ گوشی واقعی جدا |
| F8-02 Assets | بودجهٔ LOD/اسپرایت lite و WebP قبلی حفظ شد. هش SHA-256 فقط برای JS/CSS/JSON/HTML/webmanifest تا ۲ MiB در بستهٔ آفلاین اضافه شد، بدون کپی/هش بافت‌های بزرگ روی گوشی. | یکپارچگی اجرایی و عدم رم‌گیری تصاویر |
| F8-03 Lazy Loading | prewarm انتخابی، load تک‌بازی و اولویت اسپرایت فعال در مسیر موجود حفظ شد. | عدم پیش‌بارگذاری تمام NPCها |
| F8-04 Lifecycle | Dispose فعلی بازی‌ها و محدودیت cache اسپرایت حفظ؛ پایان input QA و پاک‌سازی موارد cancel/lifecycle اندازه‌گیری می‌شود. | رشد پایدار حافظه نیازمند بازبینی device |
| F8-05 Rendering | بافت‌های LOD و کیفیت Canvas قبلی؛ گزارش bounded frame work و p50/p95/p99. | p95 زیر ۲۰ms در هدف ۶۰fps، با ۶۰fps حقیقی |
| F8-06 Quality | سه پروفایل `RenderQuality` و فیلتر افکت‌های تزئینی (فاز ۶) بدون دستکاری score/replay حفظ شد. | اعلام صریح هر افت به ۳۰fps، تأیید گوشی |
| F8-07 PWA Offline | تکمیل بسته‌های داوطلبانهٔ هفت بازی، cache نسخه‌دار و حالت تمرینی آفلاین، marker فقط بعد از دانلود کامل. | `test:mobile-09:browser` و فاز ۸ |
| F8-08 Network Recovery | دریافت مجدد محدود برای خطای transient؛ دانلود ناقص بدون ready marker، مخزن ناقص حذف می‌شود؛ worker message با cleanup در خطای همگام. | خطای ساختگی + بازیابی واقعی Chromium |
| F8-09 Update Integrity | SHA-256 فایل‌های اجرایی کوچک و تطبیق release در SW/manifest، رد manifest قدیمی و عدم reload در حال رکورد pending. | آزمون خراب‌سازی عمدی دارایی، رد offline و بازیابی |
| F8-10 Touch | ثبت `pointercancel`، peak multitouch، bounded pointermove، reset در visibility/resize/session. | event-to-render-submission *proxy*، نه Touch-to-Photon |
| F8-11 Thermal/Battery | ورودی دستی درصد باتری و گرما در opt-in Device QA، بدون ادعای خواندن سنسور. | اندازه‌گیری خارجی، ۱۵ دقیقه در هر دستگاه |
| F8-12 Physical Device | ماتریس پایین و پرچم `physicalPhoneVerified=false` در خروجی QA. | پذیرش حضوری Android و iOS **باز است** |

## بودجه‌های دقیق و تمایز شواهد

- هدف **۶۰ FPS پایدار**: ۳۰ FPS با برچسب ۶۰ **تأیید نمی‌شود**.
- Frame Interval p95 حداکثر ۲۰ms؛ برای هر بازه p50/p95/p99 نیز ثبت می‌شود.
- هدف Touch-to-Photon حداکثر ۱۰۰ms؛ مقدار event-to-render موجود فقط جانشین تشخیصی و نه آزمون هدف است.
- رشد حافظهٔ JS بیش از ۱۰٪ پرچم بررسی می‌گیرد، نه نتیجهٔ قطعی Memory Leak: GPU/بافت‌های decode از `performance.memory` خارج‌اند.
- نمایش منو زیر ۵ ثانیه، اولین بازی زیر ۷ ثانیه در شرایط مشخص؛ `benchmark:mobile:ci` مبنای آزمایشگاه است.
- حداقل **۱۵ دقیقه** بازی پیوسته در هر دستگاه، چرخهٔ تعویض کاراکتر/بازی، بارگذاری مجدد، پس‌زمینه/بازگشت، چند انگشت، حالت کم‌مصرف و قطع/وصل اینترنت.

| کلاس دستگاه | Android | iOS | گزارش موردنیاز |
| --- | --- | --- | --- |
| اقتصادی | Chrome Android واقعی | iPhone قدیمی/محدود واقعی | مدل، OS، FPS، Memory، حرارت و باتری |
| میان‌رده | Chrome Android واقعی | iPhone میان‌رده واقعی | p50/p95/p99، لمس، شبکه و PWA |
| رده‌بالا | Chrome Android واقعی | Safari iPhone واقعی | ۶۰fps، پرش بین بازی‌ها، کیفیت بالا |

**مسیر اندازه‌گیری اختیاری:** نسخهٔ استاتیک با `?deviceQa=1`، شروع/توقف و خروجی JSON. دادهٔ حسگر یا امضا را خود ابزار جعل نمی‌کند. گزارش مرورگر/Emulation برای تست خودکار در artifact جداگانه ثبت می‌شود.

**Production Gate:** تا سبزشدن Node، Laravel MySQL/SQLite، `validate:build`، آزمون مرورگری PWA، بررسی SHA artifact، تست گوشی واقعی و تأیید هنری/فنی، ادعای انتشار کامل مجاز نیست.
