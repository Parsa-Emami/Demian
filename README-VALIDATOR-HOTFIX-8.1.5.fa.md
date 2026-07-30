# Hotfix اعتبارسنجی CI نسخه 8.1.5

این بسته خطای Validator فاز ۴ را که پس از جایگزینی wildcardهای `package.json` با Runner بازگشتی و چندسکویی رخ می‌داد اصلاح می‌کند.

## تغییرات

- افزودن قرارداد مشترک تشخیص Runner بازگشتی.
- هماهنگی Validatorهای فازهای ۴ تا ۸ با Runner جدید.
- پوشش صریح تمام گروه‌های تست از طریق اسکن بازگشتی `tests/js`.
- حذف فرض پوشه‌ی منسوخ `hide-and-seek/protocol` در Validator فاز ۵.
- اصلاح import Validator فاز ۷.
- افزودن تست واحد برای قرارداد Runner.
- هماهنگی Runtime، Workflow و Validator نهایی با نسخه `8.1.5-final`.

پس از اعمال بسته، `npm run test:js` باید ۱۴۹ تست را پاس کند و Validatorهای فازهای ۳ تا ۸ و `validate:final` نیز موفق شوند.
