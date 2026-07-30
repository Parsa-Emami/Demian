# راهنمای Event Framework — فاز ۶

این ماژول یک بازی ثابت نیست؛ یک موتور داده‌محور برای ساخت رویدادهای متعدد است. کد مشترک در `resources/js/game/games/event` قرار دارد و هر رویداد از یک Definition نسخه‌دار ساخته می‌شود.

## افزودن Event جدید

1. یک فایل JSON در `definitions/` بسازید و `$schema` را به `../schemas/event-definition.schema.json` متصل کنید.
2. `id`، `revision`، زمان، Spawn، Objectiveها، Modifierها، Rewardها و Entityهای World را تعریف کنید.
3. منبع را در `EventRegistry.js` ثبت کنید. این ثبت فقط برای discovery و lazy loading است؛ منطق بازی تغییر نمی‌کند.
4. `npm run test:js` و `npm run validate:phase6` را اجرا کنید.

## Objectiveهای پشتیبانی‌شده

- `collect`: شمارش Itemهای معنایی با `item` و `amount`
- `reach`: رسیدن به Zone مشخص
- `survive`: دوام‌آوردن به مدت مشخص
- `defeat`: شکست‌دادن Enemyهای یک نوع
- `score`: رسیدن به امتیاز هدف

هر Objective می‌تواند `requires` داشته باشد. Director یک Ledger معنایی نگه می‌دارد، بنابراین پیشرفتی که پیش از بازشدن هدف رخ داده است از بین نمی‌رود. با `required: false` می‌توان هدف Bonus ساخت که مانع پایان Event نمی‌شود.

## Modifierها

- `speed`
- `low-gravity`
- `fog`
- `double-score`

Modifierها فقط Runtime Context را تغییر می‌دهند و هنگام Restart/Exit به‌صورت معکوس پاک می‌شوند.

## Rewardها

Reward Resolver از Definition و نتیجه‌ی نهایی یک Receipt ایدمپوتنت تولید می‌کند. نسخه‌ی آفلاین آن را در `EventRewardStore` نگه می‌دارد. Backend نیز Claim را با Session Token، Definition Revision، Evidence، سقف امتیاز و زمان سرور بررسی می‌کند.

## API فاز ۶

- `GET /api/v1/events`
- `GET /api/v1/events/active`
- `GET /api/v1/events/{event}`
- `POST /api/v1/events/{event}/sessions`
- `POST /api/v1/event-sessions/{eventSession}/complete`

در نسخه‌ی فعلی Integrity Level برابر `client-evidence` است. برای Multiplayer یا Leaderboard رقابتی باید سرور Tickها و Position را authoritative نگه دارد؛ این سطح نباید به‌عنوان ضدتقلب کامل معرفی شود.

## مرزهای معماری

- Domain به Three.js و DOM وابسته نیست.
- `EventGame` آداپتر lifecycle و سرویس‌های مشترک است.
- `EventRenderer` فقط نمایش را انجام می‌دهد.
- `EventHud` فقط DOM و کنترل موبایل را مدیریت می‌کند.
- Definition Loader ورودی Local یا Remote را قبل از استفاده validate و freeze می‌کند.
- Reward Claim در Backend دارای Token hash، Revision lock و unique claim per session است.

## جریان Session معتبر سمت سرور

وقتی `data-event-api-base` در Shell تنظیم باشد و API فعال پاسخ دهد، `EventGame` پیش از شروع شبیه‌سازی یک Session معتبر می‌سازد. شناسه، Seed و Revision از سرور دریافت می‌شوند و `GameApplication` آغاز Sessionهای ناهمگام را `await` می‌کند. در پایان رویداد، شناسه‌ی آیتم‌های جمع‌آوری‌شده، Zoneهای ثبت‌شده، دشمن‌های شکست‌خورده، امتیاز و زمان Active برای Claim ارسال می‌شوند.

`EventApiClient` فقط یک آداپتر شبکه است. قطع شبکه یا خطای API باعث fallback کنترل‌شده به Definition و Reward محلی می‌شود؛ AbortController نیز درخواست‌های متعلق به Session قبلی را هنگام Restart یا Exit متوقف می‌کند. سمت Laravel، Token خام فقط یک‌بار به Client داده می‌شود و مقدار SHA-256 آن ذخیره می‌گردد. Claim با قفل تراکنشی، کلید یکتای `event_session_id` و اعتبارسنجی Revision، زمان، Evidence، Objective و سقف امتیاز ایدمپوتنت است.

سطح `client-evidence` برای رویدادهای تک‌نفره و نسخه‌ی فعلی مناسب است، اما برای رقابت جایزه‌دار یا Multiplayer باید شبیه‌سازی authoritative یا امضای Replay سمت سرور به‌عنوان سطح Integrity بالاتر افزوده شود.

