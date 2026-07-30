# فاز هشتم — Open World گسترده و تحویل نهایی

## هدف

فاز هشتم دنیای ثابت `ArcadeWorld` را به یک جهان گسترده‌ی داده‌محور تبدیل می‌کند. هسته‌ی بازی همچنان فقط از یک `WebGLRenderer`، یک `GameRuntime` و سرویس‌های مشترک Collision، Interaction و Navigation استفاده می‌کند؛ اما محتوای جهان با Chunk Streaming وارد و خارج می‌شود.

## معماری

```text
OpenWorldGame
├── WorldManifest / DemianCityManifest
├── WorldPartition
├── ChunkManager
│   ├── ChunkLoader
│   ├── ChunkUnloader
│   └── OpenWorldChunkRenderer
├── EnvironmentSystem
├── AiBudgetScheduler
├── WorldDiscovery
├── SavePointSystem / OpenWorldSaveStore
└── OpenWorldHud
    ├── MiniMap
    └── WorldMap
```

### World Manifest

Manifest نسخه‌دار، منبع حقیقت جهان است و شامل موارد زیر می‌شود:

- ۲۴ Chunk
- شش District
- شش Save Point
- Spawn اصلی
- Bounds جهان
- Theme، Seed، Obstacle و Point of Interest هر Chunk

تمام شناسه‌ها، مختصات و ارجاع‌های میان Chunk، District و Save Point پیش از اجرا اعتبارسنجی می‌شوند.

### Chunk Streaming

`ChunkManager` مستقل از Three.js است و مسئول این موارد است:

- Active Ring در فاصله‌ی صفر تا یک Chunk
- Dormant/Preload Ring در فاصله‌ی دو Chunk
- صف اولویت‌دار Active قبل از Dormant
- محدودیت Concurrency
- لغو Loadهای منسوخ با `AbortController`
- سقف حافظه با `maxLoadedChunks`
- Promotion و Demotion بدون Load مجدد
- تخلیه‌ی Collider، Navigation Blocker و Group هنگام Unload
- حفظ Chunk فعلی هنگام Eviction

`OpenWorldChunkRenderer` فقط آداپتر رندر است و از Lifecycle استاندارد `create → setTier → update → dispose` پیروی می‌کند.

### Navigation و Collision

Colliderهای هر Chunk همراه همان Chunk ثبت می‌شوند. در زمان Unload:

- Collider از `CollisionScope` حذف می‌شود.
- Dynamic Blocker از `NavigationGrid` حذف می‌شود.
- Mesh Group از Scene خارج می‌شود.

مرزهای کل شهر Collider ثابت دارند و Navigation Grid کل Manifest را پوشش می‌دهد.

### AI Budgeting

`AiBudgetScheduler` NPCها را براساس فاصله به چهار Tier تقسیم می‌کند:

| Tier | نرخ | رندر | نوع شبیه‌سازی |
|---|---:|---|---|
| Near | 30 Hz | فعال | کامل |
| Visible | 15 Hz | فعال | کامل |
| Distant | 5 Hz | فعال | کم‌فرکانس |
| Dormant | 1 Hz | غیرفعال | داده‌ای |

در هر Frame سقف مشخصی برای Updateهای AI وجود دارد تا Spike پردازشی ایجاد نشود.

### Mini Map و World Map

Mini Map موارد زیر را نشان می‌دهد:

- Chunkهای کشف‌شده و Fog-of-War
- Chunkهای فعال
- موقعیت و جهت Player
- Save Pointهای بازشده

World Map دارای Modal مستقل، District Label، انتخاب Save Point و Fast Travel است. سفر سریع فقط به Save Point فعال‌شده ممکن است و پیش از Teleport، Chunk مقصد را بارگذاری می‌کند.

### Save Points

Save نسخه‌دار و checksumدار شامل این داده‌هاست:

- World ID و World Version
- موقعیت Player
- Character فعال
- Chunk و District جاری
- Chunkهای کشف‌شده
- Save Pointهای بازشده
- Last Save Point

ذخیره در Save Point، Pause، Exit و Quick Save انجام می‌شود. داده‌ی دستکاری‌شده یا مربوط به نسخه‌ی جدیدتر جهان رد می‌شود.

## توسعه‌ی Chunk جدید

برای افزودن Chunk جدید:

1. یک Definition به `DemianCityManifest.js` اضافه کنید.
2. `grid`، `districtId`، `theme` و `seed` یکتا تعیین کنید.
3. Obstacle و Point of Interest را داده‌محور تعریف کنید.
4. `npm run validate:phase8` را اجرا کنید.

نیازی به تغییر `OpenWorldGame`، Renderer یا Game Loop نیست.

## کنترل‌ها

- `WASD` یا Arrow: حرکت
- `Shift`: دویدن
- `Enter`: تعامل
- `M`: نقشه جهان
- `F6`: Quick Save
- `F / R`: دوربین
- `Esc`: Pause

## تست و تحویل

```bash
npm run test:js
npm run validate:phase3
npm run validate:phase4
npm run validate:phase5
npm run validate:phase6
npm run validate:phase7
npm run validate:phase8
npm run build
php artisan test
```
