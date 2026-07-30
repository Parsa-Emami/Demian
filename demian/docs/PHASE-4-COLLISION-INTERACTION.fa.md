# فاز چهارم Demian Game Platform — Collision, Interaction و Navigation

## هدف فاز

فاز چهارم زیرساخت مشترک دنیای قابل تعامل را برای بازی‌های Open World، Hide and Seek، Event و Role Play ایجاد می‌کند. این فاز عمداً Physics Engine سنگین اضافه نمی‌کند؛ چون سبک دوبعدی/سه‌بعدی فعلی با Colliderهای دایره‌ای و AABB، Spatial Hash و Raycast دوبعدی، سریع‌تر و قابل‌کنترل‌تر اجرا می‌شود.

خروجی این فاز روی معماری فازهای قبلی ساخته شده و Renderer، Game Loop، InputRouter و lifecycle بازی‌ها را تکثیر نمی‌کند.

## خروجی‌های اصلی

- `CollisionWorld` سراسری با Scopeهای مستقل برای هر Game Session
- Spatial Hash با cell size قابل تنظیم
- Colliderهای `static`، `dynamic` و `trigger`
- Shapeهای `circle` و `aabb`
- Layer و Mask برای فیلتر برخورد
- حرکت دایره‌ای زیرمرحله‌ای با حل penetration و slide
- جلوگیری از tunneling در سرعت‌های بالا
- Raycast با نزدیک‌ترین برخورد، normal، point و exclusion
- Trigger lifecycle شامل `enter`، `stay` و `exit`
- `InteractionService` مستقل از DOM و Three.js
- انتخاب Interactable با فاصله، اولویت، جهت نگاه و occlusion
- جلوگیری از اجرای هم‌زمان چند Interaction برای یک Actor
- Prompt DOM مستقل و قابل Dispose
- `NavigationGrid` با A*، هزینه‌ی سلول، dynamic blocker و path smoothing
- اتصال NPCها به مسیر‌یابی Grid
- Collider واقعی برای تمام کاراکترهای Player و NPC
- Collider و Interactable واقعی برای دستگاه‌های آرکید
- اجرای Tetris از کابین آرکید داخل Open World
- Trigger واقعی برای سه District جهان
- کنترل دسکتاپ و موبایل برای Interaction

## ساختار پوشه‌ها

```text
resources/js/game/shared/
├── collision/
│   ├── Collider.js
│   ├── CollisionLayers.js
│   ├── CollisionMath.js
│   ├── CollisionWorld.js
│   └── SpatialHash.js
│
├── interaction/
│   ├── InteractionService.js
│   └── ui/
│       └── InteractionPrompt.js
│
└── navigation/
    ├── NavigationGrid.js
    ├── NavigationService.js
    └── PriorityQueue.js
```

Manifest جهان در این فایل قرار دارد:

```text
resources/js/game/world/OpenWorldManifest.js
```

## تصمیم معماری: سرویس Singleton با Scope تراکنشی

`GameApplication` فقط یک نمونه از سرویس‌های زیر می‌سازد:

```text
CollisionWorld
InteractionService
NavigationService
```

اما هر بازی از سرویس، Scope مخصوص خودش را دریافت می‌کند:

```js
const collisionScope = collision.createScope('open-world');
const interactionScope = interaction.createScope('open-world');
const navigationScope = navigation.createScope('open-world');
```

این طراحی برای جابه‌جایی تراکنشی بازی‌ها ضروری است. هنگام بارگذاری بازی جدید، Scope بازی قبلی هنوز فعال می‌ماند. اگر `preload()` یا `enter()` بازی جدید شکست بخورد، Scope جدید Dispose می‌شود و بازی قبلی بدون بازسازی Collision یا Navigation ادامه می‌یابد.

## CollisionWorld

### انواع Collider

```text
static   دیوار، دستگاه، میز، مرز جهان

dynamic  بازیکن، NPC، اشیای متحرک

trigger  منطقه، ورودی مخفیگاه، Event Zone
```

### Shapeها

```text
circle
AABB
```

Circle برای کاراکترها مناسب است؛ چون حرکت نرم‌تر و slide طبیعی‌تری اطراف گوشه‌ها ایجاد می‌کند. AABB برای محیط آرکید و دیوارها ساده و سریع است.

### Spatial Hash

هر Collider فقط در Cellهایی که AABB آن پوشش می‌دهد ثبت می‌شود. Query قبل از Narrow Phase فقط Colliderهای Cellهای نزدیک را برمی‌گرداند. نتیجه‌ی Query با `Set` deduplicate می‌شود تا Collider بزرگ چندبار بررسی نشود.

عملیات اصلی:

```js
hash.insert(collider);
hash.update(collider);
hash.remove(colliderId);
hash.query(aabb);
```

### حرکت و حل برخورد

حرکت Dynamic Circle به زیرگام‌های کوچک تقسیم می‌شود. در هر زیرگام:

