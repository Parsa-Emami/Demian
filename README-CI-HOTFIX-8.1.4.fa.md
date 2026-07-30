# Hotfix 8.1.4 — تست آپلود کاراکتر و اجرای JavaScript روی Windows

## خطای Laravel

تست `character can be uploaded` یک Atlas ناقص می‌ساخت که فقط Animation `idle` داشت،
در حالی که قرارداد `AtlasManifest` شش Animation زیر را الزامی می‌داند:

- idle
- walk
- run
- jump
- attack
- win

Fixture تست اکنون معتبر است. یک تست مستقل نیز اضافه شده که Atlas ناقص را با پاسخ 422
بررسی می‌کند تا قرارداد اعتبارسنجی حفظ شود.

## خطای JavaScript در Windows

Windows wildcard زیر را expand نمی‌کند:

```text
node --test tests/js/*.test.js
```

نسخه 8.1.4 از `tools/run_js_tests.mjs` استفاده می‌کند. این Runner همه‌ی فایل‌های
`.test.js` را بازگشتی پیدا می‌کند و مسیر صریح آن‌ها را به Node می‌دهد.

## نتیجه

- 147/147 تست JavaScript موفق
- Validator نهایی موفق
- PHP syntax معتبر
