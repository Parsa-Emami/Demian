# گزارش جامع فاز پنجم — Hide & Seek

## ۱. هدف فاز

فاز پنجم نخستین بازی چندعاملِ کامل روی زیرساخت مشترک Demian است. هدف صرفاً افزودن یک مینی‌گیم نبود؛ این فاز باید ثابت می‌کرد معماری فازهای قبل می‌تواند هم‌زمان چرخه‌ی مسابقه، چند شخصیت، هوش مصنوعی، مخفیگاه، دید، برخورد، تعامل، مسیر‌یابی، HUD و ذخیره‌ی آمار را بدون ایجاد Renderer یا Loop جدید مدیریت کند.

خروجی این فاز یک Hide & Seek تک‌نفره‌ی کامل و قطعی است که هسته‌ی آن برای اتصال آینده به سرور authoritative طراحی شده است.

## ۲. اصول معماری

پیاده‌سازی به سه مرز اصلی تقسیم شده است:

1. **Domain / Match Core**: قوانین مسابقه، نقش‌ها، زمان، امتیاز، Tag، مخفیگاه و پروتکل؛ مستقل از Three.js، DOM و Laravel.
2. **Simulation Adapters**: هوش مصنوعی، Collision، Interaction، Navigation و Visibility؛ متصل به سرویس‌های مشترک ولی قابل تست با آداپترهای ساده.
3. **Presentation**: صحنه‌ی Three.js، HUD، کنترل موبایل و افکت‌ها؛ فقط مصرف‌کننده‌ی Snapshot دامنه است.

این جداسازی امکان تست مستقیم قوانین، جایگزینی Renderer و افزودن WebSocket یا سرور authoritative را بدون بازنویسی Match Core فراهم می‌کند.

## ۳. ساختار ماژول

```text
resources/js/game/games/hide-and-seek/
├── HideAndSeekGame.js
├── ai/
│   ├── HiderBrain.js
│   ├── SearchMemory.js
│   └── SeekerBrain.js
├── config/
│   └── HideAndSeekConfig.js
├── maps/
│   └── CafeHideMap.js
├── match/
│   ├── MatchDirector.js
│   ├── MatchProtocol.js
│   ├── MatchState.js
│   ├── RoleAssigner.js
│   └── RoundTimer.js
├── persistence/
│   └── HideAndSeekStatsStore.js
├── render/
│   └── HideAndSeekRenderer.js
├── systems/
│   ├── HideSpotSystem.js
│   ├── ScoreSystem.js
│   ├── TagSystem.js
│   └── VisibilitySystem.js
└── ui/
    └── HideAndSeekHud.js
```

## ۴. چرخه‌ی مسابقه

`MatchDirector` مرجع یگانه‌ی وضعیت مسابقه است و گذارهای زیر را مدیریت می‌کند:

```text
LOBBY
  → ROLE_REVEAL
  → HIDING_COUNTDOWN
  → SEEKING
  → ROUND_END
  → RESULTS
```

ویژگی‌های مهم:

- تمام زمان‌ها از Fixed Timestep مشترک دریافت می‌شوند.
- گذارها صریح و قابل اعتبارسنجی‌اند.
- پایان زودهنگام هنگامی رخ می‌دهد که همه‌ی Hiderها حذف شوند.
- پایان زمانی هنگامی رخ می‌دهد که زمان Seeking تمام شود.
- Snapshotهای خروجی immutable هستند.
- نتیجه‌ی مسابقه از طریق lifecycle عمومی `completeGame` به Results Screen منتقل می‌شود.

## ۵. نقش‌ها

نقش‌ها به‌صورت داده‌ی دامنه تعریف شده‌اند و به رندر وابسته نیستند:

- `HIDER`
- `SEEKER`
- `SPECTATOR`
- `ELIMINATED`

`RoleAssigner` با Seed یکسان خروجی یکسان تولید می‌کند. پارامتر شروع بازی می‌تواند نقش بازیکن را به‌طور صریح تعیین کند و در حالت پیش‌فرض نقش به‌صورت قطعی و Seeded انتخاب می‌شود.

## ۶. Hide Spot System

مخفیگاه‌ها از Map Manifest تولید می‌شوند و مشخصات زیر را دارند:

- شناسه‌ی یکتای سراسری
- موقعیت و شعاع تعامل
- ظرفیت
- ضریب Concealment
- وضعیت Occupancy
- امکان ورود، خروج و Reveal گروهی

