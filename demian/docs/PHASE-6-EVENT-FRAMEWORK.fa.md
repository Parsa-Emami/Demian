# گزارش معماری و پیاده‌سازی فاز ششم — Event Framework

## ۱. هدف فاز

فاز ششم یک بازی مناسبتی ثابت نیست؛ یک چارچوب داده‌محور برای ساخت، زمان‌بندی، اجرای امن و توسعه‌ی رویدادهای متعدد است. معیار اصلی معماری این بوده است که افزودن Event جدید، تا حد ممکن با یک Definition تازه انجام شود و به ایجاد یک کلاس بازی، Renderer یا حلقه‌ی اجرایی جدید نیاز نداشته باشد.

این فاز روی تمام زیرساخت‌های فازهای قبل ساخته شده است:

- یک `WebGLRenderer` مشترک
- یک `GameRuntime` با Fixed Timestep
- Game Registry و lifecycle مشترک
- Collision، Trigger، Raycast و Spatial Hash
- Interaction و Navigation Grid
- Game Shell، Pause، Settings و Results
- Persistence و Event Bus

## ۲. معماری کلان

پیاده‌سازی به لایه‌های مستقل زیر تقسیم شده است:

### ۲.۱. Definition و Validation

هر رویداد یک سند نسخه‌دار با `schemaVersion` و `revision` است. Definition شامل اطلاعات نمایش، زمان، Spawn، Objectiveها، Modifierها، Rewardها و موجودیت‌های World می‌شود.

اعتبارسنجی در دو سمت انجام می‌شود:

- `EventDefinitionValidator.js` در Client و ابزارهای CI
- `EventDefinitionValidator.php` در Laravel و Repository سرور
- `event-definition.schema.json` برای قرارداد قابل استفاده توسط Editor، IDE یا CMS آینده

اعتبارسنجی فقط شکل JSON را بررسی نمی‌کند؛ وابستگی‌های Objective، چرخه‌ها، شناسه‌های تکراری، Referenceهای Zone/Enemy/Collectible، محدوده‌ی Modifier و شرط Reward نیز بررسی می‌شوند.

### ۲.۲. Registry و Loader

`EventRegistry` و `EventDefinitionLoader` مسئول موارد زیر هستند:

- Lazy load و Cache Definitionهای داخلی
- جلوگیری از بارگذاری تکراری
- دریافت Definition فعال از API
- Validation و Deep Freeze داده‌ها
- ثبت Definition جدید بدون تغییر `EventGame`
- fallback کنترل‌شده به Definition داخلی در نبود شبکه

### ۲.۳. Event Director

`EventDirector` یک State Machine قطعی و مستقل از Three.js و DOM است:

```text
IDLE
  → PREPARING
  → COUNTDOWN
  → ACTIVE
  → SUCCESS | FAILED
  → REWARD
  → RESULTS
```

Director مالک قوانین lifecycle، زمان Active، وضعیت Objectiveها، وابستگی‌ها، Failure Reason و Reward Receipt است. Snapshotهای خروجی immutable هستند و برای HUD، Replay، Telemetry یا نسخه‌ی Multiplayer قابل مصرف‌اند.

### ۲.۴. Objective System

Objectiveها از طریق Factory ساخته می‌شوند و پنج نوع عمومی دارند:

- `collect`
- `reach`
- `survive`
- `defeat`
- `score`

ویژگی‌های مهم:

- Objectiveهای Required و Optional
- Dependency Graph
- جلوگیری از چرخه‌ی وابستگی
- حالت‌های Locked، Active، Completed و Failed
- Event Ledger برای نگهداری پیشرفت معنایی زودهنگام
- فعال‌سازی زنجیره‌ای Objectiveهای وابسته
- امکان افزودن نوع Objective جدید بدون تغییر Director

Event Ledger مانع یک بن‌بست مهم می‌شود: اگر بازیکن قبل از بازشدن Objective به Zone برسد یا آیتم مربوطه را جمع کند، پیشرفت از بین نمی‌رود و هنگام Unlock بازیابی می‌شود.

### ۲.۵. Modifier System

Modifierها از منطق Event جدا هستند و به یک Snapshot ترکیبی تبدیل می‌شوند:

