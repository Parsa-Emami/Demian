# گزارش جامع پیاده‌سازی فاز هشتم و تحویل نهایی Demian Game Platform

## ۱. خلاصه اجرایی

فاز هشتم، نسخه‌ی نهایی معماری تعریف‌شده برای Demian Game Platform است. در این فاز Open World ثابت فازهای قبل به یک جهان گسترده، داده‌محور، قابل Stream و پایدار تبدیل شد؛ بدون ایجاد Renderer یا Game Loop جدید و بدون شکستن بازی‌ها و زیرساخت‌های فازهای یک تا هفت.

خروجی نهایی شامل این محورهای اصلی است:

- World Manifest نسخه‌دار به‌عنوان منبع حقیقت جهان
- World Partition و مختصات Chunkها
- Chunk Streaming اولویت‌دار و دارای سقف حافظه
- Mini Map، World Map، Fog-of-War و Fast Travel
- AI Budgeting فاصله‌محور
- Save Point و ذخیره‌ی checksumدار
- Lifecycle کامل Collider، Navigation Blocker و منابع Three.js
- تست رگرسیون تمام فازها و Validatorهای معماری
- CI نهایی برای تست، اعتبارسنجی و Build

## ۲. معماری نهایی

```text
GameApplication
├── RendererService                  # یک WebGLRenderer مشترک
├── GameRuntime                      # یک loop ثابت مشترک
├── GameRegistry                     # بارگذاری Lazy بازی‌ها
├── CollisionWorld / Interaction / Navigation
└── OpenWorldGame
    ├── WorldManifest
    ├── WorldPartition
    ├── WorldDiscovery
    ├── EnvironmentSystem
    ├── ChunkManager
    │   ├── ChunkLoader
    │   ├── ChunkUnloader
    │   └── OpenWorldChunkRenderer
    ├── AiBudgetScheduler
    ├── SavePointSystem
    ├── OpenWorldSaveStore
    └── OpenWorldHud
        ├── MiniMap
        └── WorldMap
```

لایه‌های Manifest، Partition، Streaming Policy، Discovery، AI Budget و Persistence از Three.js و DOM مستقل‌اند. Three.js فقط در آداپتر رندر Chunk و HUD در لایه‌ی UI استفاده می‌شود. این مرزبندی امکان جایگزینی منبع Chunk با API، CDN، فایل GLTF یا محتوای تولیدشده را بدون تغییر هسته فراهم می‌کند.

## ۳. World Manifest

فایل `DemianCityManifest.js` یک Manifest قطعی و نسخه‌دار برای شهر دمیان تعریف می‌کند:

- ۲۴ Chunk داده‌محور
- ۶ District
- ۶ Save Point
- Chunk Size برابر ۳۲ واحد
- Spawn اصلی
- Bounds نهایی جهان
- Theme، Seed، Obstacle، Prop و Point of Interest هر Chunk

`WorldManifest` پیش از ساخت جهان این موارد را اعتبارسنجی می‌کند:

- شناسه‌های یکتا
- مختصات Grid یکتا و صحیح
- Origin و Spawn محدود و عددی
- ارجاع معتبر Chunk به District
- ارجاع معتبر Save Point به Chunk و District
- Themeهای شناخته‌شده
- Seed معتبر
- داده‌ی Obstacle معتبر

تعریف نرمال‌شده immutable است تا هیچ System در Runtime نتواند Manifest را ناخواسته تغییر دهد.

## ۴. World Partition

`WorldPartition` مسئول تبدیل میان فضای جهان و Grid است:

- تبدیل Position به Grid Coordinate
- یافتن Chunk برای Position
- محاسبه‌ی Ringهای اطراف Player
- مرتب‌سازی براساس فاصله و اولویت
- Clamp موقعیت به Bounds جهان
- تشخیص Chunk و District جاری

تمام محاسبات Origin-aware هستند؛ بنابراین گسترش جهان به مختصات منفی یا انتقال Origin بدون تغییر Game Logic ممکن است.

## ۵. Chunk Streaming

`ChunkManager` یک State Machine مستقل برای چرخه‌ی Chunkها دارد:

```text
Unloaded → Queued → Loading → Active/Dormant → Unloading → Unloaded
```

ویژگی‌های اصلی:

- Active Ring برای Chunk جاری و همسایه‌های نزدیک
- Preload/Dormant Ring برای آماده‌سازی اطراف
- اولویت Active قبل از Dormant
- محدودیت تعداد Load هم‌زمان
- سقف `maxLoadedChunks`
- لغو درخواست‌های منسوخ با `AbortController`
- Promotion و Demotion بدون Reload غیرضروری
- جلوگیری از Evict شدن Chunk جاری
- Unload قطعی و idempotent
- Eventهای قابل مشاهده برای Telemetry و HUD

در Profile ضعیف، Concurrency کاهش می‌یابد. تعداد هدف‌ها نیز پیش از Load با Budget محدود می‌شود؛ در نتیجه سیستم ابتدا Chunk اضافی را Load و سپس Evict نمی‌کند.

## ۶. Lifecycle رندر، Collision و Navigation

`OpenWorldChunkRenderer` آداپتر مشترک هر Chunk است و قرارداد زیر را اجرا می‌کند:

```text
create → setTier → update → dispose
```

هنگام Load:

- Group سه‌بعدی Chunk ساخته می‌شود.
- Floor، Road، Building، Neon و Save Point Beacon ایجاد می‌شوند.
- Static Colliderهای Chunk ثبت می‌شوند.
- Dynamic Blockerهای Navigation ثبت می‌شوند.

هنگام Unload:

- Group از Scene حذف می‌شود.
- Colliderها از Scope حذف می‌شوند.
- Navigation Blockerها حذف می‌شوند.
- Geometry/Materialهای مشترک فقط در پایان Session توسط `EnvironmentSystem` آزاد می‌شوند.

این مدل از نشت GPU، Collider و Grid State هنگام رفت‌وآمد طولانی جلوگیری می‌کند.

## ۷. Mini Map و World Map

### Mini Map

Mini Map به‌صورت Canvas سبک ساخته شده و نمایش می‌دهد:

- Chunkهای کشف‌شده
- Fog-of-War برای نواحی ناشناخته
- Chunkهای Active
- موقعیت و جهت Player
- Save Pointهای بازشده
- مرز و ساختار Districtها

### World Map

World Map یک Modal مستقل و دسترس‌پذیر است:

- نمایش کل شهر و District Labelها
- انتخاب Save Point
- وضعیت Locked/Unlocked
- Fast Travel فقط برای نقاط فعال‌شده
- بارگذاری Chunk مقصد پیش از انتقال Player
- بسته‌شدن با Escape و بازگردانی صحیح حالت بازی

کلید `M` نقشه را باز می‌کند و Mini Map در موبایل نیز قابل لمس است.

## ۸. Discovery و Fog-of-War

`WorldDiscovery` وضعیت زیر را نگهداری می‌کند:

- Chunkهای کشف‌شده
- Districtهای کشف‌شده
- Save Pointهای بازشده

عملیات idempotent است؛ کشف دوباره‌ی یک ناحیه Event یا ذخیره‌ی تکراری ایجاد نمی‌کند. Snapshot قابل Export/Import بوده و همراه Save ذخیره می‌شود.

## ۹. AI Budgeting

`AiBudgetScheduler` NPCها را براساس فاصله و اهمیت به Tier تقسیم می‌کند:

| Tier | نرخ هدف | رندر | نوع Update |
|---|---:|---|---|
| Near | 30 Hz | فعال | کامل |
| Visible | 15 Hz | فعال | کامل |
| Distant | 5 Hz | فعال | کم‌فرکانس |
| Dormant | 1 Hz | غیرفعال | داده‌ای |

در هر Frame سقف Update وجود دارد. ارتقای NPC از Dormant به Near فوری انجام می‌شود تا ورود Player به منطقه باعث تأخیر محسوس نشود. `CharacterManager` و `NpcBrain` برای Bounds نامتقارن جهان و Budget Scheduler بازآرایی شده‌اند.

## ۱۰. Save Point و Persistence

`OpenWorldSaveStore` داده را نسخه‌دار و checksumدار ذخیره می‌کند. داده‌ی ذخیره‌شده شامل موارد زیر است:

- World ID و World Version
- Character فعال
- Position بازیکن
- Chunk و District جاری
- Discovery State
- Save Pointهای بازشده
- Last Save Point
- زمان ذخیره

ذخیره در این نقاط انجام می‌شود:

- فعال‌سازی Save Point
- Quick Save با F6
- Fast Travel
- Pause
- Exit/Dispose

