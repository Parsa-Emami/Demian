# Demian Game Platform 9.1 + Arcade Pack 1

نسخه تجمعی فازهای ۱ تا ۸ با رندر دوبعدی پیکسلی، کافه مشترک و استقرار Atomic روی GitHub Pages.

## بازی‌ها و زیرساخت‌ها

- یک `GameRuntime` قطعی با Fixed Update و Input Context مستقل برای هر بازی
- یک Renderer قابل‌مشاهده‌ی مشترک مبتنی بر Canvas2D و Nearest-Neighbor
- کافه داده‌محور مشترک برای Open World، Role Play، Hide & Seek، Event و پس‌زمینه Tetris
- Collision، Interaction و Navigation مستقل از Renderer
- Open World با ۱۲ Chunk، چهار District، Mini Map، World Map و Save Point
- Role Play با Dialogue، Quest، Inventory، Job و Save نسخه‌دار
- Hide & Seek، Event Framework و Tetris قطعی
- شش مینی‌گیم دوبعدی جدید: Neon Run، Star Catcher، Café Drift، Shadow Maze، Sky Hop و Rhythm Rush
- Roster سراسری ۱۳ کاراکتر با انتخاب زنده داخل مینی‌گیم‌ها؛ ۱۱ شخصیت ارسالی روی Asset Pack دقیق v9
- رابط واکنش‌گرا برای موبایل و دسکتاپ
- یک Bundle جاوااسکریپت Atomic برای جلوگیری از خطای فایل‌های هش‌شده‌ی حذف‌شده در GitHub Pages
- Recovery محافظت‌شده برای `vite:preloadError` و Asset Fallback برای کاراکترها

## راه‌اندازی

```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
npm ci
npm run test:js
npm run validate:final
npm run build
npm run validate:build
php artisan serve
```

## اعتبارسنجی کامل

```bash
npm run test:js
npm run validate:ui-layers
npm run validate:phase3
npm run validate:phase4
npm run validate:phase5
npm run validate:phase6
npm run validate:phase7
npm run validate:phase8
npm run validate:final
npm run build
npm run validate:build
```

`validate:build` فقط زمانی موفق می‌شود که Manifest تولیدی Vite یک Entry معتبر و دقیقاً یک فایل JavaScript داشته باشد و هیچ Chunk مستقلی با نام بازی‌ها تولید نشده باشد.

## مستندات کلیدی

- `docs/PIXEL-2D-ARCHITECTURE.fa.md`
- `docs/PHASE-8-OPEN-WORLD.fa.md`
- `docs/GITHUB-PAGES-ATOMIC-DEPLOYMENT.fa.md`
- `docs/FINAL-INTEGRATION-AND-MOBILE-UX.fa.md`
- `docs/ARCADE-MINI-GAMES-V1.fa.md`