- `speed`
- `low-gravity`
- `fog`
- `double-score`

هر Modifier lifecycle مستقل `apply/reset/dispose` دارد. نتیجه به Renderer، حرکت، Score System و سیستم‌های بازی تزریق می‌شود و هنگام Restart یا Exit به حالت پایه بازمی‌گردد.

### ۲.۶. Reward و Persistence

`RewardResolver` Rewardهای شرطی را بر اساس نتیجه، امتیاز و Objectiveهای کامل‌شده حل می‌کند. Rewardهای پشتیبانی‌شده:

- Coin
- XP
- Badge
- Cosmetic

`EventRewardStore` نسخه‌دار است و Receipt را فقط یک‌بار اعمال می‌کند. در حالت آنلاین، Claim سرور به Receipt معتبر تبدیل می‌شود و Wallet محلی پیش از تأیید سرور به‌روزرسانی نمی‌گردد. در قطع شبکه، fallback محلی همچنان تجربه‌ی تک‌نفره را قابل استفاده نگه می‌دارد.

### ۲.۷. Event Game مشترک

`EventGame` تنها پیاده‌سازی بازی برای همه‌ی Eventها است و این وظایف را بر عهده دارد:

- ساخت World از Definition
- اتصال به Renderer مشترک
- استفاده از Collision Scope و Navigation Scope مستقل
- حرکت Player و Enemy
- جمع‌آوری، Reach، Attack و Damage
- تبدیل رخدادهای World به Eventهای معنایی Director
- HUD و کنترل موبایل/دسکتاپ
- ساخت Snapshot شبکه
- ساخت Evidence و ثبت نتیجه در API
- آزادسازی کامل Resourceها

`GameApplication` اکنون `startSession()` را `await` می‌کند تا بازی‌هایی که به handshake محدود و قابل لغو نیاز دارند، پیش از شروع شبیه‌سازی آماده شوند. تمام بازی‌های Sync قبلی بدون تغییر رفتار کار می‌کنند.

## ۳. رویدادهای نمونه

سه Event واقعی برای اثبات داده‌محوربودن چارچوب اضافه شده‌اند:

### Cafe Rush

جمع‌آوری سفارش‌های قهوه و تحویل آن‌ها به Counter. این Event وابستگی Objectiveها، Collect، Reach و Reward شرطی را نشان می‌دهد.

### Neon Collector

جمع‌آوری Neon Shard و رسیدن به Score هدف در محیط مه‌آلود. این Event ترکیب Fog و Double Score را آزمایش می‌کند.

### Survival Night

بقا در زمان مشخص و شکست‌دادن Droneها. این Event Objectiveهای Survive و Defeat، Navigation دشمن و Damage را پوشش می‌دهد.

## ۴. Session و API معتبر

APIهای فاز ششم:

```text
GET  /api/v1/events
GET  /api/v1/events/active
GET  /api/v1/events/{event}
POST /api/v1/events/{event}/sessions
POST /api/v1/event-sessions/{eventSession}/complete
```

### شروع Session

سرور موارد زیر را تولید می‌کند:

- UUID Session
- Definition Revision
- Seed
- Token تصادفی ۶۴ کاراکتری
- زمان شروع و انقضا

Token خام فقط یک‌بار به Client داده می‌شود و در دیتابیس تنها SHA-256 آن ذخیره می‌گردد.

### پایان Session

Client موارد زیر را ارسال می‌کند:

- Score
- Active Elapsed Time
- شناسه‌ی Collectibleهای جمع‌آوری‌شده
- شناسه‌ی Zoneهای رسیده‌شده
- شناسه‌ی Enemyهای شکست‌خورده

سرور موارد زیر را بررسی می‌کند:

- Token با مقایسه‌ی timing-safe
- Active و منقضی‌نبودن Session
- ثابت‌بودن Definition Revision
- جلوترنبودن زمان Client از زمان سرور
- سقف امتیاز قابل قبول
- مطابقت Evidence با World Definition
- کامل‌شدن Objectiveهای Required
- شروط Reward

ثبت نتیجه داخل Transaction و `lockForUpdate` انجام می‌شود. `event_session_id` در جدول Claim یکتا است؛ بنابراین تکرار درخواست همان Claim را برمی‌گرداند و Reward دوباره صادر نمی‌شود.