داده‌ی دستکاری‌شده، ناسازگار یا مربوط به Manifest جدیدتر رد می‌شود. Fast Travel نیز `lastSavePointId` داخلی و Persisted State را هماهنگ نگه می‌دارد.

## ۱۱. سازگاری با فازهای قبلی

فاز هشتم زیرساخت‌های قبلی را حذف یا دور نمی‌زند:

- Tetris و Replay همچنان قطعی‌اند.
- Collision، Interaction و Navigation مشترک باقی مانده‌اند.
- Hide & Seek از همان سرویس‌ها استفاده می‌کند.
- Event Framework و API سمت سرور بدون تغییر فعال‌اند.
- Role Play، Dialogue، Quest، Inventory و Story Journal حفظ شده‌اند.
- Open World همچنان همان Game ID و lifecycle را دارد.
- Renderer و Runtime جدیدی ایجاد نشده است.

## ۱۲. تست‌ها

نتیجه‌ی رگرسیون نهایی:

- ۱۴۳ تست JavaScript
- ۱۴۳ تست موفق
- صفر خطا
- صفر Skip

Validatorهای معماری:

- Phase 3: موفق — ۲۲۵ فایل JavaScript
- Phase 4: موفق — ۲۳۱ فایل JavaScript/MJS و ۵۳ فایل PHP
- Phase 5: موفق — ۲۳۱ فایل JavaScript/MJS و ۵۳ فایل PHP
- Phase 6: موفق — به‌همراه سه Event Definition
- Phase 7: موفق — به‌همراه سه Dialogue و سه Quest
- Phase 8: موفق — ۲۴ Chunk، شش District و شش Save Point

تست‌های اختصاصی فاز هشتم موارد زیر را پوشش می‌دهند:

- اعتبار Manifest و ارجاع‌ها
- Origin نامعتبر
- Partition و Streaming Ring
- Load/Unload و Memory Budget
- لغو Load منسوخ
- Tierهای AI و سقف Update
- Save checksum و تشخیص دستکاری
- نسخه‌ی آینده‌ی Manifest
- Save Point Restore
- Discovery idempotent
- Input و Registry Metadata

## ۱۳. وضعیت Build در محیط تحویل

`npm ci` در sandbox به‌دلیل پاسخ HTTP 404 از Proxy داخلی محیط برای tarball مربوط به `yargs-parser@21.1.1` متوقف شد. آدرس مذکور در `package-lock.json` پروژه وجود ندارد؛ lockfile فقط URLهای استاندارد `registry.npmjs.org` دارد.

در نتیجه Vite در sandbox نصب نشد و `npm run build` قابل اجرا نبود. همچنین پوشه‌ی `vendor` در ورودی موجود نبود و PHPUnit اجرا نشد. بااین‌حال PHP lint برای تمام ۵۳ فایل و تمام Validatorهای منبع موفق بوده‌اند.

دستورهای نهایی در محیط دارای اینترنت:

```bash
cd demian
composer install
php artisan test
npm ci
npm run test:js
npm run validate:phase3
npm run validate:phase4
npm run validate:phase5
npm run validate:phase6
npm run validate:phase7
npm run validate:phase8
npm run build
```

## ۱۴. فایل‌های مهم فاز هشتم

```text
resources/js/game/games/open-world/
├── data/DemianCityManifest.js
├── entities/AiBudgetScheduler.js
├── persistence/OpenWorldSaveStore.js
├── persistence/SavePointSystem.js
├── render/OpenWorldChunkRenderer.js
├── streaming/ChunkLoader.js
├── streaming/ChunkManager.js
├── streaming/ChunkUnloader.js
├── ui/MiniMap.js
├── ui/OpenWorldHud.js
├── ui/WorldMap.js
├── world/EnvironmentSystem.js
├── world/WorldDiscovery.js
├── world/WorldManifest.js
└── world/WorldPartition.js
```

## ۱۵. نتیجه نهایی

نسخه‌ی تحویلی یک Platform چندبازی با هشت فاز یکپارچه است. Open World نهایی اکنون داده‌محور، Streamable، قابل گسترش، دارای Persistence، Map و AI Budget است و مرزهای لایه‌ها برای توسعه‌ی محتوای جدید، API، CDN، Asset Pipeline و Multiplayer آینده آماده‌اند.
