# دمیان — راهنمای جاری مخزن (Demian)

دمیان مجموعه‌ای از **۷ بازی دوبعدی تک‌نفره** با لیدربورد **غیرهمزمان** و هویت بصری کافه است. فهرست فعال بازی‌ها از [GameCatalog.js](demian/resources/js/game/catalog/GameCatalog.js) و فهرست ۱۹ کاراکتر از [Character Manifest](demian/public/assets/characters/character-manifest-v4.json) خوانده می‌شود؛ در صورت تغییر کد، این راهنما و تست هماهنگی باید با هم اصلاح شوند.

## بازی‌های فعال

| بازی | شناسه |
| --- | --- |
| Open World | `open-world` |
| Dino Run | `dino-run` |
| After Hours | `after-hours` |
| Café Rush | `cafe-rush` |
| Café Critters | `cafe-critters` |
| Coffee Crash | `coffee-crash` |
| Café Drift | `cafe-drift` |

لیست فعلی ۱۹ کاراکتر به ترتیب Manifest: دریا، ستایش، اوزودی، الهه، نگار، دندلاکس، تیام، امیررضا، حنا، آیناز، ارسل، ایمان، امین، حسین، طاهر DB، سرخی، یلدا، موری و مهیار. حضور یک کاراکتر در Manifest فقط به معنی وجود بستهٔ اجرایی است؛ **تأیید نهایی بازسازی هنری PNG/اسپرایت‌شیت‌ها هنوز در بدهی فنی باز است.**

## اجرا و ساخت فرانت‌اند

نیازمندی: **Node.js 24**، npm، Python 3 با Pillow (برای دروازه‌های Asset)، و مرورگر مدرن.

```bash
cd demian
npm ci
npm run test:ci
npm run validate:final
npm run validate:ui-layers
npm run validate:characters:v14
npm run build:static
npm run validate:static-assets
npm run validate:build
python3 -m http.server 8080 --directory _site
```

نسخهٔ استاتیک قابل مشاهده در `playable/` با وب‌سرور HTTP اجرا می‌شود:

```bash
python3 -m http.server 8080 --directory playable
```

برای بازسازی `playable/` از سورس پس از سبز شدن همهٔ دروازه‌ها:

```bash
cd demian
npm run build
node tools/export_static.mjs --out=../playable
```

## Backend و انتشار

Backend با **Laravel / PHP و MySQL** مستقل از خروجی Frontend است؛ انتشار GitHub Pages به معنی آنلاین بودن API یا تأیید سیستم جایزه نیست. جهت آزمایش محلی باید `composer install`، تنظیم `.env`، migrationهای سازگار و تست‌های PHPUnit در محیط مجزا انجام شوند. اجرای CI این مخزن هر دو ماتریس **SQLite و MySQL** را می‌سنجد.

انتشار رسمی به موفقیت Frontend، Backend و تأیید SHA-محور `release-qa` وابسته است. حالت تمرینی می‌تواند بدون API کار کند؛ Ranked/کوپن تنها پس از احراز هویت، اعتبارسنجی سمت سرور و پذیرش مستقل مالی قابل فعال‌سازی است. آزمون CI جایگزین آزمون موبایل و هاست واقعی نیست.

## اسناد جاری

- [فاز صفر: تثبیت CI، معیارهای پذیرش و مبنای اندازه‌گیری](demian/docs/phase0/PHASE_00_STABILIZATION.md)
- [بررسی ۲۴ PR قدیمی و وابستگی‌های ادغام](demian/docs/phase0/OPEN_PR_TRIAGE_2026-11-21.md)
- [استاندارد طراحی هفت بازی](demian/docs/game-design/GAME_DESIGN_STANDARD_V1.fa.md)
- [فاز ۱ — راهنمای اجرایی هفت بازی، آموزش و عدالت رقابتی](demian/docs/game-design/PHASE_01_GAME_EXPERIENCE.fa.md)
- [فاز ۶ — استاندارد محیط، نور و تأیید تصویری کافه](demian/docs/gameplay/PHASE_06_ENVIRONMENT_ART_BIBLE.fa.md)
- [فاز ۷ — استاندارد تجربهٔ کاربر، دسترس‌پذیری و صدا](demian/docs/gameplay/PHASE_07_UX_AUDIO_ACCESSIBILITY.fa.md)
- [فاز ۸ — پذیرش عملکرد، حافظه و PWA](demian/docs/gameplay/PHASE_08_MOBILE_PWA_ACCEPTANCE.fa.md)
- [فاز ۹ — امنیت و احراز هویت با OTP و اعتراض ضدتقلب](demian/docs/gameplay/PHASE_09_SECURITY_IDENTITY_FRAUD.fa.md)
- [فاز ۱۰ — معماری Production و استقرار ایمن روی cPanel](demian/docs/gameplay/PHASE_10_CPANEL_PRODUCTION_ARCHITECTURE.fa.md)
- [فاز ۱۱ — QA نهایی، پذیرش واقعی و Go/No-Go](demian/docs/gameplay/PHASE_11_FINAL_QA_GO_NO_GO.fa.md)
- [بدهی هنری کاراکترها](demian/docs/technical-debt/TD-ART-001-ART-REBUILD.fa.md)
- [راهنمای قبلی V14 (آرشیوی، نه وضعیت فعلی)](demian/docs/archive/README_V14_legacy_notes.fa.md)

**توجه:** README قدیمی شامل اعداد تست و فهرست کاراکترهای منسوخ بود و برای جلوگیری از اشتباه به آرشیو منتقل شده است. وضعیت تأییدشدهٔ هر نسخه را فقط از GitHub Actions و SHA متناظر بخوانید.
