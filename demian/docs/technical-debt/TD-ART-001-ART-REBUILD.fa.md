# TD-ART-001 — بدهی فنی و هنری دمیان
**وضعیت: OPEN / P0 قبل از Production | فازهای ۲، ۳ و ۴ ارتقای کیفیت | مالک: صاحب پروژه**

این پرونده برای ادامه کار در ChatGPT Work پس از رفع محدودیت تصویرسازی ثبت شده است. هیچ‌یک از فازهای ۲ تا ۴ در این کامیت انجام‌شده محسوب نمی‌شوند. نه PNG جدید تولید شده، نه دارایی موجود بازسازی شده، نه تأیید هنری ثبت شده است. مرجع پیگیری [فهرست ماشین‌خوان](TD-ART-001.json) و [استاندارد فاز ۱](../game-design/GAME_DESIGN_STANDARD_V1.fa.md) است. یادآوری هفتگی بدهی هنری موجود همچنان معتبر است.

## ۱. تصمیم اجرایی و ترتیب
| فاز | وضعیت | شرط خروج |
|---|---|---|
| ۲ — Art Bible و هویت بصری | بدهی باز | تأیید مالک بر مرجع بصری و استاندارد |
| ۳ — بازسازی تمام کاراکترهای زن | بدهی باز | منابع هنری واقعی + شش نسخه + QA هر ۸ شخصیت |
| ۴ — بازسازی تمام کاراکترهای مرد | بدهی باز | منابع هنری واقعی + شش نسخه + QA هر ۱۰ شخصیت |
| ۵A — موتور انیمیشن | قابل شروع اکنون | تست فنی مستقل از هنر نهایی |
| ۵B — انتقال و تأیید هنری نهایی | بدهی وابسته | تکمیل ۲–۴ و اجرای واقعی روی منابع جدید |

ابتدا دریا و ارسل به عنوان نمونه طلایی بازبینی و تأیید شوند؛ سپس تولید گروهی. تا پذیرش نهایی ۲–۴ و ۵B، استقرار Production روی هاست مجاز نیست. توسعه کد، CI و نسخه تمرینی/آزمایشی مجازند. این ثبت مستنداتی فلگ‌های انتشار یا مسابقات را تغییر نمی‌دهد. شروط عملیاتی مستقل #7، #28، #44، #49 نیز پابرجا هستند.

تأیید دریا و ارسل به‌عنوان نمونه‌های مرجع در نمای موبایل Open World در [پروندهٔ تأیید مرجع](../character-reference-v2/README.fa.md) ثبت شده است. پذیرش Production طبق بند F11-02 همچنان با پروندهٔ مستقل انتشار پیگیری می‌شود.

## ۲. فاز ۲ — کارهای باقی‌مانده Art Bible (TD-ART-002)
- [ ] استخراج تصویر مرجع فضای واقعی کافه، FBX و تصاویر جاری، ساخت reference board برای هر هفت بازی؛ عدم تغییر هندسه برخورد کافه.
- [ ] انتخاب و تأیید جهت هنری دوبعدی واحد؛ تعیین زاویه دوربین، خط افق، پرسپکتیو، مقیاس، silhouettes و شکل‌شناسی.
- [ ] استخراج پالت واقعی مرجع و تثبیت توکن HEX برای پس‌زمینه، رنگ برند، نور گرم، سایه، خطر، تعامل، موفقیت و متن؛ کنترل خوانایی و کنتراست.
- [ ] تعیین line weight، بافت، محدوده جزئیات، فیلترینگ، سایه تماس، جهت نور، نور روز/شب، و افکت‌های محیطی؛ نمونه در رزولوشن واقعی موبایل و دسکتاپ.
- [ ] تعیین چارچوب تناسب سر/بدن/دست/پا، مقیاس جهانی، Foot Pivot، صورت و پوشش؛ تفاوت طبیعی افراد حفظ شود. تطبیق با قرارداد V14 و Portrait V1، نه تغییر خودسرانه ابعاد.
- [ ] تولید style board و mockup از دریا و ارسل در محیط واقعی، همراه با نمای جانبی و جلو؛ تأیید مالک قبل از تولید بقیه.
- [ ] مستندسازی استاندارد لوگو، آیکون، فونت فارسی Vazirmatn، HUD، منو، کارت، ذرات و کاهش حرکت. این فاز استاندارد است، بازطراحی کامل UI در فاز ۱۰.
- [ ] تعریف asset manifest شامل نام، نسخه، نوع، مالکیت، مجوز، مرجع، SHA-256، pivot، ابعاد، حالت، بودجه حافظه، وضعیت تأیید و تاریخ.
- [ ] ثبت Art Bible تصویری و ماشین‌خوان در docs/art-direction/ (مسیر پیشنهادی)، معیار نمره‌دهی هر نمونه و تصمیم‌های تأییدشده. شماره نسخه Art Bible مشخص شود.

