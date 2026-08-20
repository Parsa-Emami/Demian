# Demian character hotfix — base commit `c938504`

این ZIP برای آخرین سورس بررسی‌شده‌ی `Parsa-Emami/Demian` در زمان ساخت پچ تولید شده است.

## مشکل‌هایی که اصلاح می‌شوند

1. `d31c01c` هنگام اضافه‌کردن Uzudi، رکوردهای Darya و Iman را از `BuiltinCharacterSeeder` حذف کرده بود.
2. commit بعدی `c938504` تست‌ها و audit را نیز به roster پنج‌نفره محدود کرده بود؛ در نتیجه regression شناسایی نمی‌شد.
3. `CharacterVisualContract.js` همه‌ی built-in ها را V6 فرض می‌کرد، در حالی که Seeder فعلی TIAM/RONAK/AMIRREZA/PARSA را روی V5 و Uzudi را روی V6 نگه می‌دارد.
4. `CharacterAssetService.php` برعکس، برای همه V5 تولید می‌کرد. این سه منبع متفاوت می‌توانند atlas و sprite-sheet نامنطبق بسازند.
5. GitHub Pages فقط `TiamCharacterSeeder` را اجرا می‌کرد و چند لیست hard-code شده فقط 3 یا 4 کاراکتر را validate/prefix می‌کردند.
6. Setayesh در هیچ roster رسمی، seeder یا Pages validation وجود نداشت.

## راه‌حل

- یک registry واحد و صریح برای version هر built-in:
  - V5: `tiam`, `ronak`, `amirreza`, `parsa`, `darya`, `iman`, `setayesh`
  - V6: `uzudi`
- Darya و Iman دوباره built-in می‌شوند و برای جلوگیری از همان artifact دیده‌شده از pack پایدار V5 استفاده می‌کنند.
- Setayesh با سه variant واقعی `desktop/mobile/compact` و atlas سازگار با `framesRight/framesLeft/framesByDirection` اضافه می‌شود.
- Pages کل roster هشت‌نفره را seed، prefix و validate می‌کند.
- audit دیگر Darya/Iman/Setayesh را نادیده نمی‌گیرد و mixed versions را می‌فهمد.

## نصب

ZIP را روی **ریشه repository** استخراج کنید. فایل‌های کوچک مستقیماً در مسیر نهایی هستند.
دو فایل بزرگ (`CharacterManager.js` و workflow) با patcher marker-based اصلاح می‌شوند:

```bash
python3 apply_latest_c938504_hotfix.py
```

سپس برای تست کامل:

```bash
./install_and_validate.sh
```

یا دستی:

```bash
cd demian
php artisan optimize:clear
php artisan migrate:fresh --seed --force
php artisan test --stop-on-failure
npm run test:ci
npm run validate:final
npm run build
npm run validate:build
```

> اگر HEAD بعد از `c938504` تغییر کرده باشد، patcher به‌جای حدس‌زدن روی markerهای نامعتبر متوقف می‌شود.

## نکتهٔ کش GitHub Pages

بعد از deploy جدید، اگر مرورگر هنوز bundle قبلی را cache کرده، یک hard reload انجام دهید. workflow همچنان aliasهای V4 سازگار را می‌سازد تا در rollout نیز atlas/sheet مخلوط نشوند.
