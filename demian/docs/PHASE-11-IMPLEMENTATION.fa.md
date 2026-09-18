# فاز ۱۱ — Character Core V4 (Manifest-Driven Character Pipeline)

این فاز، معماری Character Core V4 را بر اساس Demian Full Game Rebuild
Master Pack پیاده‌سازی می‌کند: **دریا** به‌عنوان تنها کاراکتر
`gold_standard_production` و کاراکتر فعال پیش‌فرض بازی تعیین شد، و ۱۲
کاراکتر builtin دیگر (Tiam, Ronak, AmirReza, Parsa, Iman, Uzudi, Setayesh,
Mojtaba, Hossein, Arsal, Sorkhi, Taher-DB) با وضعیت
`legacy_pending_reference_rebuild` علامت‌گذاری شدند — بدون حذف کد یا
Assetهای موجودشان.

یک رجیستری manifest-محور تازه (`character-manifest-v4.json` + سرویس‌های
همتای آن در بک‌اند/فرانت‌اند) اکنون منبع واحد حقیقت برای وضعیت تولید هر
کاراکتر است، و seederها/roster آفلاین بازی با آن هم‌راستا شدند. اطلس v12
واقعی دریا (۲۵۲ فریم، ۳۱ انیمیشن) پایه‌ی manifestهای جدید قرار گرفت — نه
یک الگوی فرضی. دو باگ واقعی پیش‌از‌این‌موجود هم در همین مسیر پیدا و رفع
شدند: نیاز اجباری و نادرست به انیمیشن `attack` در `AtlasManifest.php`
(که هیچ مصرف‌کننده‌ای نداشت)، و ناهم‌خوانی مسیر پیش‌فرض کاراکتر فعال بین
seeder دیتابیس و roster آفلاین `CharacterManager.js`.

هیچ عکس مرجع جدیدی در این نشست دریافت نشد، پس هیچ هنر/اسپرایت تازه‌ای
تولید نشده است؛ این فاز صرفاً معماری و سیم‌کشی را می‌سازد، نه Assetهای
تصویری تازه. جزئیات کامل در
`docs/character-standards/CHARACTER_CORE_V4_IMPLEMENTATION.md`.

**به‌روزرسانی:** بعد از تحویل اولیه، CI واقعی پروژه (GitHub Actions) یک
تست قدیمی (`tests/Feature/CharacterManagerTest.php`) را که هنوز فرض
می‌کرد Tiam کاراکتر فعال پیش‌فرض است، رد کرد. این تست اصلاح شد و این‌بار
با اجرای واقعی و کامل `composer install` + `php artisan test` (۱۲/۱۲ pass)
+ `npm install` + `npm run test:ci` (۵۴/۵۴ pass) + `vite build` +
یک درخواست HTTP زنده به `/characters` — نه فقط شبیه‌سازی — تأیید شد.