## ۳. فهرست کامل کاراکترهای فازهای ۳ و ۴
فهرست از character-manifest-v4.json در کامیت مبنا استخراج شده است؛ خانواده‌ها صریح در داده‌اند، نه حدس از اسم یا ظاهر. وضعیت همه باز است؛ حتی نمونه طلایی باید تأیید انسانی مجدد داشته باشد.
| فاز | کاراکتر | slug | مرجع حرکت | وضعیت مرجع هویتی در source-v14 | ویژگی حفظ‌شدنی |
|---|---|---|---|---|---|
| 3 | DARYA / دریا | darya | darya | موجود؛ نیازمند تأیید | pishi |
| 3 | SETAYESH / ستایش | setayesh | darya | موجود؛ نیازمند تأیید | هویت، چهره و لباس |
| 3 | NEGAR / نگار | negar | darya | موجود؛ نیازمند تأیید | هویت، چهره و لباس |
| 3 | ELAHEH / الهه | elaheh | darya | موجود؛ نیازمند تأیید | هویت، چهره و لباس |
| 3 | TIAM / تیام | tiam | darya | بازیابی/تأیید لازم | homayoun |
| 3 | HANNA / حنا | hanna | darya | بازیابی/تأیید لازم | هویت، چهره و لباس |
| 3 | AINAZ / آیناز | ainaz | darya | بازیابی/تأیید لازم | هویت، چهره و لباس |
| 3 | YALDA / یلدا | yalda | darya | موجود؛ نیازمند تأیید | هویت، چهره و لباس |
| 4 | UZUDI / اوزودی | uzudi | arsal | موجود؛ نیازمند تأیید | wings |
| 4 | AMIRREZA / امیررضا | amirreza | arsal | بازیابی/تأیید لازم | wings |
| 4 | ARSAL / ارسل | arsal | arsal | موجود؛ نیازمند تأیید | هویت، چهره و لباس |
| 4 | IMAN / ایمان | iman | arsal | موجود؛ نیازمند تأیید | هویت، چهره و لباس |
| 4 | AMIN / امین | amin | arsal | موجود؛ نیازمند تأیید | هویت، چهره و لباس |
| 4 | HOSSEIN / حسین | hossein | arsal | موجود؛ نیازمند تأیید | هویت، چهره و لباس |
| 4 | TAHER DB / طاهر DB | taher-db | arsal | موجود؛ نیازمند تأیید | هویت، چهره و لباس |
| 4 | SORKHI / سرخی | sorkhi | arsal | موجود؛ نیازمند تأیید | هویت، چهره و لباس |
| 4 | MORI / موری | mori | arsal | موجود؛ نیازمند تأیید | هویت، چهره و لباس |
| 4 | MAHYAR / مهیار | mahyar | arsal | موجود؛ نیازمند تأیید | هویت، چهره و لباس |
فهرست فعلی ۱۸ کاراکتر است (۸ زن، ۱۰ مرد). هر شخصیت جدید قبل از Production مشمول همین بدهی و الزامات است؛ کاراکتر بازنشسته نباید دوباره فعال شود. برای حنا، آیناز، امیررضا و تیام فایل reference با نام متعارف در source-v14 یافت نشد؛ ابتدا منابع اصلی و مستندات provenance را بازیابی یا مالک تأیید کند، نه اینکه چهره دیگری جایگزین شود.

