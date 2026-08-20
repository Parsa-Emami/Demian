# Hotfix خطای GitHub Actions #66

خطای اصلی:

`Only arrays and Traversables can be unpacked`

در `CharacterController.php` متد `store()` این کار را انجام می‌دهد:

```php
$paths = $this->assets->store(...);
...
...$paths,
```

ولی `CharacterAssetService::store()` در سورس فعلی `: void` است، بنابراین `$paths` برابر `null`
می‌شود و spread روی null خطای 500 ایجاد می‌کند.

این hotfix قرارداد سرویس را با Controller و تست‌های فعلی هماهنگ می‌کند:

- `store()` دو فایل `sprite_sheet` و `atlas` را می‌گیرد و آرایه‌ی pathها را برمی‌گرداند.
- فایل‌های custom روی disk `public` در مسیر مورد انتظار تست ذخیره می‌شوند:
  `characters/{slug}/spritesheet.png` و `characters/{slug}/atlas.json`
- `replace()` دوباره پیاده‌سازی شده تا update کاراکتر custom بعد از رفع تست اول fail نشود.
- `delete(Character $character)` با امضایی که Controller واقعاً صدا می‌زند پیاده‌سازی شده است.
- manifest کاراکترهای custom از URLهای storage استفاده می‌کند.
- manifest کاراکترهای built-in همچنان pack version را رعایت می‌کند.
- هر دو prefix قدیمی و جدید cache پاک می‌شوند.

## نصب

این ZIP را از ریشه repository استخراج کنید؛ تنها فایل PHP جایگزین می‌شود.

سپس:

```bash
cd demian
php artisan test --stop-on-failure
npm run test:ci
npm run validate:final
npm run build
```
