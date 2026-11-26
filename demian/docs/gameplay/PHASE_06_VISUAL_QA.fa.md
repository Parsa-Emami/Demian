# F6-10 — آزمون تصویری محیط، ماتریس و معیار پذیرش

این سند سناریوی تست خودکار را از ادعای تأیید نهایی هنری تفکیک می‌کند. خروجی واقعی پس از اجرای CI در artifact با نام `phase6-cafe-visual-<SHA>` ارائه می‌شود.

| اندازه صفحه | روز (Café Rush) | شب (After Hours) | خروجی |
| --- | --- | --- | --- |
| 320×568 | screenshot | screenshot | QA + عدم اسکرول افقی |
| 390×844 | screenshot | screenshot | QA + عدم بریدگی صحنه |
| 768×1024 | screenshot | screenshot | QA + ترتیب actor/HUD |
| 1440×900 | screenshot | screenshot | QA + صحت LOD |

پنج بازی دیگر `Open World`، `Dino Run`، `Café Critters`، `Coffee Crash` و `Café Drift` در موبایل 390×844 به عنوان smoke scenario و هرکدام با screenshot جدا ثبت می‌شوند. بررسی Canvas و عدم خطای `pageerror` خودکار است؛ **بازبینی تطابق با ده عکس کافه انسانی است** و در JSON با `humanVisualApproval: false` مشخص می‌شود.

آزمون‌های Node تعداد ذرات، نگاشت ۱به۱ collision و artwork، رنگ‌های منبع، محدودیت کیفیت، عملکرد در reduced-motion و عدم وارد شدن NaN به دوربین را می‌سنجند.

**موارد خارج از این فاز:** تغییر قوانین هفت بازی، تایید هنر sprite ها، جایزه/Replay، ساخت مدل ۳بعدی جدید و ادعای تست گوشی حقیقی.
