# معماری رندر دوبعدی پیکسلی Demian 9

## هدف

نسخه 9 تمام خروجی قابل مشاهده‌ی Tetris، Hide & Seek، Event، Role Play و Open World را از WebGL سه‌بعدی به یک Pipeline مشترک Canvas2D منتقل می‌کند. منطق قطعی بازی، GameRuntime، InputRouter، CollisionWorld، NavigationService، AI Budget، Save Store و Chunk Streaming مستقل از Renderer باقی مانده‌اند.

## لایه‌ها

```text
GameApplication
├── GameRuntime (fixed update / update / render)
├── Domain systems (collision, navigation, interaction, save, AI)
├── World data (CafeReferenceLayout + WorldManifest)
└── Renderer Port
    └── RendererService (Canvas2D + logical backbuffer)
        ├── PixelCamera2D
        ├── CafePixelRenderer
        ├── PixelRenderQueue (layer + Y sort)
        ├── PixelActorRenderer
        └── Game-specific renderer adapters
```

## قرارداد فریم

1. `RendererService.beginFrame()` بوم منطقی کم‌رزولوشن را پاک می‌کند.
2. محیط از داده‌های مشترک کافه رسم می‌شود.
3. Markerها و Gameplay Props اضافه می‌شوند.
4. Entityها براساس `layer` و سپس مختصات `z` مرتب می‌شوند.
5. `RendererService.present()` فریم را با Nearest-Neighbor روی Canvas واقعی بزرگ می‌کند.

هیچ Renderer بازی اجازه ندارد مستقیماً به DOM، WebGL یا Three.js وابسته شود. Three.js فعلاً فقط داخل سازوکار Animation/Movement کاراکترهای قدیمی Open World باقی مانده و تصویر نهایی آن با Canvas2D رسم می‌شود.

## مختصات و مقیاس

- فضای منطقی بازی همچنان از `x/z` استفاده می‌کند.
- `PixelCamera2D` مختصات World را به `x/y` صفحه تبدیل می‌کند.
- مختصات خروجی گرد می‌شوند تا لبه‌ها روی Pixel Grid باقی بمانند.
- Backbuffer براساس نسبت صفحه ساخته می‌شود و ارتفاع مرجع آن 270 پیکسل است.
- Quality فقط رزولوشن منطقی را تغییر می‌دهد، نه قوانین بازی یا اندازه World.

## معماری Asset پیشنهادی

```text
art/source/
├── characters/<slug>/*.aseprite
├── tilesets/cafe/*.aseprite
└── maps/cafe.ldtk (یا cafe.tmj)

public/assets/pixel/
├── atlases/characters.png
├── atlases/characters.json
├── tilesets/cafe.png
└── maps/cafe.runtime.json
```

قواعد:

- Grid پایه: 16×16 یا 32×32.
- کاراکترها: حداقل Idle/Walk/Run/Interact در چهار جهت؛ برای کیفیت بالاتر هشت جهت.
- همه‌ی Sprite Sheetها با JSON Hash، Tag نام‌گذاری‌شده و Pivot ثابت خروجی گرفته شوند.
- Collision، Interaction، Spawn و Z-Layer داخل فایل Map تعریف شوند، نه در کد Renderer.
- فایل Editor مستقیماً در Runtime مصرف نشود؛ یک Build Step آن را Validate و به Runtime Manifest کم‌حجم تبدیل کند.

## مسیر توسعه بعدی

`RendererService` اکنون Port مرکزی است. اگر تعداد Spriteها، نورها و Particleها زیاد شد، یک Adapter جدید PixiJS می‌تواند همین قرارداد `beginFrame/present/resize` و داده‌های World را مصرف کند، بدون تغییر Domain یا GameRuntime. تا آن زمان Canvas2D برای نقشه کافه، تعداد محدود Entity و سازگاری بهتر مرورگر انتخاب کم‌ریسک‌تری است.

## قوانین توسعه

- هیچ منطق Gameplay داخل Renderer نوشته نشود.
- هیچ Renderer دیگری حلقه `requestAnimationFrame` نسازد.
- Entityها در هر فریم ساخته نشوند؛ State موجود رسم شود.
- ترتیب نمایش با `PixelRenderQueue` تعیین شود.
- Map/Manifest قبل از Build Validate شود.
- هر Renderer جدید باید تست کند که `three` وارد نکرده است.
- هر تغییر در WorldManifest باید Migration ذخیره یا افزایش Version داشته باشد.

## فایل‌های کلیدی

- `resources/js/game/services/RendererService.js`
- `resources/js/game/rendering2d/PixelCamera2D.js`
- `resources/js/game/rendering2d/CafePixelRenderer.js`
- `resources/js/game/rendering2d/PixelActorRenderer.js`
- `resources/js/game/games/open-world/render/OpenWorldPixelRenderer.js`
- `resources/js/game/games/open-world/data/DemianReferenceCafeManifest.js`
- `tests/js/PixelRenderingArchitecture.test.js`
