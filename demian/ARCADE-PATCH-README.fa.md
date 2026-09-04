# Demian Arcade Pack 1 — راهنمای Patch

این Patch شش مینی‌گیم دوبعدی و Roster کامل کاراکترها را به نسخه‌ی موجود پروژه اضافه می‌کند.

## نصب Patch روی نسخه‌ی اصلی

محتویات ZIP Patch را با حفظ ساختار مسیرها روی ریشه‌ی `Demian-main/` کپی و Merge کنید. فایل‌های هم‌نام باید با نسخه‌ی داخل Patch جایگزین شوند. سپس داخل فولدر `demian/`:

```bash
npm ci
npm run test:js
npm run test:ci
npm run build
```

هیچ `node_modules` یا Build Artifact در ZIP Patch قرار داده نشده است.

## نکته‌ی Assetها

۱۱ Character Sheet ارسال‌شده از قبل عیناً در پروژه به‌عنوان Reference v9 وجود داشتند. برای جلوگیری از افت کیفیت یا تغییر جزئیات، آن‌ها بازتولید نشده‌اند و Runtime مستقیماً از Pack v9 متناظر استفاده می‌کند. گزارش SHA-256 در `demian/docs/validation/ARCADE-CHARACTER-REFERENCE-INTEGRITY.json` است.

## بازی‌های جدید

`neon-run`, `star-catcher`, `cafe-drift`, `shadow-maze`, `sky-hop`, `rhythm-rush`.

جزئیات معماری: `demian/docs/ARCADE-MINI-GAMES-V1.fa.md`.