سطح Integrity فعلی `client-evidence` است. این سطح برای نسخه‌ی تک‌نفره و رویدادهای معمول مناسب است. برای رقابت دارای جایزه‌ی واقعی یا Multiplayer، مرحله‌ی بعد باید شبیه‌سازی authoritative، Replay امضاشده یا command validation سرور باشد.

## ۵. تحمل خطا و Offline

- دریافت Event فعال timeout محدود دارد.
- شکست API در Preload باعث استفاده از Event داخلی می‌شود.
- Session API فقط وقتی استفاده می‌شود که Active Definition با موفقیت از سرور دریافت شده باشد.
- درخواست‌ها به `AbortController` متصل‌اند و در Restart یا Exit لغو می‌شوند.
- شکست Claim باعث fallback محلی و ارسال Event تشخیصی می‌شود.
- پاسخ malformed یا HTTP error در `EventApiClient` رد می‌شود.
- Session قدیمی نمی‌تواند پس از تغییر بازی Result جدید را تغییر دهد.

## ۶. توسعه‌ی Event جدید

برای Event جدید:

1. یک JSON مطابق Schema در `definitions/` ایجاد شود.
2. شناسه، Revision، Duration، Objective، Modifier، Reward و World تعریف شوند.
3. Definition در Sourceهای Registry ثبت شود یا از API بازگردد.
4. `npm run test:js` اجرا شود.
5. `npm run validate:phase6` اجرا شود.

برای Objective یا Modifier کاملاً جدید، فقط کلاس مربوطه و Registration آن در Factory/System لازم است؛ State Machine و EventGame بازنویسی نمی‌شوند.

## ۷. امنیت و محدودیت اعتماد

- Definition دریافتی از API قبل از استفاده Validate و Freeze می‌شود.
- Laravel نیز Definition فایل را پیش از ارائه یا محاسبه‌ی Reward Validate می‌کند.
- Routeها Rate Limit دارند.
- ورودی‌ها با Laravel Validation محدود می‌شوند.
- Token در Response Model مخفی است.
- Evidence canonical و مرتب می‌شود و Hash آن ذخیره می‌گردد.
- Claim ایدمپوتنت است.
- هیچ Reward آنلاین پیش از پاسخ معتبر سرور در Wallet محلی Commit نمی‌شود.

Client همچنان محیط قابل کنترل کاربر است و Evidence به‌تنهایی ضدتقلب کامل محسوب نمی‌شود. این مرز اعتماد در کد و خروجی API با `integrity_level` شفاف شده است.

## ۸. تست و CI

پوشش JavaScript شامل تمام فازهای قبل و فاز ششم است. تست‌های اختصاصی فاز ششم موارد زیر را پوشش می‌دهند:

- سه Definition واقعی
- Reference و Duplicate ID
- چرخه‌ی Dependency
- Required و Optional Objective
- Early Semantic Progress
- همه‌ی Objective Typeها
- Modifier Composition/Reset
- Reward شرطی و Idempotency
- Server Claim Receipt
- Registry، Cache و Remote Active Definition
- API Client، Header Token و پاسخ malformed
- Protocol و Snapshot immutable
- Lazy Registration بازی Event

CI اکنون این مراحل را اجرا می‌کند:

1. نصب dependencyهای Composer همراه require-dev
2. Migration و آماده‌سازی Laravel
3. `php artisan test`
4. `npm ci`
5. `npm run test:js`
6. `npm run validate:phase6`
7. `npm run build`
8. بررسی Vite Manifest و خروجی استقرار

## ۹. نتیجه

فاز ششم یک زیرساخت قابل توسعه برای Eventهای آینده ایجاد می‌کند، نه یک پیاده‌سازی یک‌بارمصرف. قوانین دامنه از Renderer و DOM مستقل‌اند، Definitionها در دو سمت Validate می‌شوند، Reward آنلاین ایدمپوتنت است، حالت Offline حفظ می‌شود و مسیر ارتقا به API/CMS، Multiplayer و شبیه‌سازی authoritative بدون شکستن معماری فعلی باز مانده است.
