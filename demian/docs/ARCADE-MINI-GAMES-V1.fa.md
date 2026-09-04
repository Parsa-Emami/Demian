# بسته‌ی مینی‌گیم‌های دوبعدی Demian — Arcade Pack 1

این بسته شش مینی‌گیم دوبعدی را به معماری فعلی Demian اضافه می‌کند و عمداً از همان Runtime، Canvas2D Pixel Renderer، CharacterVisualService و کنترل‌های مشترک پروژه استفاده می‌کند؛ بنابراین یک موتور دوم یا مسیر رندر جداگانه وارد پروژه نشده است.

## بازی‌های اضافه‌شده

| Game ID | نام | هسته‌ی گیم‌پلی | هدف |
|---|---|---|---|
| `neon-run` | NEON RUN | Endless runner + Jump/Dash | زنده ماندن، رد کردن موانع و افزایش رکورد |
| `star-catcher` | STAR CATCHER | Catch/Dodge | گرفتن ستاره‌های طلایی و دوری از بمب |
| `cafe-drift` | CAFÉ DRIFT | Top-down dodging / near-miss | جاخالی نزدیک برای بالا بردن Combo |
| `shadow-maze` | SHADOW MAZE | Maze + keys + enemies | گرفتن ۵ کلید و رسیدن به خروجی |
| `sky-hop` | SKY HOP | Vertical platformer | صعود تا ۱۰۰ متر |
| `rhythm-rush` | RHYTHM RUSH | 3-lane action rhythm | اجرای JUMP / USE / DASH با تایمینگ درست |

## معماری

هسته‌ی مشترک در `resources/js/game/games/arcade/` قرار دارد:

- `ArcadeMiniGameBase.js`: چرخه‌ی preload/enter/session/update/render/result، امتیاز، Combo، HP، تعویض کاراکتر و Seed.
- `ArcadeModes.js`: استراتژی و منطق مستقل هر شش مینی‌گیم.
- `ArcadeMiniGameRenderer.js`: رندر مشترک با PixelCamera2D و سیستم Sprite پروژه.
- `ArcadeMiniGameHud.js`: HUD پیکسلی، امتیاز/زمان/Combo/HP و Character Select.
- `ArcadeCharacterRoster.js`: فهرست ۱۳ کاراکتر Built-in و Reference Cardهای دقیق v9.

هر مینی‌گیم فقط یک Wrapper کوچک در فولدر خودش دارد و Configuration مخصوص خودش را به Base می‌دهد. این ساختار اضافه کردن مینی‌گیم هفتم را بدون کپی کردن Runtime ممکن می‌کند.

## کاراکترها و تطابق دقیق تصویر

۱۱ تصویری که برای کاراکترها ارسال شده‌اند، با SHA-256 با فایل‌های `*-character-sheet-reference-v9.jpg` موجود داخل پروژه **byte-for-byte یکسان** هستند. بنابراین برای حفظ دقیق جزئیات، تصویرها دوباره تولید یا بازطراحی نشده‌اند؛ Runtime برای این ۱۱ شخصیت مستقیماً روی Pack v9 تنظیم شده است:

`amirreza`, `arsal`, `darya`, `hossein`, `iman`, `mojtaba`, `parsa`, `setayesh`, `sorkhi`, `taher-db`, `uzudi`.

دو کاراکتر Built-in دیگر (`tiam`, `ronak`) همچنان از Pack استاندارد v6 پروژه استفاده می‌کنند. در نتیجه ۱۳ کاراکتر Built-in در Roster قابل انتخاب‌اند و ۱۱ شخصیت ارسال‌شده با همان Asset Pack v9 اجرا می‌شوند.

گزارش هش کامل در `docs/validation/ARCADE-CHARACTER-REFERENCE-INTEGRITY.json` قرار دارد. همچنین `docs/validation/ARCADE-V9-SPRITE-PACK-INTEGRITY.json` وجود Sprite Sheet و Atlas هر سه Variant (`mobile`, `desktop`, `compact`) را برای هر ۱۱ کاراکتر بررسی می‌کند؛ هر Atlas شامل ۴۴۸ فریم است و همه‌ی بررسی‌ها پاس شده‌اند.

## کنترل‌ها

Input Context جدید `ARCADE` به `InputContexts.js` اضافه شده است. دسکتاپ: `WASD / Arrow Keys` برای حرکت، `Shift` برای Run، `Space` برای Jump، `X` برای Dash، `Enter/E` برای Interact و `Esc` برای Pause. روی موبایل همان Actionهای موجود UI پروژه با Layout جدید `arcade` فعال می‌شوند.

## ادغام با پروژه

شش بازی در `GameDefinitions.js` و `GameCatalog.js` ثبت شده‌اند و از همان Session/Result flow پروژه استفاده می‌کنند. CSS جداگانه‌ی `resources/css/arcade-minigames.css` ظاهر HUD و Character Deck را با زبان بصری navy/pink/yellow و Pixel UI شیت‌های کاراکتر هماهنگ می‌کند.

`BuiltinCharacterSeeder.php` و `CharacterVisualContract.js` نیز هم‌راستا شده‌اند تا انتخاب Pack v9 در DB و Runtime با هم اختلاف نداشته باشد.

## اعتبارسنجی انجام‌شده

- `npm run test:js`: **204/204 PASS**
- `npm run test:ci`: **54/54 PASS**
- Smoke simulation برای هر ۶ Mode (update + render): **6/6 PASS**
- Syntax check تمام فایل‌های جدید JavaScript: **PASS**
- PHP lint روی Seeder: نتیجه در `docs/validation/ARCADE-PHP-LINT.txt`
- تطابق ۱۱ Reference Card ارسالی با Assetهای پروژه: **11/11 exact SHA-256 match**

خروجی تست‌ها در `docs/validation/ARCADE-JS-TESTS.txt` و `docs/validation/ARCADE-CI-TESTS.txt` ذخیره شده است.

## Build production

در محیط اجرایی ساخت این Patch، نصب کامل dependencyهای npm به علت timeout/transport محیط انجام نشد و در نتیجه executable مربوط به Vite در `node_modules/.bin` موجود نبود؛ بنابراین `npm run build` در این محیط اجرا نشده است. خود test suiteهای Node که به dependency خارجی نیاز ندارند کامل پاس شده‌اند. روی محیط توسعه‌ی پروژه طبق روال اصلی اجرا کنید:

```bash
npm ci
npm run test:js
npm run test:ci
npm run build
```

## مسیرهای اصلی تغییر

- `resources/js/game/games/arcade/`
- `resources/js/game/games/{neon-run,star-catcher,cafe-drift,shadow-maze,sky-hop,rhythm-rush}/`
- `resources/js/game/registry/GameDefinitions.js`
- `resources/js/game/catalog/GameCatalog.js`
- `resources/js/game/input/InputContexts.js`
- `resources/js/game/controls/ControlLayoutService.js`
- `resources/js/game/characters/CharacterVisualContract.js`
- `database/seeders/BuiltinCharacterSeeder.php`
- `resources/css/arcade-minigames.css`
- `resources/js/app.js`
- `tests/js/arcade/ArcadeRegistration.test.js`
