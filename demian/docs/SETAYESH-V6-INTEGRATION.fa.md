# پچ کاراکتر ستایش — Demian V6

این پچ با ساختار فعلی Character Pack V6 سازگار شده است.

## نصب
فایل‌های داخل ZIP را روی ریشهٔ پروژه merge کنید، سپس:

```bash
cd demian
php artisan migrate --seed
npm run test:js
npm run validate:final
npm run build
```

برای seed کردن فقط ستایش:

```bash
php artisan db:seed --class=Database\\Seeders\\SetayeshCharacterSeeder
```

## طراحی Runtime
- slug: `setayesh`
- سه variant: `desktop`, `mobile`, `compact`
- core animations: `idle`, `walk`, `run`, `jump`, `win`
- flourish اختصاصی غیررزمی: `spark`
- نام `attack` عمداً در atlas منتشر نشده، چون قرارداد V6 انیمیشن‌های combat را sanitize می‌کند.
- PNGها RGBA با background شفاف هستند و برای `NearestFilter` آماده شده‌اند.
- `CharacterVisualContract.js` ستایش را به built-in slugها اضافه می‌کند.
- `DatabaseSeeder.php` seeder ستایش را در مسیر استاندارد `migrate --seed` اجرا می‌کند.
- `SetayeshCharacterSeeder` فقط رکورد ستایش را upsert می‌کند و state سایر کاراکترها را reset نمی‌کند.

## فایل‌ها
- `demian/database/seeders/DatabaseSeeder.php`
- `demian/database/seeders/SetayeshCharacterSeeder.php`
- `demian/public/assets/characters/setayesh/setayesh-atlas-v6-compact.json`
- `demian/public/assets/characters/setayesh/setayesh-atlas-v6-desktop.json`
- `demian/public/assets/characters/setayesh/setayesh-atlas-v6-mobile.json`
- `demian/public/assets/characters/setayesh/setayesh-character-sheet-v6.png`
- `demian/public/assets/characters/setayesh/setayesh-character-v6.json`
- `demian/public/assets/characters/setayesh/setayesh-spritesheet-v6-compact.png`
- `demian/public/assets/characters/setayesh/setayesh-spritesheet-v6-desktop.png`
- `demian/public/assets/characters/setayesh/setayesh-spritesheet-v6-mobile.png`
- `demian/resources/js/game/characters/CharacterVisualContract.js`