## ۴. فازهای ۳ و ۴ — چک‌لیست تکرارشونده برای تک‌تک شخصیت‌ها
- [ ] بررسی identity contract، عکس مجاز متعلق به همان شخصیت، لباس، مو، رنگ، اکسسوری و پرتره فعلی؛ هر تناقض با مالک حل شود.
- [ ] استفاده از الگوی حرکت دریا (female-base-v1) یا ارسل (male-base-v1) و منبع master-motion-v1؛ کپی صورت/لباس شخصیت مرجع ممنوع.
- [ ] ایجاد واقعی منابع تصویری در Work با image_gen یا فرایند هنری معادل مورد تأیید؛ ابتدا key pose جداگانه، سپس توالی طبیعی. PNG فعلی صرفاً به عنوان مرجع استفاده می‌شود؛ تغییر JSON، upscale، recolor یا کپی بدون بازسازی هنری به‌تنهایی پذیرفته نیست.
- [ ] ساخت turnaround از نماهای موردنیاز، idle (تنفس/پلک)، walk (contact/down/pass/up)، run، sprint، takeoff، jump، fall، land، slide مستقل، dodge، turn، celebrate و تعامل لازم؛ اگر alias یا fallback موجود استفاده می‌شود صریح ثبت شود. ژست‌های هشت‌جهته مستقل فقط وقتی ادعا شوند که واقعاً ساخته شده باشند.
- [ ] بازبینی وزن، تعادل، length ثابت اندام، قوس حرکت، انتقال فاز، چرخش تنه، حرکت متقابل دست و پا، foot lock، contact shadow، anticipation و follow-through؛ منع حرکت لغزشی پا، morph صورت، اندام اضافه، برش و شبح فریم.
- [ ] بازسازی و حفظ پیشی دریا، همایون تیام و بال‌های اوزودی/امیررضا مطابق manifest؛ لایه‌های تزئینی نباید hitbox یا امتیاز Ranked را تغییر دهند. الهه بدون عینک و گربه طبق درخواست قبلی؛ دیگر ویژگی‌ها بر اساس مرجع همان فرد.
- [ ] ثبت PNGهای واقعی master.png، runner-motion.png، slides.png، layout.json، عکس reference مجاز و provenance در source-v14 یا مسیر نسخه جدیدِ مصوب. فایل‌های قبلی تا تأیید جایگزین حفظ شوند.
- [ ] ساخت شش variant (Desktop/Mobile/Compact/Detail/Runtime/Lite)، تطبیق PNG/atlas/manifest، پرتره 224×224، preview و کالیبراسیون Portrait Standard؛ شش خروجی قدیمی/جدید را با هم مخلوط نکنید.
- [ ] ابعاد و سلول‌های V14، pivot=(0.5,0.94)، بودجه تصویر و مقیاس فعلی را حفظ کنید، مگر قرارداد جدید با مهاجرت/تست مصوب. ۶۷۲ فریم بسته‌بندی V14 با تعداد ژست تألیفی یکی نیست؛ هر دو جداگانه گزارش شوند.
- [ ] کنترل alpha، histogram، bounds، frame ordering، atlas hash، شفافیت، اشیای جدا، ترتیب جهت، مقیاس و تماس پای فریم‌ها؛ WebP فقط در صورت تطابق پیکسل با خروجی.
- [ ] ویدئو/GIF مقایسه با مرجع در سرعت واقعی و 0.5x، contact sheet همه حالت‌ها، موبایل و دسکتاپ، بازبینی انسانی روی زمینه واقعی بازی؛ تأیید owner برای هر شخصیت.
- [ ] اجرای تمام تست‌های لازم، بازسازی static، ثبت SHA منبع و خروجی، لینک شواهد و کامیت مستقل هر batch. تا تکمیل این موارد وضعیت pending باقی بماند.

## ۵. منابع و ابزارهای موجود در مخزن
| منبع | استفاده |
|---|---|
| demian/public/assets/characters/darya/source-v14/ | master.png، runner-motion.png، slides.png، layout.json و reference.jpg مرجع زن |
| demian/public/assets/characters/arsal/source-v14/ | master.png، runner-motion.png، slides.png، reference.jpg و locomotion-v15.png مرجع مرد |
| demian/resources/game/character-motion.json | منبع حرکت مادر و خانواده‌ها |
| demian/public/assets/characters/master-motion-v1.json | خروجی عمومی تولیدی، نه فایل ویرایش دستی |
| demian/public/assets/characters/character-manifest-v4.json | فهرست اجرایی و اکسسوری‌ها |
| demian/docs/MASTER-MOTION-V1.fa.md | معماری حرکت، IK، فاز قدم و صفحه مقایسه |
| demian/docs/character-standards/MOBILE_CHARACTER_V14.fa.md | قرارداد اطلس، pivot و بودجه |
| demian/docs/character-standards/CHARACTER_PORTRAIT_STANDARD_V1.md | هندسه پرتره |
| demian/docs/licenses/ASSET-LICENSES.md | مجوز، حقوق عکس و دارایی‌ها |
| demian/resources/js/game/characters/CharacterVisualContract.js | resolution و variant resolver |
| demian/tools/build_character_pack_v14.py | ساخت اطلس از منابع واقعی |
| demian/tools/build_runtime_character_packs.py | ساخت runtime/detail/lite |
| demian/tools/character_art_registry.py | رجیستری خانواده‌ها |
| demian/tools/validate_character_pack_v14.py | اعتبارسنجی اطلس |
| demian/tools/audit_character_sprite_packs.py | ممیزی اسپرایت با گزینه‌های مستند ابزار |
| demian/tools/optimize_sprite_release.py | فشرده‌سازی دقیق نسخه انتشار |
| .agents/skills/create-game-assets/SKILL.md | خط تولید و QA هنری |

