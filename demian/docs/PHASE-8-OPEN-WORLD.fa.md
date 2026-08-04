# فاز هشتم — Open World دوبعدی کافه دمیان

## هدف

Open World از یک صحنه‌ی نمایشی سه‌بعدی به یک جهان Top-Down دوبعدی، داده‌محور و قابل‌گسترش تبدیل شده است. منبع حقیقت محیط، Manifest کافه و Layout مشترک است؛ بنابراین Collision، Navigation، Renderer، Hide Spot، NPC و Save Point روی مختصات یکسان کار می‌کنند.

## معماری

```text
OpenWorldGame
├── DemianReferenceCafeManifest
├── WorldManifest / WorldPartition
├── ChunkManager
│   ├── ChunkLoader
│   ├── ChunkUnloader
│   └── OpenWorldChunkRenderer (data-only)
├── OpenWorldPixelRenderer
│   ├── PixelCamera2D
│   ├── CafePixelRenderer
│   ├── PixelRenderQueue
│   └── PixelActorRenderer
├── Collision / Navigation / Interaction
├── AiBudgetScheduler / WorldDiscovery
├── SavePointSystem / OpenWorldSaveStore
└── OpenWorldHud
    ├── MiniMap
    └── WorldMap
```

## Manifest کافه

`DemianReferenceCafeManifest.js` شامل موارد زیر است:

- ۱۲ Chunk در شبکه‌ی ۴×۳
- چهار District: ورودی، پیشخوان، لانژ و آرکید
- چهار Save Point
- Spawn معتبر در ورودی کافه
- Bounds برابر با Layout مرجع کافه
- Obstacleهای استخراج‌شده از `CAFE_STATIC_COLLIDERS`

`DemianCityManifest.js` فقط یک Alias سازگار با نسخه‌های قبلی است و همان Manifest کافه را Export می‌کند. در نتیجه هیچ مسیر قدیمی نمی‌تواند دوباره شهر نئونی قبلی را وارد بازی کند.

## Chunk Streaming

`ChunkManager` از Renderer مستقل است و این مسئولیت‌ها را دارد:

- اولویت‌دادن به Chunk فعال
- Preload همسایه‌ها
- محدودیت Concurrency
- لغو درخواست منسوخ با `AbortController`
- Promotion و Demotion بدون ساخت مجدد داده
- محدودیت تعداد Chunkهای حافظه
- تخلیه‌ی Collider و Navigation Blocker هنگام Unload

`OpenWorldChunkRenderer` Mesh تولید نمی‌کند و فقط Handleهای داده‌ای Lifecycle را نگه می‌دارد. رسم واقعی محیط در `OpenWorldPixelRenderer` انجام می‌شود.

## رندر بدون صفحه خالی

ترتیب ورود Open World به‌صورت زیر است:

1. Canvas2D و `OpenWorldPixelRenderer` ساخته می‌شوند.
2. یک فریم مستقیم از کافه قبل از API، Sprite و Chunkهای سنگین رسم می‌شود.
3. Chunkهای اطراف Spawn آماده می‌شوند.
4. کاراکترها بارگذاری می‌شوند.
5. اگر Atlas یا Sprite در دسترس نباشد، `CharacterManager` یک کاراکتر پیکسلی Fallback می‌سازد و اجرای Map متوقف نمی‌شود.
6. Runtime کنترل فریم‌های بعدی را به دست می‌گیرد.

بنابراین خرابی Character API یا فایل تصویر نمی‌تواند محیط کافه را سفید یا خالی کند.

## مختصات معتبر

- Spawn اصلی: `{ x: 0, z: 14.2 }`
- Spawnهای Hide & Seek خارج از Colliderها قرار دارند.
- شناسه‌های Hide Spot با شناسه Collider تکراری نیستند.
- NPC روناک به نقطه قابل‌دسترسی سمت بیرونی پیشخوان منتقل شده است.
- تست Navigation تضمین می‌کند Player از Spawn به همه NPCهای Role Play مسیر دارد.

## ذخیره و سفر سریع

Save شامل این داده‌هاست:

- World ID و Version
- Character فعال
- موقعیت Player
- Chunk و District جاری
- Chunkهای کشف‌شده
- Save Pointهای بازشده
- آخرین Save Point

قبل از Fast Travel، Chunk مقصد آماده می‌شود و سپس موقعیت Player تغییر می‌کند.

## فایل‌های کلیدی

- `resources/js/game/games/open-world/OpenWorldGame.js`
- `resources/js/game/games/open-world/data/DemianReferenceCafeManifest.js`
- `resources/js/game/games/open-world/render/OpenWorldPixelRenderer.js`
- `resources/js/game/shared/cafe/CafeReferenceLayout.js`
- `resources/js/game/shared/cafe/CafeEnvironmentContract.js`
- `tests/js/open-world/OpenWorldRendering.test.js`
- `tests/js/open-world/WorldManifest.test.js`
- `tests/js/CafeEnvironmentIntegration.test.js`
