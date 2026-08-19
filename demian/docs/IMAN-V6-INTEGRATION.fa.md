# ادغام کاراکتر ایمان در Demian (V6)

این پچ کاراکتر جدید **ایمان / IMAN** را به‌صورت Built-in Character به بازی اضافه می‌کند.

## هویت بصری
- موهای کوتاه و فر تیره
- ریش و سبیل کامل
- استایل چهره دوستانه و مطمئن
- لباس مشکی یقه‌دار با الگوی گرافیکی سفید/خاکستری و اکسنت‌های قرمز
- ساعت هوشمند مشکی
- بدنی درشت و استوار

## فایل‌های هنری
برای ایمان همه فایل‌های استاندارد زنجیره‌ی ساخت کاراکتر تولید شده‌اند:
- مرجع طراحی (`iman-character-sheet-reference.png`)
- شیت منبع 4x3 (`iman-spritesheet.png`)
- V4 (`iman-spritesheet-v4.png` + `iman-atlas.json`)
- V5 در سه واریانت Desktop / Mobile / Compact
- V6 کامل 252 فریم در سه واریانت Desktop / Mobile / Compact

## تنظیمات گیم‌پلی
- walk_speed: 3.75
- run_speed: 7.15
- sprint_speed: 7.9
- jump_force: 6.95
- air_control: 0.60
- role_title: ANCHOR / CORE
- tagline: Reliable, strong, and team-first
- signature_action: guard

## تغییرات کد
- ثبت ایمان در `BuiltinCharacterSeeder`
- اضافه شدن به `CharacterManager`
- اضافه شدن به `CharacterVisualContract`
- رنگ اختصاصی برای fallback و selection ring
- تست‌های backend و frontend به‌روزرسانی شدند

## اعتبارسنجی
پک V6 ایمان برای هر سه variant با ابزارهای پروژه audit و validate شده و ساختار 252-frame non-combat را پاس می‌کند.