منابع مرجع هر شخصیت و وجود identity manifest در TD-ART-001.json ثبت شده‌اند. تصاویر شخصی فقط با اجازه و حقوق استفاده روشن؛ انتشار عمومی عکس مرجع بدون مجوز ممنوع. ArtCraft موجود در پروژه‌های شخصی یک گزینه اختیاری برای تولید است، نه وابستگی اثبات‌شده مخزن Demian. از آن تنها در صورت دسترسی و مجوز استفاده شود. منابع آموزشی مکمل: [MDN Canvas optimization](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)، [Aseprite](https://www.aseprite.org/) (اختیاری برای اصلاح دستی)، [Krita](https://krita.org/) (اختیاری، نه الزام نصب). اصل کار با ابزارهای فعلی Python/Pillow و pipeline پروژه انجام می‌شود.

### چک‌لیست اجرا در Work
از ریشه demian، بعد از تولید و تأیید منابع واقعی و بررسی گزینه‌های builder:
```bash
npm ci
python3 -m pip install -r tools/requirements-character-art.txt
npm run build:characters:v14
npm run validate:characters:v14
npm run validate:motion
npm run validate:skills
npm run test:ci
npm run validate:final
npm run validate:ui-layers
npm run build:static
npm run validate:build
npm run validate:static-assets
npm run test:identity:browser
node tools/export_static.mjs --out=../playable
```
اجرای دستورها جایگزین تولید منابع نیست. ابتدا روی شاخه کاری و یک نمونه محدود انجام شود؛ نسخه‌های نهایی فقط با پذیرش و SHA معتبر وارد main شوند. تست مرورگر بازی‌های متاثر و اندازه‌های 320×568، 390×844، 844×390، 1440×900 و دستگاه فیزیکی Android/iOS لازم است.

## ۶. تصمیم فاز ۵ — تفکیک کار مستقل از هنر
**فاز ۵A را اکنون شروع کنید**؛ این فاز شامل audit FrameAnimator، MasterMotionController/Library، state machine و انتقال حالت، cadence مبتنی بر مسافت، foot contact phase، sync 30/60/120Hz، lifecycle، cache، reduced motion، fallback و تست frame timing است. از منابع فعلی به عنوان interim استفاده شود. تغییر فیزیک، hitbox، قواعد Ranked، score و ادعای ارتقای هنری ممنوع.
**فاز ۵B را در همین بدهی نگه دارید**: retargeting واقعی PNGهای جدید، اصلاح pose و silhouette از روی تصویر، هم‌ترازی فریم‌ها، کنترل optical flow، حذف artifact، تنظیم انتقال بصری نهایی و پذیرش انسانی تمام شخصیت‌ها. پس از ۲–۴ انجام شود؛ ۵A به معنی تکمیل کل فاز ۵ نیست.

## ۷. Definition of Done / جلوگیری از بسته‌شدن صوری
برای هر شخصیت ثبت فایل مرجع، PNG تولیدی واقعی، شش variant، SHA-256، contact sheet، ویدئو/GIF، نتیجه تست، نتایج گوشی فیزیکی، مالک تأییدکننده و تاریخ الزامی است. برای فاز ۲ تأیید Art Bible و نمونه‌ها نیز ضروری است. JSON status تنها بعد از ارائه شواهد تغییر کند؛ CI سبز اثبات کیفیت هنری یا انتشار Production نیست. این بدهی باز است، حتی اگر کد فازهای بعدی تکمیل شود.

### ثبت نتیجه ۵A و باقی‌مانده ۵B
در فاز ۵A اصلاح انتقال وضعیت بین کیفیت‌های اسپرایت، فاز کسری و جهت، نمونه‌برداری چندچرخه‌ای، fallback تعریف‌شده، زمان‌بندی محدود، حرکت مادر و توقف هنگام عدم جابه‌جایی در سورس انجام شد. پوشش تست در Phase5AnimationRuntime.test.js قرار دارد. CI و اجرای فیزیکی هنوز معیار مستقل پذیرش‌اند. تمام بازسازی واقعی تصاویر/transition frames، retargeting، بررسی visual foot lock، لباس/مو/بال و تأیید انسانی در ۵B باز هستند. از sprite cross-dissolve به عنوان جایگزین بازسازی واقعی استفاده نشود؛ frameBlend و lockBodyScale منابع V14 تغییر نکرده‌اند.