1. موقعیت Incremental اعمال می‌شود.
2. Spatial Hash موانع نزدیک را پیدا می‌کند.
3. عمیق‌ترین penetration محاسبه می‌شود.
4. Circle به بیرون مانع منتقل می‌شود.
5. مؤلفه‌ی مماسی حرکت حفظ می‌شود.
6. Velocity محور مسدودشده صفر می‌شود.

استفاده از زیرگام تجمعی مهم است. نسخه‌ی اولیه‌ی تست، interpolation مطلق را آشکار کرد که می‌توانست پس از برخورد، Actor را در گام بعدی آن‌طرف دیوار قرار دهد. الگوریتم به Incremental Sub-step اصلاح شد و تست tunneling به مجموعه اضافه شد.

### Layer و Mask

Layerهای پایه:

```text
WORLD
CHARACTER
TRIGGER
INTERACTABLE
SENSOR
```

هر Collider فقط با Layerهایی برخورد می‌کند که در Mask خودش مجاز شده‌اند. Triggerها با Character تماس دارند اما حرکت را مسدود نمی‌کنند.

### Raycast

Raycast روی Circle و AABB کار می‌کند و نزدیک‌ترین Hit را برمی‌گرداند:

```js
{
    fraction,
    point,
    normal,
    collider
}
```

قابلیت‌ها:

- فیلتر Layer
- فیلتر Type
- exclude چند Collider
- predicate سفارشی
- انتخاب نزدیک‌ترین برخورد

## Trigger Lifecycle

هر Actor مجموعه‌ی Triggerهای Frame قبل را نگه می‌دارد. نتیجه‌ی Frame جدید با آن مقایسه می‌شود:

```text
جدید در مجموعه      enter
در هر دو مجموعه     stay
حذف‌شده از مجموعه   exit
```

رویدادهای مشترک:

```text
collision:trigger-enter
collision:trigger-stay
collision:trigger-exit
```

سه District جهان فعلی Trigger واقعی دارند:

- NEON BAY
- DEMIAN CORE
- TURBO LANE

## InteractionService

Interaction از Collision جدا است. Collider فقط حضور فیزیکی را مدیریت می‌کند و Interactable رفتار و متن را تعریف می‌کند.

هر Interactable شامل این داده‌ها است:

```js
{
    id,
    position,
    radius,
    label,
    hint,
    priority,
    facingWeight,
    minimumFacing,
    requireLineOfSight,
    occluderId,
    metadata,
    action
}
```

### انتخاب Candidate

برای هر Actor:

1. Range test
2. Facing test
3. Priority score
4. Distance score
5. Raycast occlusion
6. انتخاب بهترین Candidate

Collider خود دستگاه از Raycast مستثنا می‌شود تا دستگاه، Interaction خودش را Occlude نکند.

### جلوگیری از Race Condition

برای هر Actor فقط یک Action هم‌زمان اجرا می‌شود. تا Promise قبلی تمام نشده باشد، Interaction بعدی `false` برمی‌گرداند.

### Prompt

`InteractionPrompt` تنها Adapter وابسته به DOM است. Domain تعامل هیچ وابستگی به DOM ندارد. Prompt:

- داخل `data-game-hud-host` mount می‌شود.
- فقط در Session بازی نمایش داده می‌شود.
- با Settings مربوط به Hint مخفی می‌شود.
- هنگام Pause، Menu، Exit و Dispose پاک می‌شود.
- متن را فقط با `textContent` قرار می‌دهد.

## Navigation Grid

### Cell Typeها

```text
walkable
blocked
slow
door
danger
interactable
```

هزینه‌ها قابل تنظیم‌اند. `blocked` هزینه‌ی بی‌نهایت دارد، در حالی که `slow` و `danger` قابل عبور اما گران‌تر هستند.

### A*

پیاده‌سازی A* شامل این موارد است:

- Priority Queue مبتنی بر Binary Heap
- Octile heuristic در حالت diagonal
- جلوگیری از diagonal corner cutting
- weighted cells
- سقف iteration
- nearest walkable برای start/goal مسدود
- path reconstruction
- line-of-sight smoothing

### Rasterization

Colliderهای Static به Grid تبدیل می‌شوند. Circle و AABB با padding شعاع کاراکتر Rasterize می‌شوند تا مسیر NPC از لبه‌ی مانع فاصله‌ی امن داشته باشد.

### Dynamic Blocker

Grid از blockerهای موقتی پشتیبانی می‌کند. این قابلیت برای Crowd، در بسته، Event Object و Hide Spot رزروشده آماده شده است.

## اتصال به کاراکترها

`SpriteCharacter` دیگر مستقیماً مالک Collision نیست. یک Movement Resolver تزریق می‌شود:

```js
entity.setMovementResolver(resolver, { radius });
```