سیستم ورود بیش از ظرفیت را رد می‌کند و lifecycle هر Actor را مستقل نگه می‌دارد. هنگام ورود، Collider داینامیک Actor غیرفعال و هنگام خروج دوباره فعال می‌شود تا رفتار فیزیکی با وضعیت دامنه هماهنگ بماند.

## ۷. Visibility System

قابل‌دیدبودن یک Hider فقط با فاصله تعیین نمی‌شود. امتیاز دید از چند عامل ساخته می‌شود:

- حداکثر فاصله‌ی دید
- زاویه‌ی Field of View
- Line of Sight با Raycast روی CollisionWorld
- نور محیطی نقطه‌ی هدف
- سرعت و میزان حرکت هدف
- ضریب Concealment مخفیگاه
- وضعیت Hidden/Eliminated

ترتیب بررسی‌ها از ارزان‌ترین شرط به پرهزینه‌ترین شرط است: فاصله، FOV و سپس Raycast. این ترتیب برای تعداد Actor بیشتر قابل توسعه است.

## ۸. Seeker AI

`SeekerBrain` یک ماشین حالت مستقل دارد:

```text
PATROL
SUSPICIOUS
CHASE
SEARCH
CHECK_HIDE_SPOT
RETURN_TO_PATROL
```

`SearchMemory` اطلاعات زیر را نگه می‌دارد:

- آخرین موقعیت دیده‌شده‌ی هر Actor
- زمان مشاهده
- مخفیگاه‌های بررسی‌شده
- هدف فعلی
- انقضای حافظه

اولویت تصمیم‌گیری:

1. تعقیب نزدیک‌ترین Hider قابل‌دیدن
2. جست‌وجوی آخرین موقعیت دیده‌شده
3. بررسی نزدیک‌ترین Hide Spot بررسی‌نشده
4. بازگشت به مسیر Patrol

حرکت AI با Navigation Grid و A* فاز چهارم انجام می‌شود و برخوردها از همان CollisionWorld مشترک عبور می‌کنند.

## ۹. Hider AI

`HiderBrain` مخفیگاه در دسترس را با اولویت‌های داده‌شده یا نزدیک‌ترین فاصله انتخاب می‌کند، مسیر A* می‌گیرد و پس از رسیدن به محدوده‌ی واقعی شعاع مخفیگاه درخواست ورود می‌دهد. وضعیت‌های آن عبارت‌اند از:

- `CHOOSE_SPOT`
- `MOVE_TO_SPOT`
- `HIDDEN`
- `EVADE`
- `ELIMINATED`

این AI از قوانین دامنه استفاده می‌کند و مستقیماً تغییری در HideSpotSystem ایجاد نمی‌کند؛ فقط Intent تولید می‌کند.

## ۱۰. Tag و Reveal Pulse

`TagSystem` پیش از حذف Hider موارد زیر را بررسی می‌کند:

- فاصله‌ی مجاز
- قابل‌دیدبودن هدف
- زنده و حذف‌نشده‌بودن Actor
- Cooldown

بازیکن Seeker علاوه بر Tag، اکشن `Reveal Pulse` دارد که مخفیگاه‌های نزدیک را بررسی می‌کند. این اکشن از Input Context مستقل Hide & Seek دریافت می‌شود و با کلید `R` یا کنترل موبایل اجرا می‌شود.

## ۱۱. امتیاز و ذخیره‌سازی

`ScoreSystem` امتیازها را به‌صورت مستقل برای هر Participant جمع می‌کند:

- زمان بقا
- زمان مخفی‌ماندن
- Tag موفق
- برد نقش

`HideAndSeekStatsStore` دارای Schema Version است و داده‌های خراب یا ناسازگار را پاک‌سازی می‌کند. آمار تجمعی شامل تعداد بازی، بردها، Tagها و بهترین امتیاز است.

## ۱۲. رندر و HUD

`HideAndSeekRenderer` از Renderer سراسری پروژه استفاده می‌کند و Renderer یا RAF جدید نمی‌سازد. وظایف آن:

- ساخت صحنه‌ی Top-down سه‌بعدی
- نمایش دیوارها، موانع و مخفیگاه‌ها از Map Manifest
- نمایش Participantها و نقش‌ها
- نمایش مخروط دید Seeker
- مخفی‌کردن Hider پنهان از دید بازیکن Seeker
- Dispose کامل Geometry و Materialها

HUD شامل موارد زیر است:

- وضعیت فعلی مسابقه
- نقش بازیکن
- زمان باقی‌مانده
- تعداد Hiderهای باقی‌مانده
- امتیاز
- پیام‌های Role Reveal و Round Result
- Prompt تعامل
- کنترل‌های Context-aware موبایل

## ۱۳. کنترل‌ها

### مشترک

- حرکت: `WASD` یا کلیدهای جهت
- دویدن: `Shift`
- Pause: `Escape`
- تعامل: `Enter` یا `E`

### Seeker

- Tag نزدیک: `Enter` یا `E`
- Reveal Pulse: `R`

### موبایل

- Joystick مجازی برای حرکت
- دکمه‌ی تعامل
- دکمه‌ی Reveal Pulse در نقش Seeker
- چیدمان مستقل از Tetris و Open World

## ۱۴. اتصال به پلتفرم

بازی در `GameDefinitions` به‌صورت Lazy ثبت شده و metadata آن مشخص می‌کند:

- فاز پنجم
- قابل اجرا بودن
- Landscape preference
- Match قطعی
- Network-ready
- استفاده از shared WebGL

Game Catalog اکنون سه بازی قابل اجرا دارد:

1. Open World
2. Tetris
3. Hide & Seek

ورود از Game Selection و دستگاه آرکید Open World از همان مسیر تراکنشی `launchGame` انجام می‌شود.

## ۱۵. آمادگی برای Multiplayer

این فاز شبکه‌ی واقعی اضافه نمی‌کند، اما مرزهای لازم را ایجاد کرده است:

- `MatchProtocol` برای Commandهای دارای Tick و Actor ID
- اعتبارسنجی نوع اکشن و payload
- Snapshotهای immutable و قابل serialize
- Seed و زمان‌بندی قطعی
- تفکیک Intent از اعمال authoritative
- شناسه‌های یکتای Actor، Collider و Hide Spot

برای نسخه‌ی آنلاین آینده، یک Adapter شبکه می‌تواند Commandهای client را به MatchDirector سرور ارسال و Snapshotهای authoritative را به Presentation تزریق کند.

## ۱۶. تست‌ها

مجموعه‌ی فاز پنجم موارد زیر را پوشش می‌دهد:

- تخصیص قطعی نقش
- Timer و گذارهای MatchDirector
- پایان زودهنگام مسابقه
- ظرفیت و lifecycle مخفیگاه
- Visibility، FOV و Occlusion
- اثر حرکت، نور و Concealment
- Tag، Cooldown و Score
- حافظه و تصمیم Seeker AI
- تصمیم Hider AI و شعاع مخفیگاه
- Match Protocol و Snapshot immutable
- Store نسخه‌دار
- ثبت Lazy بازی و Input Context
- مسیر معتبر تمام Spawnها تا حداقل یک Hide Spot
- تمام تست‌های Regression فازهای ۱ تا ۴

نتیجه‌ی نهایی: **۸۵ تست از ۸۵ تست موفق**.

## ۱۷. اعتبارسنجی منبع

`npm run validate:phase5` موارد زیر را بررسی می‌کند:

- Syntax تمام فایل‌های JavaScript/MJS
- اعتبار تمام importهای نسبی
- PHP lint
- صحت JSON و package scripts
- balance ساختاری CSS
- نبود وابستگی Domain به Three.js یا DOM
- ثبت کامل بازی و فایل‌های ضروری
- استفاده‌ی lockfile از رجیستری استاندارد npm

نتیجه: **۱۳۲ فایل JavaScript/MJS و ۴۱ فایل PHP بدون خطا**.

## ۱۸. محدودیت محیط تحویل

`npm ci` در sandbox تحویل به‌دلیل پاسخ 404 پروکسی داخلی محیط برای یکی از tarballهای npm متوقف شد. آدرس پروکسی در `package-lock.json` پروژه وجود ندارد و تمام URLهای lockfile روی رجیستری استاندارد npm هستند. بنابراین اجرای Vite build در همین محیط ممکن نبود، اما تست‌های Node، اعتبارسنجی import/syntax، PHP lint و بررسی ساختاری کامل اجرا شده‌اند.

## ۱۹. مسیر توسعه‌ی بعدی

معماری فعلی برای موارد زیر آماده است:

- سرور authoritative و WebSocket
- Lobby چندنفره
- Spectator mode
- چند Round و Team mode
- Mapهای بیشتر با Manifest مستقل
- AI difficulty profiles
- Replay مسابقه و تحلیل Telemetry
- Event و Role Play روی همان Match/Interaction foundation
