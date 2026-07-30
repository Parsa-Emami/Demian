# گزارش پیاده‌سازی فاز سوم Demian Game Platform

## هدف فاز

فاز سوم اولین Game Module مستقل پلتفرم را اضافه می‌کند: **Tetris**. هدف فقط نمایش یک بازی ساده نبود؛ این فاز باید معماری چندبازی فازهای اول و دوم را در یک سناریوی واقعی آزمایش کند. بنابراین Tetris با همان `WebGLRenderer`، همان `GameRuntime`، همان `InputRouter` و همان Game Shell اجرا می‌شود و هیچ loop، renderer یا listener سراسری جداگانه‌ای ایجاد نمی‌کند.

## خروجی‌های اصلی

- Tetris کامل با برد ۱۰×۲۰ و چهار ردیف مخفی Spawn
- منطق Pure JavaScript مستقل از Three.js، DOM، صدا و Laravel
- Seven-Bag قطعی با Random دارای Seed
- چرخش SRS و Wall Kick مجزا برای I و JLSTZ
- Ghost Piece، Hold Piece و صف پنج قطعه‌ی بعدی
- Soft Drop و Hard Drop با امتیاز مستقل
- DAS/ARR برای حرکت افقی استاندارد و قابل تنظیم
- Gravity مبتنی بر Level
- Lock Delay نیم‌ثانیه‌ای با سقف Reset
- Line Clear، Combo، Back-to-Back، T-Spin و Perfect Clear
- Level progression و امتیازدهی نسخه‌پذیر
- High Score و آمار تجمعی نسخه‌دار در `localStorage`
- Replay قطعی مبتنی بر Seed، fixed tick و ورودی‌های معنایی
- اجرای Replay از صفحه‌ی Results
- رندر بلوک‌ها با `THREE.InstancedMesh`
- HUD اختصاصی DOM، Next/Hold preview و کنترل لمسی اختصاصی
- Portrait preference برای Tetris و Landscape preference برای Open World
- rollback کامل جهت نمایش و resize در صورت شکست جابه‌جایی بازی

## ساختار ماژول

```text
resources/js/game/games/tetris/
├── TetrisGame.js
├── config/
│   └── TetrisConfig.js
├── domain/
│   ├── Board.js
│   ├── Piece.js
│   ├── PieceBag.js
│   ├── RotationSystem.js
│   ├── ScoringSystem.js
│   ├── SeededRandom.js
│   ├── TetrisState.js
│   └── Tetrominoes.js
├── systems/
│   ├── GravitySystem.js
│   ├── InputRepeatSystem.js
│   ├── LockDelaySystem.js
│   └── TetrisEngine.js
├── replay/
│   ├── ReplayPlayer.js
│   └── ReplayRecorder.js
├── persistence/
│   └── TetrisScoreStore.js
├── render/
│   ├── BlockPool.js
│   ├── TetrisEffects.js
│   └── TetrisRenderer.js
└── ui/
    └── TetrisHud.js
```

## مرزبندی لایه‌ها

### Domain

فایل‌های `domain/` هیچ importی از Three.js یا DOM ندارند. برد، قطعه، شکل‌ها، Random، Bag، Rotation و Scoring در این لایه قرار دارند و مستقیماً با Node.js تست می‌شوند.

### Systems

`TetrisEngine` هماهنگ‌کننده‌ی قوانین است و سیستم‌های زمان‌محور مانند Gravity، Lock Delay و Input Repeat را کنار هم قرار می‌دهد. ورودی این موتور فقط actionهای معنایی مانند `moveLeft` و `hardDrop` است؛ موتور اطلاعی از Keyboard، Touch یا HTML ندارد.

### Adapter

`TetrisGame` قرارداد `BaseGame` را پیاده می‌کند و موتور خالص را به lifecycle پلتفرم متصل می‌کند:

```js
preload → enter → startSession → fixedUpdate → update → render → exit → dispose
```

### Render

`TetrisRenderer` از Renderer مشترک پلتفرم استفاده می‌کند. بلوک‌های ثابت و قطعه‌ی فعال در یک `InstancedMesh` و Ghost در یک pool مجزا رندر می‌شوند. در loop بازی geometry یا material جدید ساخته نمی‌شود.

### UI

`TetrisHud` یک HUD DOM مستقل است که داخل `data-game-hud-host` mount می‌شود و هنگام `dispose()` به‌طور کامل حذف می‌شود. دکمه‌های HUD و موبایل همان event delegation و `InputRouter` پلتفرم را استفاده می‌کنند.

## مدل برد

```text
Width:        10
Visible Rows: 20
Hidden Rows:   4
Total Rows:   24
```

ردیف‌های مخفی برای Spawn و Wall Kick استفاده می‌شوند، اما رندر نمی‌شوند. `Board` مسئول این عملیات است:

- `canPlace(piece)`
- `lockPiece(piece)`
- `completedRows()`
- `clearRows(rows)`
- `ghostY(piece)`
- `isPerfectClear()`
- `isGameOver()`

## Random و Seven-Bag

هر Session یک Seed دارد. `SeededRandom` از الگوریتم قطعی Mulberry32 استفاده می‌کند و `PieceBag` در هر Bag دقیقاً یک نمونه از I، J، L، O، S، T و Z تولید می‌کند. با Seed یکسان، ترتیب قطعه‌ها یکسان باقی می‌ماند.

## Rotation

`RotationSystem` جدول‌های SRS را برای دو گروه نگه می‌دارد:

- I Piece
- J/L/S/T/Z Pieces