این Adapter باعث می‌شود SpriteCharacter همچنان در تست یا بازی بدون Collision قابل استفاده باشد.

`CharacterManager` مسئول این موارد است:

- ثبت Dynamic Collider هر Entity
- sync موقعیت Collider هنگام تعویض کاراکتر
- حذف Collider هنگام prune یا dispose
- به‌روزرسانی Triggerهای Player
- ارائه‌ی forward جهت Interaction

## اتصال به NPC

`NpcBrain` یک `NavigationGrid` اختیاری دریافت می‌کند. در Open World:

- Target تصادفی انتخاب می‌شود.
- A* مسیر ایجاد می‌کند.
- NPC waypointها را دنبال می‌کند.
- مسیر دوره‌ای rebuild می‌شود.
- Crowd separation نزدیک همچنان حفظ شده است.
- اگر Grid وجود نداشته باشد، رفتار مستقیم قبلی حفظ می‌شود.

## World Manifest

موقعیت دستگاه آرکید، Collider و Interaction از یک منبع داده‌ی مشترک تولید می‌شود. بنابراین Sprite بصری و Collider از هم جدا نمی‌شوند.

`OpenWorldManifest` این داده‌ها را ایجاد می‌کند:

- Cabinet definitions
- Static collider definitions
- District trigger definitions
- Game binding هر Cabinet

تعداد Cabinet براساس `decorDensity` تعیین می‌شود اما خروجی برای ورودی یکسان کاملاً deterministic است.

## دستگاه‌های آرکید

نزدیک‌شدن به هر دستگاه Prompt ایجاد می‌کند. تعامل با دستگاه:

- Tetris: بازی را Lazy Launch می‌کند.
- Open World: وضعیت فعلی را اعلام می‌کند.
- بازی‌های آینده: Phase فعال‌سازی را نشان می‌دهد.

هر دو مسیر انتخاب بازی به فرمان واحد می‌رسند:

```js
gameApplication.launchGame(gameId, params);
```

## Input

Desktop:

```text
Enter   Interact
```

Mobile:

```text
USE     Interact
```

Action معنایی جدید:

```js
interact: pressed('enter', 'interact')
```

## تست‌ها

مجموعه‌ی نهایی شامل ۶۵ تست موفق است. تست‌های جدید فاز چهارم موارد زیر را پوشش می‌دهند:

- Spatial Hash insertion، update، deduplication و cleanup
- جلوگیری از tunneling
- slide روی AABB
- Dynamic circle separation
- nearest raycast و exclusion
- Trigger enter/stay/exit
- Scope isolation و disposal
- Interaction priority، distance و facing
- Interaction occlusion
- target-own-occluder exclusion
- Action concurrency lock
- Interaction scope cleanup
- جلوگیری از Prompt برای هدف پشت Actor
- A* حول مانع
- diagonal corner prevention
- weighted danger cells
- dynamic blockers
- path smoothing
- deterministic world manifest

فرمان‌ها:

```bash
npm run test:js
npm run validate:phase3
npm run validate:phase4
npm run build
```

`validate:phase4` موارد زیر را بررسی می‌کند:

- syntax تمام JavaScript و MJSها
- importهای نسبی
- فایل‌های اجباری فاز چهارم
- استقلال Domain از Three.js و DOM
- نبود TODO، FIXME، debugger و console.log
- ثبت Singleton serviceها در GameApplication
- اتصال OpenWorld، Character و NPC
- Input و Mobile UI
- CSS balance
- package scripts
- نبود mirror خصوصی در lockfile
- PHP syntax

## وضعیت build در محیط تحویل

`npm ci` در sandbox روی پاسخ 404 رجیستری داخلی محیط برای `yargs-parser@21.1.1` متوقف شد. `package-lock.json` هیچ URL مربوط به آن gateway یا mirror خصوصی ندارد و فقط registry استاندارد npm را نگه می‌دارد. بنابراین Vite build در این محیط قابل اجرا نبود؛ workflow پروژه روی GitHub Actions پس از `npm ci` این مراحل را اجرا می‌کند:

```text
npm run test:js
npm run validate:phase4
npm run build
```

پوشه‌ی `vendor` نیز در ورودی وجود نداشت؛ بااین‌حال هر ۴۱ فایل PHP با `php -l` بررسی شده است.

## آمادگی فاز پنجم

فاز پنجم Hide and Seek اکنون می‌تواند مستقیماً روی این زیرساخت ساخته شود:

- MatchDirector از Trigger Zoneها استفاده می‌کند.
- HideSpotSystem از Interactable و Trigger استفاده می‌کند.
- SeekerVisionSystem از Raycast استفاده می‌کند.
- TagSystem از Dynamic Colliderها استفاده می‌کند.
- SeekerBrain از NavigationGrid و Dynamic Blocker استفاده می‌کند.
- Mapها فقط Manifest Collider، Trigger و Interactable ارائه می‌کنند.
