# اصلاح مرز معماری کافه و CI — Patch 9.1.2

## مشکل

فایل قدیمی `resources/js/game/shared/cafe/CafeScenePolicy.js` پس از مهاجرت رندرهای قابل مشاهده به Canvas2D در مخزن باقی مانده بود. این فایل مستقیماً `three` را وارد می‌کرد، در حالی که پوشه `game/shared` قراردادها و منطق مستقل از Renderer را نگه می‌دارد. Validator فاز چهار به‌درستی این نقض مرز معماری را متوقف می‌کرد.

## اصلاح

- فایل قدیمی `CafeScenePolicy.js` حذف شد؛ هیچ Renderer فعال Pixel2D آن را مصرف نمی‌کند.
- Validator فاز چهار برای تمام شکل‌های Import از `three` و استفاده مستقیم از namespace `THREE` سخت‌گیرتر شد.
- تست `CafeArchitectureBoundary.test.js` اضافه شد تا بازگشت فایل یا وابستگی Three.js به لایه shared پیش از Build شناسایی شود.
- تست مرزی جدید به مجموعه سریع `test:ci` افزوده شد.

این Patch Validator را دور نمی‌زند؛ وابستگی اشتباه را از لایه shared حذف و قرارداد معماری را قابل‌آزمایش می‌کند.