O Piece بدون جابه‌جایی هندسی rotation را می‌پذیرد. Rotation نتیجه‌ای شامل `success`، قطعه‌ی جدید و `kickIndex` بازمی‌گرداند؛ بنابراین Engine می‌تواند بدون mutation مستقیم نتیجه را اعمال کند.

## Timing

تمام زمان‌بندی‌ها با fixed update شصت هرتز اجرا می‌شوند:

- Lock Delay: `0.5s`
- Max Lock Resets: `15`
- DAS: `0.167s`
- ARR: `0.033s`
- Soft Drop interval: `0.033s`

Gravity از فرمول Level-based استفاده می‌کند و در سرعت‌های بالا حداقل interval برای جلوگیری از loop نامحدود دارد.

## Scoring

`ScoringSystem` موارد زیر را مستقل از Engine مدیریت می‌کند:

- Single / Double / Triple / Tetris
- T-Spin zero/single/double/triple
- Soft Drop و Hard Drop
- Combo bonus
- Back-to-Back multiplier
- Perfect Clear bonus
- Lines و Level

Scoring state snapshot immutable به Renderer و HUD داده می‌شود.

## Replay

Replay شامل این داده‌ها است:

```text
version
seed
fixedStep
events[] = { tick, input }
metadata
```

Recorder فقط زمانی event جدید ثبت می‌کند که ورودی معنایی تغییر کرده باشد؛ بنابراین نگه‌داشتن دکمه‌ها فشرده می‌شود. ReplayPlayer eventها را اعتبارسنجی و مرتب می‌کند و Engine فقط Replayهایی را می‌پذیرد که fixed step آن‌ها با runtime فعلی برابر باشد.

Replay نتیجه‌ی بازی در Results Screen نگهداری می‌شود و دکمه‌ی «بازپخش» همان بازی را با `launchGame('tetris', { replay })` دوباره اجرا می‌کند. Replayها High Score را تغییر نمی‌دهند.

## Persistence

`TetrisScoreStore` داده‌های زیر را با schema version ذخیره می‌کند:

- High Score
- Best Lines
- Best Level
- Games Played
- Total Lines

داده‌ی ناسالم یا نوع‌های نامعتبر normalize می‌شوند و نبودن Storage مانع اجرای بازی نیست.

## Input

### Desktop

```text
Left / A          Move Left
Right / D         Move Right
Down / S          Soft Drop
Space             Hard Drop
Up / X            Rotate Clockwise
Z                 Rotate Counter-clockwise
C                 Hold
Escape            Pause / Resume
```

### Mobile

Control Surface اختصاصی Tetris شامل Left، Right، Soft Drop، دو Rotation، Hold و Hard Drop است. هنگام تغییر Context، کنترل‌های Open World پنهان می‌شوند و هیچ action بازی دیگر وارد Tetris نمی‌شود.

## مدیریت جهت نمایش

جهت نمایش بخشی از Game Definition است:

```text
Menu        any
Tetris      portrait
Open World  landscape
```

`GameApplication` رویداد `game:orientation-changed` منتشر می‌کند و `MobileGameUI` براساس آن CSS fallback و Orientation Lock را اعمال می‌کند. این منطق به شناسه‌ی Tetris وابسته نیست و برای بازی‌های آینده نیز قابل استفاده است.

## رویدادهای Tetris

- `tetris:preload`
- `tetris:session-started`
- `tetris:piece-spawned`
- `tetris:piece-rotated`
- `tetris:piece-held`
- `tetris:piece-locked`
- `tetris:lines-cleared`
- `tetris:game-over`
- `tetris:replay-ready`
- `tetris:session-exited`

## تست‌ها

مجموعه‌ی کامل فاز سوم شامل ۴۸ تست موفق است. پوشش Tetris شامل موارد زیر است:

- Board lock و line clear
- Ghost landing
- Wall/floor boundaries
- Seven-Bag completeness و determinism
- SRS normal rotation، wall kick و blocked rotation
- Line scoring، Drop points، Combo، B2B و Perfect Clear
- Replay compression، playback، schema validation و اعتبارسنجی نرخ fixed-step
- Replay determinism در سطح board، active piece، queue و score
- Hold restriction
- Hard Drop و Line Clear integration
- Lock Delay
- Score persistence و data normalization
- Catalog و Lazy registration

اسکریپت‌ها:

```bash
npm run test:js
npm run validate:phase3
npm run build
```

`validate:phase3` بدون نیاز به dependencyهای build، syntax تمام فایل‌های JavaScript، importهای نسبی، فایل‌های اجباری Tetris، markerهای Blade، CSS و registration را بررسی می‌کند. خروجی کامل آخرین اجرای تست و اعتبارسنجی در `docs/PHASE-3-VALIDATION.txt` قرار دارد.

## محدودیت محیط تحویل

- `npm ci` در sandbox به دلیل 404 رجیستری داخلی محیط برای tarball مربوط به `yargs-parser@21.1.1` کامل نشد؛ URL ثبت‌شده در lockfile همچنان registry استاندارد npm است.
- به همین علت اجرای Vite build در sandbox ممکن نبود.
- پوشه‌ی `vendor/` در ورودی وجود نداشت؛ بنابراین PHPUnit/Laravel integration tests اجرا نشدند، اما تمام فایل‌های PHP با `php -l` معتبرند.

## وضعیت فاز

فاز سوم از نظر source code، معماری ماژول، gameplay، UI، persistence، replay و تست‌های خالص کامل است. فاز چهارم می‌تواند بدون تغییر Tetris روی زیرساخت Collision و Interaction برای Open World تمرکز کند.
